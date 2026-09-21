import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { Plugin, PluginDocument } from './plugin.schema.js';
import {
  UserPlugin,
  UserPluginDocument,
  ConnectionStatus,
} from './user-plugin.schema.js';
import { PLUGIN_SEED_DATA } from './plugin-seed.data.js';
import { AzureCatalogService } from './azure-catalog.service.js';
import { AzureConnectionService } from './azure-connection.service.js';
import { ConnectorRegistry } from './connectors/connector-registry.service.js';
import type { ConnectorAdapter } from './connectors/connector.interface.js';
import { EncryptionService } from '../encryption/encryption.service.js';
import { PluginResponse, UserPluginResponse } from './dto/plugins-response.dto.js';

export interface StartConnectionResult {
  authUrl: string;
  status: ConnectionStatus;
  connectionName: string;
}

export interface CompleteConnectionResult {
  pluginSlug?: string;
  status: ConnectionStatus;
}

@Injectable()
export class PluginsService {
  private readonly logger = new Logger(PluginsService.name);

  constructor(
    @InjectModel(Plugin.name)
    private readonly pluginModel: Model<PluginDocument>,
    @InjectModel(UserPlugin.name)
    private readonly userPluginModel: Model<UserPluginDocument>,
    private readonly azureCatalogService: AzureCatalogService,
    private readonly azureConnectionService: AzureConnectionService,
    private readonly connectorRegistry: ConnectorRegistry,
    private readonly encryptionService: EncryptionService,
  ) {}

  /** Seeds the catalog collection with the default connector set on startup. */
  async seedCatalog(): Promise<number> {
    let created = 0;
    for (const data of PLUGIN_SEED_DATA) {
      const result = await this.pluginModel
        .updateOne(
          { slug: data.slug },
          { $setOnInsert: { ...data, enabled: true } },
          { upsert: true },
        )
        .exec();
      if (result.upsertedCount > 0) created += 1;
    }
    if (created > 0) {
      this.logger.log(`Seeded ${created} plugin(s) into the catalog`);
    }
    return created;
  }

  async getCatalog(): Promise<PluginResponse[]> {
    const catalog = await this.azureCatalogService.getConnectors();
    if (this.azureCatalogService.getLastResult()?.source === 'azure') {
      return catalog;
    }
    // Azure catalog unreachable — fall back to the Mongo catalog (seeded).
    const plugins = await this.pluginModel
      .find({ enabled: true })
      .sort({ sortOrder: 1, name: 1 })
      .lean()
      .exec();
    return plugins.map((p) => this.toPluginResponse(p));
  }

  async getConnections(userId: string): Promise<UserPluginResponse[]> {
    const connections = await this.userPluginModel
      .find({ userId })
      .sort({ connectedAt: -1 })
      .lean()
      .exec();
    return connections.map((c) => ({
      pluginSlug: c.pluginSlug,
      status: c.status as ConnectionStatus,
      connectorName: c.connectorName,
      azureConnectionName: c.azureConnectionName,
      azureConnectionId: c.azureConnectionId,
      azureResourceGroup: c.azureResourceGroup,
      accountName: c.accountName,
      scopes: c.scopes,
      connectedAt: c.connectedAt,
      lastSyncAt: c.lastSyncAt,
    }));
  }

  /** Returns the connected-slug set for a user, used by the marketplace UI. */
  async getConnectedSlugs(userId: string): Promise<string[]> {
    const connections = await this.userPluginModel
      .find({ userId, status: 'connected' })
      .select('pluginSlug')
      .lean()
      .exec();
    return connections.map((c) => c.pluginSlug);
  }

  /**
   * Provisions an Azure connection for the connector and returns the consent
   * URL the browser must visit. Azure performs the OAuth handshake and owns the
   * resulting tokens; we persist the connection reference and status.
   */
  async startConnection(
    userId: string,
    slug: string,
  ): Promise<StartConnectionResult> {
    const adapter = this.connectorRegistry.get(slug);
    if (adapter) {
      return this.startAdapterConnection(userId, slug, adapter);
    }

    const connectors = await this.azureCatalogService.getConnectors();
    const connector = connectors.find((c) => c.slug === slug);
    if (!connector) {
      throw new NotFoundException(`Plugin "${slug}" not found in catalog`);
    }

    const connectionName = this.buildConnectionName(slug, userId);
    const redirectUrl = `${this.callbackBase()}/plugins/callback?c=${encodeURIComponent(
      connectionName,
    )}`;

    let authUrl: string;
    try {
      await this.azureConnectionService.createConnection(slug, connectionName);
      authUrl = await this.azureConnectionService.getConsentLink(
        connectionName,
        redirectUrl,
      );
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`Failed to start connection for "${slug}": ${message}`);
      throw new BadGatewayException(
        `Unable to start the connection with ${connector.name}. ${message}`,
      );
    }

