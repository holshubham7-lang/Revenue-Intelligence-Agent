import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PluginsService, ConnectorMetadata } from './plugins.service.js';
import { PluginResponse } from './dto/plugins-response.dto.js';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserPlugin, UserPluginDocument } from './user-plugin.schema.js';

@Controller('plugins')
@UseGuards(JwtAuthGuard)
export class PluginsController {
  constructor(
    private readonly pluginsService: PluginsService,
    @InjectModel(UserPlugin.name)
    private readonly userPluginModel: Model<UserPluginDocument>,
  ) {}

  @Get()
  async getCatalog(
    @CurrentUserId() userId: string,
  ): Promise<Array<PluginResponse & { connected: boolean }>> {
    const [plugins, connectedSlugs] = await Promise.all([
      this.pluginsService.getCatalog(),
      this.pluginsService.getConnectedSlugs(userId),
    ]);
    return plugins.map((plugin) => ({
      ...plugin,
      connected: connectedSlugs.includes(plugin.slug),
    }));
  }

  @Get(':slug')
  async getConnector(
    @CurrentUserId() userId: string,
    @Param('slug') slug: string,
  ): Promise<{ connector: ConnectorMetadata; connected: boolean }> {
    const connector = await this.pluginsService.findConnector(slug);
    const connection = await this.userPluginModel
      .findOne({ userId, pluginSlug: slug })
      .exec();
    const sanitized: ConnectorMetadata = {
      ...connector,
      oauthConfig: connector.oauthConfig
        ? {
            authorizationUrl: connector.oauthConfig.authorizationUrl,
            tokenUrl: connector.oauthConfig.tokenUrl,
            clientId: connector.oauthConfig.clientId,
            baseUrl: connector.oauthConfig.baseUrl,
            scope: connector.oauthConfig.scope,
            responseType: connector.oauthConfig.responseType,
          }
        : undefined,
    };
    return {
      connector: sanitized,
      connected: connection?.status === 'connected',
    };
  }
}