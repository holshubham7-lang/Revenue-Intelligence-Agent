import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConnectorMetadata } from '../plugins/plugins.service.js';
import {
  PluginConnectionDocument,
} from '../plugin-connections/plugin-connection.schema.js';
import { PluginConnectionsService } from '../plugin-connections/plugin-connections.service.js';
import { AzureConnectionService } from './azure-connection.service.js';
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
 * Generic connector runtime. Hydrates data from any connector using either:
 *  - the Azure managed-connector runtime (catalog connectors), or
 *  - the connector's own REST API via metadata-driven OAuth.
 * It never contains provider-specific logic.
 */
@Injectable()
export class ConnectorRuntimeService {
  private readonly logger = new Logger(ConnectorRuntimeService.name);
  private readonly connectionStringCache = new Map<
    string,
    { value: string; expiresAt: number }
  >();

  constructor(
    private readonly azureService: AzureConnectionService,
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
      if (input.connector.authMode === 'azure-managed') {
        result.capabilities = await this.hydrateAzureManaged(input, capabilities);
      } else if (input.connector.authMode === 'oauth') {
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

  private async hydrateAzureManaged(
    input: { connection: PluginConnectionDocument; connector: ConnectorMetadata },
    capabilities: string[],
  ): Promise<HydratedCapability[]> {
    const connection = input.connection;
    if (!connection.azureConnectionName) {
      return [];
    }

    const connectionString = await this.getConnectionString(
      connection.azureConnectionName,
    );
    const invokeUrl = await this.azureService.getInvokeUrl(
      connection.azureConnectionName,
      connectionString,
    );

    const out: HydratedCapability[] = [];
    for (const capability of capabilities) {
      const paths = this.adapter
        .getCapabilityPaths(capability)
        .map((p) => ({ path: p, method: 'GET' as const }));
      const tried = await this.tryPathsAzure(
        input.connection,
        input.connector,
        invokeUrl,
        connectionString,
        capability,
        paths,
      );
      if (tried) out.push(tried);
    }
    return out;
  }

  private async tryPathsAzure(
    _connection: PluginConnectionDocument,
    connector: ConnectorMetadata,
    invokeUrl: string,
    connectionString: string,
    capability: string,
    candidates: Array<{ path: string; method: 'GET' | 'POST' }>,
  ): Promise<HydratedCapability | undefined> {
    for (const candidate of candidates) {
      try {
        const raw = await this.azureService.invokeConnector({
          invokeUrl,
          connectionString,
          path: candidate.path,
          method: candidate.method,
          connectorName: connector.slug,
        });
        const records = this.adapter.extractRecords(raw);
        if (records.length === 0) continue;
        return { capability, records, path: candidate.path };
      } catch (error) {
        this.logger.debug(
          `Azure path ${candidate.path} failed for ${connector.slug}: ${
            (error as Error).message
          }`,
        );
      }
    }
    return undefined;
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
   * Never touches Azure; never exposes secrets.
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

  /**
   * Revokes access at the source: Azure managed connection is deleted,
   * metadata-driven connectors get a best-effort revoke call. Then the
   * connection is finalized locally (tokens wiped, status revoked).
   */
  async revokeConnection(input: {
    connection: PluginConnectionDocument;
    connector: ConnectorMetadata;
    workspaceId: string;
    actorId?: string;
    reason?: string;
  }): Promise<void> {
    try {
      if (
        input.connector.authMode === 'azure-managed' &&
        input.connection.azureConnectionName
      ) {
        await this.azureService.deleteConnection(input.connection.azureConnectionName);
      } else if (input.connector.oauthConfig?.tokenUrl) {
        await this.revokeOauthAccess(input.connection, input.connector);
      }
    } catch (error) {
      this.logger.warn(
        `Remote revocation reported an issue: ${(error as Error).message}`,
      );
    }
    await this.connectionsService.finalizeRevoke(input.connection._id.toString(), {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      reason: input.reason,
    });
  }

  private async revokeOauthAccess(
    connection: PluginConnectionDocument,
    connector: ConnectorMetadata,
  ): Promise<void> {
    const { accessToken, refreshToken } =
      await this.connectionsService.getDecryptedTokens(connection);
    const reachable = (connector.oauthConfig?.tokenUrl ?? '')
      .replace(/token$/, 'revoke')
      .replace(/token\?/, 'revoke?');
    if (!reachable || !accessToken) return;

    const body = new URLSearchParams({
      token: refreshToken ?? accessToken,
      ...(connector.oauthConfig?.clientId
        ? { client_id: connector.oauthConfig.clientId }
        : {}),
      ...(this.resolveClientSecret(connector)
        ? { client_secret: this.resolveClientSecret(connector) }
        : {}),
    });
    await fetch(reachable, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(30000),
    }).catch(() => undefined);
  }

  private async getConnectionString(connectionName: string): Promise<string> {
    const cached = this.connectionStringCache.get(connectionName);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = await this.azureService.getRuntimeConnectionString(connectionName);
    this.connectionStringCache.set(connectionName, {
      value,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    return value;
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