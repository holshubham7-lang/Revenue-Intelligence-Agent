import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConnectorMetadata } from '../plugins/plugins.service.js';
import {
  PluginConnectionDocument,
} from '../plugin-connections/plugin-connection.schema.js';
import { PluginConnectionsService } from '../plugin-connections/plugin-connections.service.js';
import {
  ConnectorAdapterService,
} from './connector-adapter.service.js';

export interface HydratedCapability {
  capability: string;
  records: Array<Record<string, unknown>>;
  path: string;
}

export interface HydrationResult {
  capabilities: HydratedCapability[];
  error?: string;
}

/**
 * Generic connector runtime. Hydrates data from metadata-driven OAuth
 * connectors using the connector's own REST API. It never contains
 * provider-specific logic and never exposes secrets.
 */
@Injectable()
export class ConnectorRuntimeService {
  private readonly logger = new Logger(ConnectorRuntimeService.name);

  constructor(
    private readonly adapter: ConnectorAdapterService,
    private readonly connectionsService: PluginConnectionsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Fetches raw records for each capability the connector advertises.
   */
  async hydrateFromConnector(input: {
    connection: PluginConnectionDocument;
    connector: ConnectorMetadata;
  }): Promise<HydrationResult> {
    const result: HydrationResult = { capabilities: [] };
    const capabilities =
      input.connector.capabilities.length > 0
        ? input.connector.capabilities
        : ['records'];

    try {
      if (input.connector.authMode === 'oauth') {
        result.capabilities = await this.hydrateOauth(input, capabilities);
      } else {
        result.error = `Connector "${input.connector.slug}" cannot be auto-synced (auth mode "${input.connector.authMode}").`;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Hydration failed for connector ${input.connector.slug}: ${message}`,
      );
      result.error = message;
    }

    return result;
  }

  private async hydrateOauth(
    input: { connection: PluginConnectionDocument; connector: ConnectorMetadata },
    capabilities: string[],
  ): Promise<HydratedCapability[]> {
    const { connector } = input;
    const baseUrl = (connector.oauthConfig?.baseUrl ?? '').replace(/\/+$/, '');
    if (!baseUrl) {
      throw new Error(
        `No baseUrl configured for connector "${connector.slug}"`,
      );
    }

    let accessToken = (await this.connectionsService.getDecryptedTokens(input.connection))
      .accessToken;
    if (this.isExpired(input.connection)) {
      await this.refreshAccessToken({
        connection: input.connection,
        connector,
      });
      accessToken = (await this.connectionsService.getDecryptedTokens(input.connection))
        .accessToken;
    }
    if (!accessToken) {
      throw new Error(`No valid access token for connector "${connector.slug}"`);
    }

    const out: HydratedCapability[] = [];
    for (const capability of capabilities) {
      const paths = this.adapter.getCapabilityPaths(capability);
      const hit = await this.tryPathsOauth({
        baseUrl,
        accessToken,
        capability,
        paths,
        connector,
        connection: input.connection,
      });
      if (hit) out.push(hit);
    }
    return out;
  }

  private async tryPathsOauth(input: {
    baseUrl: string;
    accessToken: string;
    capability: string;
    paths: string[];
    connector: ConnectorMetadata;
    connection: PluginConnectionDocument;
  }): Promise<HydratedCapability | undefined> {
    for (const path of input.paths) {
      try {
        const raw = await this.request(input.baseUrl, path, {
          method: 'GET',
          token: input.accessToken,
        });
        const records = this.adapter.extractRecords(raw);
        if (records.length === 0) continue;
        return { capability: input.capability, records, path };
      } catch (error) {
        this.logger.debug(
          `OAuth path ${path} failed for ${input.connector.slug}: ${
            (error as Error).message
          }`,
        );
      }
    }
    return undefined;
  }

  /**
   * Token refresh against the connector's metadata-declared token endpoint.
   * Never exposes secrets.
   */
  async refreshAccessToken(input: {
    connection: PluginConnectionDocument;
    connector: ConnectorMetadata;
  }): Promise<void> {
    const tokenUrl = input.connector.oauthConfig?.tokenUrl;
    const clientId = input.connector.oauthConfig?.clientId;
    const clientSecret = this.resolveClientSecret(input.connector);
    if (!tokenUrl || !clientId) {
      throw new Error(
        `Refresh not configured for connector "${input.connector.slug}"`,
      );
    }
    const { refreshToken } = await this.connectionsService.getDecryptedTokens(
      input.connection,
    );
    if (!refreshToken) {
      throw new Error(`No refresh token for connector "${input.connector.slug}"`);
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Token refresh failed (${response.status}): ${text.slice(0, 120)}`,
      );
    }
    const data = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
    };
    if (!data.access_token) {
      throw new Error('Token refresh returned no access token');
    }
    await this.connectionsService.persistTokens(input.connection._id.toString(), {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      tokenType: data.token_type,
      expiresInSeconds: data.expires_in,
    });
    await this.connectionsService.markLegacyUserPlugin(
      input.connection.createdBy ?? '',
      input.connector.slug,
      'connected',
    );
  }

  private isExpired(connection: PluginConnectionDocument): boolean {
    if (!connection.expiresAt) return false;
    return connection.expiresAt.getTime() <= Date.now();
  }

  private resolveClientSecret(connector: ConnectorMetadata): string | undefined {
    const ref = connector.oauthConfig?.clientSecretRef;
    if (!ref) return undefined;
    return this.config.get<string>(ref) ?? undefined;
  }

  private async request(
    baseUrl: string,
    path: string,
    options: { method: 'GET' | 'POST'; token: string; body?: unknown },
  ): Promise<unknown> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${options.token}`,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`${response.status}: ${text.slice(0, 120)}`);
    }
    return response.json();
  }
}