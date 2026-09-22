import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Plugin,
  PluginDocument,
  PluginNormalizationConfig,
  PluginOAuthConfig,
} from './plugin.schema.js';
import { UserPlugin, UserPluginDocument } from './user-plugin.schema.js';
import { PLUGIN_SEED_DATA } from './plugin-seed.data.js';
import { AzureCatalogService } from './azure-catalog.service.js';
import { PluginResponse } from './dto/plugins-response.dto.js';

/**
 * Resolved connector metadata used by the generic OAuth flow and the
 * connector runtime. Fully connector-agnostic: nothing here references a
 * specific vendor besides the metadata that describes it.
 */
export interface ConnectorMetadata {
  slug: string;
  name: string;
  description?: string;
  category: string;
  mark?: string;
  brandColor?: string;
  iconUrl?: string;
  source: string;
  authType: string;
  authMode: 'azure-managed' | 'oauth' | 'manual';
  scopes?: string[];
  capabilities: string[];
  normalization?: PluginNormalizationConfig;
  oauthConfig?: PluginOAuthConfig;
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

  async getConnectedSlugs(userId: string): Promise<string[]> {
    const connections = await this.userPluginModel
      .find({ userId, status: 'connected' })
      .select('pluginSlug')
      .lean()
      .exec();
    return connections.map((c) => c.pluginSlug);
  }

  /**
   * Resolves full connector metadata by slug. Lookups hit the Mongo catalog
   * first (seeded + enriched), then the live Azure connector catalog.
   */
  async findConnector(slug: string): Promise<ConnectorMetadata> {
    const plugin = await this.pluginModel.findOne({ slug, enabled: true }).exec();
    if (plugin) {
      return this.toConnectorMetadata(plugin);
    }
    const catalog = await this.azureCatalogService.getConnectors();
    const item = catalog.find((connector) => connector.slug === slug);
    if (!item) {
      throw new NotFoundException(`Connector "${slug}" not found in catalog`);
    }
    return {
      ...item,
      capabilities: item.capabilities ?? [],
      authMode: 'azure-managed',
    };
  }

  private toConnectorMetadata(
    plugin: PluginDocument | Record<string, unknown>,
  ): ConnectorMetadata {
    const oauthConfig = plugin.oauthConfig as PluginOAuthConfig | undefined;
    return {
      slug: String(plugin.slug),
      name: String(plugin.name),
      description: plugin.description as string | undefined,
      category: String(plugin.category),
      mark: plugin.mark as string | undefined,
      brandColor: plugin.brandColor as string | undefined,
      iconUrl: plugin.iconUrl as string | undefined,
      source: String(plugin.source),
      authType: String(plugin.authType),
      authMode:
        (plugin.authMode as ConnectorMetadata['authMode']) ??
        (oauthConfig?.authorizationUrl ? 'oauth' : 'azure-managed'),
      scopes: (plugin.scopes as string[] | undefined) ?? [],
      capabilities: (plugin.capabilities as string[] | undefined) ?? [],
      normalization: plugin.normalization as
        | PluginNormalizationConfig
        | undefined,
      oauthConfig,
    };
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
      authMode: plugin.authMode as string | undefined,
      scopes: (plugin.scopes as string[] | undefined) ?? [],
      capabilities: (plugin.capabilities as string[] | undefined) ?? [],
      normalization: plugin.normalization as Record<string, unknown> | undefined,
      enabled: plugin.enabled as boolean | undefined,
      sortOrder: plugin.sortOrder as number | undefined,
      iconUrl: plugin.iconUrl as string | undefined,
    };
  }
}