import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { PluginsService } from '../plugins/plugins.service.js';
import { PluginConnectionsService } from '../plugin-connections/plugin-connections.service.js';
import { PluginConsentsService } from '../plugin-consents/plugin-consents.service.js';
import { ConnectorRuntimeService } from '../connector-runtime/connector-runtime.service.js';
import {
  PluginOAuthService,
  StartConnectionResult,
  CallbackResult,
} from './plugin-oauth.service.js';

@Controller('plugins')
export class PluginOAuthController {
  constructor(
    private readonly oauthService: PluginOAuthService,
    private readonly workspacesService: WorkspacesService,
    private readonly pluginsService: PluginsService,
    private readonly connectionsService: PluginConnectionsService,
    private readonly consentsService: PluginConsentsService,
    private readonly runtimeService: ConnectorRuntimeService,
  ) {}

  @Post(':slug/connect')
  @UseGuards(JwtAuthGuard)
  async connect(
    @CurrentUserId() userId: string,
    @Param('slug') slug: string,
  ): Promise<StartConnectionResult> {
    return this.oauthService.startConnection(userId, slug);
  }

  @Get('oauth/callback')
  async callback(
    @Query('state') state: string,
    @Query('code') code?: string,
    @Query('error') error?: string,
    @Query('error_description') errorDescription?: string,
  ): Promise<CallbackResult> {
    return this.oauthService.handleCallback({ state, code, error, errorDescription });
  }

  @Post(':slug/disconnect')
  @UseGuards(JwtAuthGuard)
  async disconnect(
    @CurrentUserId() userId: string,
    @Param('slug') slug: string,
  ): Promise<{ status: string }> {
    const workspaceId = await this.workspacesService.resolveForUser(userId);
    const connection = await this.connectionsService.findByWorkspaceAndSlug(
      workspaceId,
      slug,
    );
    if (!connection) return { status: 'not-found' };
    const connector = await this.pluginsService.findConnector(slug);
    await this.consentsService.revoke(connection._id.toString(), {
      workspaceId,
      actorId: userId,
      reason: 'User requested disconnect',
    });
    await this.runtimeService.revokeConnection({
      connection,
      connector,
      workspaceId,
      actorId: userId,
      reason: 'User requested disconnect',
    });
    return { status: 'revoked' };
  }
}