import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
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
  ): Promise<{ authUrl: string | null; status: string }> {
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