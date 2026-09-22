import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DefaultAzureCredential } from '@azure/identity';

const ARM_SCOPE = 'https://management.azure.com/.default';
const API_VERSION = '2016-06-01';

const SUBSCRIPTIONS_URL =
  'https://management.azure.com/subscriptions?api-version=2020-01-01';

/**
 * Generic Azure managed-connector client ("Path A"). All catalog (foundry)
 * connectors authenticate through this flow; connector-specific concerns are
 * expressed only via the catalog metadata (connector name, scopes).
 *
 * The service identity used here is the platform's own identity (App Service
 * managed identity in Azure, DefaultAzureCredential locally) — it is never
 * the end user's identity, and it never touches connector credentials.
 */
@Injectable()
export class AzureConnectionService {
  private readonly logger = new Logger(AzureConnectionService.name);
  private readonly credential = new DefaultAzureCredential();
  private cachedSubscriptionId: string | undefined;
  private cachedToken: { token: string; expiresAt: number } | undefined;

  constructor(private readonly config: ConfigService) {}

  private get location(): string {
    return this.config.get<string>('AZURE_CATALOG_LOCATION') ?? 'centralus';
  }

  private async getToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 5 * 60 * 1000) {
      return this.cachedToken.token;
    }
    const auth = await this.credential.getToken(ARM_SCOPE);
    if (!auth?.token) {
      throw new ServiceUnavailableException(
        'Platform identity could not acquire an Azure management token',
      );
    }
    this.cachedToken = { token: auth.token, expiresAt: auth.expiresOnTimestamp };
    return auth.token;
  }

  private async resolveSubscriptionId(): Promise<string> {
    if (this.cachedSubscriptionId) return this.cachedSubscriptionId;
    const explicit = this.config.get<string>('AZURE_SUBSCRIPTION_ID');
    if (explicit?.trim()) {
      this.cachedSubscriptionId = explicit.trim();
      return this.cachedSubscriptionId;
    }
    const token = await this.getToken();
    const response = await fetch(SUBSCRIPTIONS_URL, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000),
    });
    const payload = (await response.json()) as {
      value?: Array<{ subscriptionId?: string }>;
    };
    const sub = payload.value?.[0]?.subscriptionId;
    if (!sub) {
      throw new ServiceUnavailableException(
        'No accessible Azure subscription for connector provisioning',
      );
    }
    this.cachedSubscriptionId = sub;
    return sub;
  }

  async listConsentLinks(input: {
    connectorName: string;
    scopes?: string[];
    redirectUri: string;
    clientId?: string;
  }): Promise<{ consentLinkUri: string; connectionRuntimeUrl?: string }> {
    const token = await this.getToken();
    const subscriptionId = await this.resolveSubscriptionId();
    const clientId =
      input.clientId ??
      this.config.get<string>('AZURE_CONNECTOR_CLIENT_ID') ??
      '';
    const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Web/locations/${this.location}/managedApis/${input.connectorName}/listConsentLinks?api-version=${API_VERSION}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parameters: {
          token: {
            parameterType: 'oauthSetting',
            oAuthSettings: {
              clientId,
              scopes: input.scopes?.length ? input.scopes : ['openid'],
              redirectUrl: input.redirectUri,
              properties: {},
            },
          },
        },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ServiceUnavailableException(
        `Azure consent link failed (${response.status}): ${body.slice(0, 200)}`,
      );
    }
    const payload = (await response.json()) as {
      value?: Array<{
        consentLinkUri?: string;
        connectionRuntimeUrl?: string;
      }>;
    };
    const link = payload.value?.[0];
    if (!link?.consentLinkUri) {
      throw new ServiceUnavailableException(
        'Azure returned no consent link for this connector',
      );
    }
    return {
      consentLinkUri: link.consentLinkUri,
      connectionRuntimeUrl: link.connectionRuntimeUrl,
    };
  }

  /**
   * Creates the Microsoft.Web/connections resource handed back by the consent
   * flow. Returns the runtime URL the platform will use to invoke the API.
   */
  async provisionConnection(input: {
    connectorName: string;
    connectionName: string;
    consentCode: string;
    connectionRuntimeUrl?: string;
  }): Promise<{ connectionRuntimeUrl: string; eastRegion?: string }> {
    const token = await this.getToken();
    const subscriptionId = await this.resolveSubscriptionId();
    const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Web/locations/${this.location}/connections/${input.connectionName}?api-version=${API_VERSION}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          api: {
            id: `/subscriptions/${subscriptionId}/providers/Microsoft.Web/locations/${this.location}/managedApis/${input.connectorName}`,
          },
          parameterValues: {
            token: {
              type: 'oauthToken',
              value: input.consentCode,
            },
          },
          connectionRuntimeUrl:
            input.connectionRuntimeUrl ?? input.connectionRuntimeUrl ?? '',
        },
        location: this.location,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ServiceUnavailableException(
        `Azure connection provisioning failed (${response.status}): ${body.slice(0, 200)}`,
      );
    }
    const payload = (await response.json()) as {
      properties?: { connectionRuntimeUrl?: string };
    };
    return { connectionRuntimeUrl: payload.properties?.connectionRuntimeUrl ?? '' };
  }

  /** Returns the runtime connection string used to invoke the connector API. */
  async getRuntimeConnectionString(connectionName: string): Promise<string> {
    const token = await this.getToken();
    const subscriptionId = await this.resolveSubscriptionId();
    const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Web/locations/${this.location}/connections/${connectionName}/listKeys?api-version=${API_VERSION}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Unable to read runtime connection string (${response.status})`,
      );
    }
    const payload = (await response.json()) as {
      connectionKey?: { connectionString?: string };
    };
    if (!payload.connectionKey?.connectionString) {
      throw new ServiceUnavailableException(
        'Azure returned no connection string for this connection',
      );
    }
    return payload.connectionKey.connectionString;
  }

  /** Resolves the anonymous API-hub invoke URL for a provisioned connection. */
  async getInvokeUrl(
    connectionName: string,
    connectionString: string,
  ): Promise<string> {
    const token = await this.getToken();
    const subscriptionId = await this.resolveSubscriptionId();
    const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Web/locations/${this.location}/connections/${connectionName}/listCallbackUrl?api-version=${API_VERSION}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ connectionString, kind: 'calculated' }),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ServiceUnavailableException(
        `Unable to resolve connector invoke URL (${response.status}): ${body.slice(0, 200)}`,
      );
    }
    const payload = (await response.json()) as { value?: string };
    if (!payload.value) {
      throw new ServiceUnavailableException(
        'Azure returned no invoke URL for this connection',
      );
    }
    return payload.value;
  }

  async deleteConnection(connectionName: string): Promise<void> {
    try {
      const token = await this.getToken();
      const subscriptionId = await this.resolveSubscriptionId();
      const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Web/locations/${this.location}/connections/${connectionName}?api-version=${API_VERSION}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) {
        this.logger.warn(
          `Azure connection deletion returned ${response.status}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Azure connection deletion failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Invokes a connector operation through the API-hub runtime. Fully generic —
   * the connector and operation come from catalog metadata.
   */
  async invokeConnector(input: {
    invokeUrl: string;
    connectionString: string;
    path: string;
    method?: 'GET' | 'POST';
    payload?: unknown;
    connectorName: string;
  }): Promise<unknown> {
    const url = new URL(input.invokeUrl);
    const trackingId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const response = await fetch(`${url.origin}${url.pathname}`, {
      method: 'POST',
      headers: {
        Host: url.host,
        Authorization: `Bearer ${input.connectionString}`,
        'Content-Type': 'application/json',
        'X-Ms-Client-Tracking-Id': trackingId,
      },
      body: JSON.stringify({
        method: input.method ?? 'GET',
        path: input.path,
        url: '/',
        quotaTags: { type: 'shared' },
        nv: {},
        requestBody: input.payload ?? {},
        connectorName: input.connectorName,
      }),
      signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ServiceUnavailableException(
        `Connector invoke failed (${response.status}): ${body.slice(0, 200)}`,
      );
    }
    return response.json();
  }
}