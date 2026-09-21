import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PluginsService } from './plugins.service.js';
import {
  PluginResponse,
  UserPluginResponse,
} from './dto/plugins-response.dto.js';

@Controller('plugins')
@UseGuards(JwtAuthGuard)
export class PluginsController {
  constructor(private readonly pluginsService: PluginsService) {}

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

  @Get('me')
  async getMyConnections(
    @CurrentUserId() userId: string,
  ): Promise<UserPluginResponse[]> {
    return this.pluginsService.getConnections(userId);
  }

  @Post(':slug/connect')
  async connect(
    @CurrentUserId() userId: string,
    @Param('slug') slug: string,
  ): Promise<{ authUrl: string; status: string; connectionName: string }> {
    return this.pluginsService.startConnection(userId, slug);
  }

  @Post(':slug/disconnect')
  async disconnect(
    @CurrentUserId() userId: string,
    @Param('slug') slug: string,
  ): Promise<{ status: string }> {
    await this.pluginsService.disconnect(userId, slug);
    return { status: 'disconnected' };
  }
}

/**
 * Public callback that Azure redirects to after the user completes consent.
 * Not guarded: it is reached by a top-level browser redirect from Azure and is
 * correlated to a connection via the opaque `c` query parameter.
 */
@Controller('plugins')
export class PluginsCallbackController {
  constructor(private readonly pluginsService: PluginsService) {}

  @Get('callback')
  async callback(
    @Query('c') connectionName: string,
    @Res() response: Response,
  ): Promise<void> {
    const frontend = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    try {
      const result = await this.pluginsService.completeConnection(
        connectionName ?? '',
      );
      if (result.status === 'connected' && result.pluginSlug) {
        response.redirect(
          `${frontend}/dashboard/plugins?connected=${encodeURIComponent(
            result.pluginSlug,
          )}`,
        );
        return;
      }
      response.redirect(
        `${frontend}/dashboard/plugins?error=${encodeURIComponent(
          result.pluginSlug ?? 'connection_failed',
        )}`,
      );
    } catch {
      response.redirect(`${frontend}/dashboard/plugins?error=connection_failed`);
    }
  }
}
