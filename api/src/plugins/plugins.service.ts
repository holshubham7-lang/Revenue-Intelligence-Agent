import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Plugin, PluginDocument } from './plugin.schema.js';
import {
  UserPlugin,
  UserPluginDocument,
  ConnectionStatus,
} from './user-plugin.schema.js';
import { PLUGIN_SEED_DATA } from './plugin-seed.data.js';
import { AzureCatalogService } from './azure-catalog.service.js';
import { AzureConnectionService } from './azure-connection.service.js';
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
    const connectors = await this.azureCatalogService.getConnectors();
    const connector = connectors.find((c) => c.slug === slug);
    if (!connector) {
      throw new NotFoundException(`Plugin "${slug}" not found in catalog`);
    }

    const connectionName = this.buildConnectionName(slug, userId);
    const callbackBase = process.env.CALLBACK_BASE ?? 'http://localhost:3010';
    const redirectUrl = `${callbackBase}/plugins/callback?c=${encodeURIComponent(
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