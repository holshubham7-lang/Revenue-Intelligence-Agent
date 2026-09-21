import { Injectable, Logger } from '@nestjs/common';
import { DefaultAzureCredential } from '@azure/identity';

const ARM = 'https://management.azure.com';
const API_VERSION = '2016-06-01';

export interface AzureConnectionDetails {
  overallStatus?: string;
  connectionId?: string;
  displayName?: string;
  authenticatedUser?: string;
  statuses?: unknown;
}

/**
 * Creates and manages Microsoft.Web/connections resources for the connector
 * catalog. Azure owns the OAuth handshake (consent + token storage); this
 * service only provisions the connection and reads back its state.
 */
@Injectable()
export class AzureConnectionService {
  private readonly logger = new Logger(AzureConnectionService.name);
  private readonly credential = new DefaultAzureCredential();
  private subscriptionId: string | undefined;
  private tokenCache: { value: string; expiresAt: number } | null = null;

  private get resourceGroup(): string {
    return process.env.AZURE_CONNECTIONS_RESOURCE_GROUP ?? 'stratvedaos_group';
  }

  private get location(): string {
    return process.env.AZURE_CATALOG_LOCATION ?? 'centralus';
  }

  private async token(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now + 60_000) {
      return this.tokenCache.value;
    }
    const result = await this.credential.getToken(
      'https://management.azure.com/.default',
    );
    const value = result?.token ?? '';
    this.tokenCache = {
      value,
      expiresAt: result?.expiresOnTimestamp ?? now + 5 * 60 * 1000,
    };
    return value;
  }

  private async subscription(): Promise<string> {
    if (this.subscriptionId) return this.subscriptionId;
    if (process.env.AZURE_SUBSCRIPTION_ID) {
      this.subscriptionId = process.env.AZURE_SUBSCRIPTION_ID.trim();
      return this.subscriptionId;
    }
    const token = await this.token();
    const response = await fetch(
      `${ARM}/subscriptions?api-version=2020-01-01`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Unable to resolve Azure subscription: HTTP ${response.status}`,
      );
    }
    const payload = (await response.json()) as {
      value?: Array<{ subscriptionId?: string }>;
    };
    const sub = payload.value?.[0]?.subscriptionId;
    if (!sub) throw new Error('No accessible Azure subscription found');
    this.subscriptionId = sub;
    return sub;
  }

  private connectionBaseUrl(sub: string, connectionName: string): string {
    return (
      `${ARM}/subscriptions/${sub}/resourceGroups/${this.resourceGroup}` +
      `/providers/Microsoft.Web/connections/${connectionName}`
    );
  }

  private connectionUrl(sub: string, connectionName: string): string {
    return `${this.connectionBaseUrl(sub, connectionName)}?api-version=${API_VERSION}`;
  }

  private async armFetch(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const token = await this.token();
    return fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });
  }

  /** Creates (or updates) an empty connection bound to a managed connector. */
  async createConnection(
    connectorName: string,
    connectionName: string,
  ): Promise<void> {
    const sub = await this.subscription();
    const body = {
      location: this.location,
      properties: {
        api: {
          id: `/subscriptions/${sub}/providers/Microsoft.Web/locations/${this.location}/managedApis/${connectorName}`,
        },
      },
    };
    const response = await this.armFetch(this.connectionUrl(sub, connectionName), {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Failed to create Azure connection "${connectionName}" for "${connectorName}" (HTTP ${response.status}): ${text.slice(0, 300)}`,
      );
    }
    this.logger.log(
      `Provisioned Azure connection ${connectionName} for connector ${connectorName}`,
    );
  }

  /** Returns the Azure-hosted consent URL the user must visit. */
  async getConsentLink(
    connectionName: string,
    redirectUrl: string,
  ): Promise<string> {
    const sub = await this.subscription();
    const response = await this.armFetch(
      `${this.connectionBaseUrl(sub, connectionName)}/listConsentLinks?api-version=${API_VERSION}`,
      {
        method: 'POST',
        body: JSON.stringify({
          parameters: [{ parameterName: 'token', redirectUrl }],
        }),
      },
    );
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Failed to get consent link for "${connectionName}" (HTTP ${response.status}): ${text.slice(0, 300)}`,
      );
    }
    const payload = (await response.json()) as {
      value?: Array<{ link?: string }>;
    };
    const link = payload.value?.[0]?.link;
    if (!link) throw new Error('Azure did not return a consent link');
    return link;
  }

  async getConnection(
    connectionName: string,
  ): Promise<AzureConnectionDetails> {
    const sub = await this.subscription();
    const response = await this.armFetch(this.connectionUrl(sub, connectionName), {
      method: 'GET',
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Failed to read connection "${connectionName}" (HTTP ${response.status}): ${text.slice(0, 300)}`,
      );
    }
    const payload = (await response.json()) as {
      id?: string;
      properties?: {
        overallStatus?: string;
        connectionId?: string;
        displayName?: string;
        authenticatedUser?: string;
        statuses?: unknown;
      };
    };
    const props = payload.properties ?? {};
    return {
      overallStatus: props.overallStatus,
      connectionId: props.connectionId ?? payload.id,
      displayName: props.displayName,
      authenticatedUser: props.authenticatedUser,
      statuses: props.statuses,
    };
  }

  async deleteConnection(connectionName: string): Promise<void> {
    try {
      const sub = await this.subscription();
      const response = await this.armFetch(
        this.connectionUrl(sub, connectionName),
        { method: 'DELETE' },
      );
      if (!response.ok && response.status !== 404) {
        this.logger.warn(
          `Failed to delete Azure connection ${connectionName}: HTTP ${response.status}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to delete Azure connection ${connectionName}: ${(error as Error).message}`,
      );
    }
  }
}
