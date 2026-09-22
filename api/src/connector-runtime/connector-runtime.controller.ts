import {
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { PluginsService } from '../plugins/plugins.service.js';
import { PluginConnectionsService } from '../plugin-connections/plugin-connections.service.js';
import { PluginConsentsService } from '../plugin-consents/plugin-consents.service.js';
import { ConnectorRuntimeService } from './connector-runtime.service.js';

@Controller('connections')
@UseGuards(JwtAuthGuard)
export class ConnectorRuntimeController {
  constructor(
    private readonly connectionsService: PluginConnectionsService,
    private readonly workspacesService: WorkspacesService,
    private readonly pluginsService: PluginsService,
    private readonly consentsService: PluginConsentsService,
    private readonly runtimeService: ConnectorRuntimeService,
  ) {}

  @Post(':connectionId/disconnect')
  async disconnect(
    @CurrentUserId() userId: string,
    @Param('connectionId') connectionId: string,
    @Body() body: { reason?: string },
  ): Promise<{ status: string }> {
    const workspaceId = await this.workspacesService.resolveForUser(userId);
    const connection = await this.connectionsService.findById(
      workspaceId,
      connectionId,
    );
    const connector = await this.pluginsService.findConnector(
      connection.connectorSlug,
    );

    await this.consentsService.revoke(connectionId, {
      workspaceId,
      actorId: userId,
      reason: body.reason ?? 'User requested disconnect',
    });

    await this.runtimeService.revokeConnection({
      connection,
      connector,
      workspaceId,
      actorId: userId,
      reason: body.reason ?? 'User requested disconnect',
    });

    return { status: 'revoked' };
  }
}