    await this.userPluginModel
      .updateOne(
        { userId, pluginSlug: slug },
        {
          $set: {
            status: 'pending',
            connectorName: slug,
            authMode: 'azure',
            oauthState: undefined,
            azureConnectionName: connectionName,
            azureResourceGroup: process.env.AZURE_CONNECTIONS_RESOURCE_GROUP ?? 'stratvedaos_group',
            scopes: connector.scopes ?? [],
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      )
      .exec();

    return { authUrl, status: 'pending', connectionName };
  }

  /**
   * Path B: RevOps owns the OAuth app for this connector, so we build the
   * provider authorize URL ourselves and correlate the callback via state.
   */
  private async startAdapterConnection(
    userId: string,
    slug: string,
    adapter: ConnectorAdapter,
  ): Promise<StartConnectionResult> {
    if (!adapter.isConfigured()) {
      throw new BadGatewayException(
        `${adapter.displayName} is not configured yet. Add its OAuth credentials and try again.`,
      );
    }

    const state = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(state)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const redirectUri = `${this.callbackBase()}/plugins/oauth/callback`;
    const authUrl = adapter.buildAuthorizeUrl({ state, codeChallenge, redirectUri });

    await this.userPluginModel
      .updateOne(
        { userId, pluginSlug: slug },
        {
          $set: {
            status: 'pending',
            connectorName: slug,
            authMode: 'adapter',
            oauthState: state,
            azureConnectionName: undefined,
            scopes: adapter.scopes(),
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      )
      .exec();

    return { authUrl, status: 'pending', connectionName: state };
  }

  /**
   * Path B callback: exchanges the authorization code for tokens using our own
   * app credentials, encrypts the token set, and marks the connection live.
   */
  async completeOAuthConnection(
    state: string,
    code: string,
  ): Promise<CompleteConnectionResult> {
    const row = await this.userPluginModel
      .findOne({ oauthState: state })
      .exec();
    if (!row) {
      this.logger.warn('OAuth callback received with unknown state');
      return { status: 'error' };
    }

    const adapter = this.connectorRegistry.get(row.pluginSlug);
    if (!adapter) {
      return { pluginSlug: row.pluginSlug, status: 'error' };
    }

    const redirectUri = `${this.callbackBase()}/plugins/oauth/callback`;
    try {
      const tokenSet = await adapter.exchangeCode({
        code,
        codeVerifier: state,
        redirectUri,
      });
      const account = await adapter
        .getAccount(tokenSet.accessToken)
        .catch((): { id?: string; name?: string; email?: string } => ({}));
      const encrypted = await this.encryptionService.encrypt(
        JSON.stringify(tokenSet),
      );

      await this.userPluginModel
        .updateOne(
          { _id: row._id },
          {
            $set: {
              status: 'connected',
              encryptedToken: JSON.stringify(encrypted),
              accountName: account.name ?? account.email ?? row.accountName,
              scopes: tokenSet.scopes ?? row.scopes,
              connectedAt: new Date(),
              oauthState: undefined,
              metadata: {
                accountId: account.id,
                accountEmail: account.email,
                tokenType: tokenSet.tokenType,
                expiresAt: tokenSet.expiresAt,
              },
              updatedAt: new Date(),
            },
          },
        )
        .exec();

      return { pluginSlug: row.pluginSlug, status: 'connected' };
    } catch (error) {
      this.logger.error(
        `OAuth exchange failed for "${row.pluginSlug}": ${(error as Error).message}`,
      );
      await this.userPluginModel
        .updateOne(
          { _id: row._id },
          { $set: { status: 'error', oauthState: undefined, updatedAt: new Date() } },
        )
        .exec();
      return { pluginSlug: row.pluginSlug, status: 'error' };
    }
  }

  private callbackBase(): string {
    return process.env.CALLBACK_BASE ?? 'http://localhost:3010';
  }

  /**
   * Finalizes a connection after the user completes Azure consent. Reads the
   * authenticated connection state and persists the resulting details.
   */
  async completeConnection(
    connectionName: string,
  ): Promise<CompleteConnectionResult> {
    const row = await this.userPluginModel
      .findOne({ azureConnectionName: connectionName })
      .exec();
    if (!row) {
      return { status: 'error' };
    }

    const details =
      await this.azureConnectionService.getConnection(connectionName);
    const connected =
      (details.overallStatus ?? '').toLowerCase() === 'connected';

    await this.userPluginModel
      .updateOne(
        { _id: row._id },
        {
          $set: {
            status: connected ? 'connected' : 'error',
            accountName:
              details.displayName ?? details.authenticatedUser ?? row.accountName,
            azureConnectionId: details.connectionId,
            connectedAt: connected ? new Date() : row.connectedAt,
            metadata: {
              overallStatus: details.overallStatus,
              authenticatedUser: details.authenticatedUser,
              statuses: details.statuses,
            },
            updatedAt: new Date(),
          },
        },
      )
      .exec();

    return { pluginSlug: row.pluginSlug, status: connected ? 'connected' : 'error' };
  }

  async disconnect(userId: string, slug: string): Promise<void> {
    const row = await this.userPluginModel
      .findOne({ userId, pluginSlug: slug })
      .exec();
    if (row?.azureConnectionName) {
      await this.azureConnectionService.deleteConnection(
        row.azureConnectionName,
      );
    }
    await this.userPluginModel
      .updateOne(
        { userId, pluginSlug: slug },
        {
          $set: {
            status: 'disconnected',
            azureConnectionId: undefined,
            encryptedToken: undefined,
            oauthState: undefined,
            metadata: undefined,
            updatedAt: new Date(),
          },
        },
      )
      .exec();
  }

  /** Azure connection names must be unique per resource group. */
  private buildConnectionName(slug: string, userId: string): string {
    const safeSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40);
    const suffix = userId.replace(/[^a-zA-Z0-9]/g, '').slice(-10) || Date.now().toString(36);
    return `revops-${safeSlug}-${suffix}`;
  }

  private toPluginResponse(plugin: PluginDocument | Record<string, unknown>): PluginResponse {
    return {
      slug: String(plugin.slug),
      name: String(plugin.name),
      description: plugin.description as string | undefined,
      category: String(plugin.category),
      mark: plugin.mark as string | undefined,
      brandColor: plugin.brandColor as string | undefined,
      source: String(plugin.source),
      authType: String(plugin.authType),
      scopes: (plugin.scopes as string[] | undefined) ?? [],
      enabled: plugin.enabled as boolean | undefined,
      sortOrder: plugin.sortOrder as number | undefined,
    };
  }
}