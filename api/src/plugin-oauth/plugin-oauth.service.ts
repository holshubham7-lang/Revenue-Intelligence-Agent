import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { PluginsService, ConnectorMetadata } from '../plugins/plugins.service.js';
import { PluginConnectionsService } from '../plugin-connections/plugin-connections.service.js';
import { PluginConsentsService } from '../plugin-consents/plugin-consents.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AzureConnectionService } from '../connector-runtime/azure-connection.service.js';
import { ConnectorRuntimeService } from '../connector-runtime/connector-runtime.service.js';
import { SyncTasksService } from '../data-sync/sync-tasks.service.js';
import { OAuthStateService } from './oauth-state.service.js';

export interface StartConnectionResult {
  status: string;
  connectionId: string;
  authUrl: string;
}

export interface CallbackResult {
  url: string;
  statusCode: number;
}

const sanitizeConnectorName = (slug: string): string =>
  slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 40);

@Injectable()
export class PluginOAuthService {
  private readonly logger = new Logger(PluginOAuthService.name);

  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly pluginsService: PluginsService,
    private readonly connectionsService: PluginConnectionsService,
    private readonly consentsService: PluginConsentsService,
    private readonly auditService: AuditService,
    private readonly azureService: AzureConnectionService,
    private readonly runtimeService: ConnectorRuntimeService,
    private readonly syncTasksService: SyncTasksService,
    private readonly oauthStateService: OAuthStateService,
    private readonly config: ConfigService,
  ) {}

  get callbackUrl(): string {
    const base = this.config.get<string>('PUBLIC_API_BASE_URL') ?? 'http://localhost:3010';
    return `${base.replace(/\/+$/, '')}/plugins/oauth/callback`;
  }

  private get frontendHost(): string {
    return this.config.get<string>('PUBLIC_FRONTEND_URL') ?? 'http://localhost:3000';
  }

  /**
   * Starts a generic, metadata-driven OAuth handshake:
   *  - metadata connectors get an authorization URL built from their
   *    declared endpoints (refresh + token lifecycle managed by the runtime);
   *  - Azure catalog connectors get an Azure consent link created through ARM.
   */
  async startConnection(
    userId: string,
    pluginSlug: string,
  ): Promise<StartConnectionResult> {
    const connector = await this.pluginsService.findConnector(pluginSlug);
    const workspaceId = await this.workspacesService.resolveForUser(userId);

    let connection = await this.connectionsService.findByWorkspaceAndSlug(
      workspaceId,
      connector.slug,
    );
    if (connection) {
      if (connection.status === 'active' || connection.status === 'pending') {
        throw new ConflictException(
          `A connection for "${connector.slug}" already exists. Disconnect it to connect again.`,
        );
      }
    }

    connection =
      connection ??
      (await this.connectionsService.create({
        workspaceId,
        connector,
        createdByUserId: userId,
        oauthRedirectUrl: this.callbackUrl,
      }));
    const connectionId = connection._id.toString();

    const state = await this.oauthStateService.create({
      workspaceId,
      connectorSlug: connector.slug,
      connectionId,
    });

    let authUrl: string;
    if (connector.authMode === 'oauth' && connector.oauthConfig?.authorizationUrl) {
      authUrl = this.buildAuthorizationUrl(connector, state.state);
    } else if (connector.authMode === 'azure-managed') {
      authUrl = await this.buildAzureConsentLink(connector, state.state);
    } else {
      throw new BadRequestException(
        `Connector "${connector.slug}" does not support OAuth connect`,
      );
    }

    return { status: 'pending', connectionId, authUrl };
  }

  /**
   * Handles the OAuth return. Consumes the state token, then:
   *  - metadata connectors: exchange `code` for tokens, store them encrypted;
   *  - Azure connectors: provision the managed connection, store its reference.
   * Consent is recorded and an initial data sync is kicked off in background.
   */
  async handleCallback(params: {
    state: string;
    code?: string;
    error?: string;
    errorDescription?: string;
  }): Promise<CallbackResult> {
    if (!params.state) {
      throw new BadRequestException('Missing OAuth state');
    }

    let stateRecord;
    try {
      stateRecord = await this.oauthStateService.consumeByState(params.state);
    } catch (error) {
      await this.auditService.record({
        workspaceId: 'unknown',
        actorId: undefined,
        action: 'failed',
        category: 'oauth',
        targetType: 'oauth_state',
        message: `OAuth callback rejected: ${(error as Error).message}`,
      });
      return this.redirectToFrontend('error', 'invalid-state');
    }

    const connection = await this.connectionsService.findById(
      stateRecord.workspaceId,
      stateRecord.connectionId,
    );
    const connector = await this.pluginsService
      .findConnector(stateRecord.connectorSlug)
      .catch(() => null);

    if (params.error || !connector) {
      await this.connectionsService.setStatus(stateRecord.connectionId, 'error');
      await this.consentsService.revoke(stateRecord.connectionId, {
        workspaceId: stateRecord.workspaceId,
        actorId: connection.createdBy,
        reason: `Provider error: ${params.error ?? 'Unknown connector'}`,
      });
      await this.auditService.record({
        workspaceId: stateRecord.workspaceId,
        actorId: connection.createdBy,
        action: 'failed',
        category: 'consent',
        targetType: 'plugin_connection',
        targetId: stateRecord.connectionId,
        message: params.error
          ? `Provider returned consent error: ${params.error}`
          : 'Connector metadata could not be resolved after consent',
        metadata: { errorDescription: params.errorDescription },
      });
      return this.redirectToFrontend('error', params.error ?? 'connector-missing');
    }

    try {
      if (connector.authMode === 'azure-managed') {
        await this.completeAzureConnection(connection._id.toString(), connector, {
          code: params.code,
          consentedBy: connection.createdBy,
          workspaceId: stateRecord.workspaceId,
        });
      } else if (connector.oauthConfig?.tokenUrl) {
        await this.completeOAuthExchange(
          connection._id.toString(),
          connector,
          {
            workspaceId: stateRecord.workspaceId,
            code: params.code ?? '',
            consentedBy: connection.createdBy ?? 'unknown',
          },
        );
      } else {
        throw new Error('No token endpoint configured for this connector');
      }

      await this.syncTasksService
      .runInitialSync({
        workspaceId: stateRecord.workspaceId,
        connectionId: connection._id.toString(),
        trigger: 'callback',
        actorId: connection.createdBy,
      })
      .catch(
        (error) => {
          this.logger.warn(
            `Initial sync after connect failed: ${(error as Error).message}`,
          );
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.connectionsService.setStatus(stateRecord.connectionId, 'error');
      await this.auditService.record({
        workspaceId: stateRecord.workspaceId,
        actorId: connection.createdBy,
        action: 'failed',
        category: 'oauth',
        targetType: 'plugin_connection',
        targetId: stateRecord.connectionId,
        message: `OAuth callback failed: ${message}`,
      });
      await this.connectionsService.markLegacyUserPlugin(
        connection.createdBy ?? '',
        connector.slug,
        'pending',
      );
      return this.redirectToFrontend('error', 'connection-failed');
    }

    return this.redirectToFrontend('success', connector.slug);
  }

  private async completeOAuthExchange(
    connectionId: string,
    connector: ConnectorMetadata,
    input: { workspaceId: string; code: string; consentedBy: string },
  ): Promise<void> {
    const config = connector.oauthConfig;
    if (!config?.tokenUrl || !config.clientId || !input.code) {
      throw new Error('OAuth exchange is not configured for this connector');
    }
    const clientSecret = config.clientSecretRef
      ? this.config.get<string>(config.clientSecretRef)
      : undefined;

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: this.callbackUrl,
      client_id: config.clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
    });

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Token exchange failed (${response.status}): ${text.slice(0, 160)}`);
    }
    const data = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
    };
    if (!data.access_token) {
      throw new Error('Token exchange returned no access token');
    }

    await this.connectionsService.persistTokens(connectionId, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenType: data.token_type,
      expiresInSeconds: data.expires_in,
    });
    await this.connectionsService.setStatus(connectionId, 'active');
    await this.connectionsService.markLegacyUserPlugin(
      input.consentedBy,
      connector.slug,
      'connected',
    );
    await this.consentsService.grant({
      workspaceId: input.workspaceId,
      connectorId: connector.slug,
      connectionId,
      givenByUserId: input.consentedBy,
      scopes: config.scope ?? connector.scopes,
    });
    await this.auditService.record({
      workspaceId: input.workspaceId,
      action: 'authorized',
      category: 'oauth',
      targetType: 'plugin_connection',
      targetId: connectionId,
      message: `OAuth authorized for connector ${connector.slug}`,
    });
  }

  private async completeAzureConnection(
    connectionId: string,
    connector: ConnectorMetadata,
    input: { workspaceId: string; code?: string; consentedBy?: string },
  ): Promise<void> {
    if (!input.code) {
      throw new Error('Azure consent flow returned no code');
    }
    const connectionName = `revops-${sanitizeConnectorName(connector.slug)}-${this.shortHash(input.consentedBy ?? '')}`;
    await this.azureService.provisionConnection({
      connectorName: connector.slug,
      connectionName,
      consentCode: input.code,
    });
    await this.connectionsService.setAzureRef(connectionId, {
      azureConnectionName: connectionName,
      azureRegion: this.config.get<string>('AZURE_CATALOG_LOCATION') ?? 'centralus',
    });
    await this.connectionsService.setStatus(connectionId, 'active');
    await this.consentsService.grant({
      workspaceId: input.workspaceId,
      connectorId: connector.slug,
      connectionId,
      givenByUserId: input.consentedBy ?? 'unknown',
      scopes: connector.scopes ?? [],
    });
    await this.auditService.record({
      workspaceId: input.workspaceId,
      actorId: input.consentedBy,
      action: 'connected',
      category: 'connection',
      targetType: 'plugin_connection',
      targetId: connectionId,
      message: `Azure-managed connection provisioned for ${connector.slug}`,
      metadata: { connectionName },
    });
  }

  private buildAuthorizationUrl(connector: ConnectorMetadata, state: string): string {
    const authorize = connector.oauthConfig?.authorizationUrl;
    if (!authorize) throw new Error('No authorization endpoint configured');
    const url = new URL(authorize);
    url.searchParams.set('client_id', connector.oauthConfig?.clientId ?? '');
    url.searchParams.set('redirect_uri', this.callbackUrl);
    url.searchParams.set('response_type', connector.oauthConfig?.responseType ?? 'code');
    const scope = connector.oauthConfig?.scope ?? connector.scopes ?? [];
    if (scope.length) url.searchParams.set('scope', scope.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'consent');
    return url.toString();
  }

  private async buildAzureConsentLink(
    connector: ConnectorMetadata,
    state: string,
  ): Promise<string> {
    const link = await this.azureService.listConsentLinks({
      connectorName: connector.slug,
      scopes: connector.scopes ?? [],
      redirectUri: this.callbackUrl,
      clientId: connector.oauthConfig?.clientId,
    });
    if (!link.consentLinkUri) {
      throw new Error('Azure consent link was empty');
    }
    const url = new URL(link.consentLinkUri);
    url.searchParams.set('state', state);
    return url.toString();
  }

  private redirectToFrontend(kind: 'success' | 'error', detail: string): CallbackResult {
    return {
      url: `${this.frontendHost}/dashboard/connected-apps?connect=${kind}&connector=${encodeURIComponent(detail)}`,
      statusCode: 302,
    };
  }

  private shortHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(36).padStart(6, '0').slice(0, 6);
  }
}