import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
import { PluginResponse, UserPluginResponse } from './dto/plugins-response.dto.js';

@Injectable()
export class PluginsService {
  private readonly logger = new Logger(PluginsService.name);

  constructor(
    @InjectModel(Plugin.name)
    private readonly pluginModel: Model<PluginDocument>,
    @InjectModel(UserPlugin.name)
    private readonly userPluginModel: Model<UserPluginDocument>,
    private readonly azureCatalogService: AzureCatalogService,
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
   * Records an intent to connect a plugin. Because the actual OAuth handoff
   * is implemented by the per-connector adapters, this creates (or updates)
   * a pending connection record ready for the flow to complete.
   */
  async startConnection(userId: string, slug: string): Promise<void> {
    const connectors = await this.azureCatalogService.getConnectors();
    const connector = connectors.find((c) => c.slug === slug);
    if (!connector) {
      throw new NotFoundException(`Plugin "${slug}" not found in catalog`);
    }

    await this.userPluginModel
      .updateOne(
        { userId, pluginSlug: slug },
        {
          $set: {
            status: 'pending',
            scopes: connector.scopes ?? [],
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      )
      .exec();
  }

  async disconnect(userId: string, slug: string): Promise<void> {
    await this.userPluginModel
      .updateOne(
        { userId, pluginSlug: slug },
        { $set: { status: 'disconnected', updatedAt: new Date() } },
      )
      .exec();
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