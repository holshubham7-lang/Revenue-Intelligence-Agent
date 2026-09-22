import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { PluginConnectionsService } from '../plugin-connections/plugin-connections.service.js';
import { SyncTasksService } from './sync-tasks.service.js';

@Controller('data-sync')
@UseGuards(JwtAuthGuard)
export class DataSyncController {
  constructor(
    private readonly syncTasksService: SyncTasksService,
    private readonly workspacesService: WorkspacesService,
    private readonly connectionsService: PluginConnectionsService,
  ) {}

  @Post('connections/:connectionId/refresh')
  async refresh(
    @CurrentUserId() userId: string,
    @Param('connectionId') connectionId: string,
    @Body() body: { trigger?: 'manual' | 'callback' | 'schedule' } | undefined,
  ) {
    const workspaceId = await this.workspacesService.resolveForUser(userId);
    await this.connectionsService.findById(workspaceId, connectionId);
    return this.syncTasksService.runRefresh({
      workspaceId,
      connectionId,
      trigger: body?.trigger ?? 'manual',
      actorId: userId,
    });
  }

  @Get('connections/:connectionId')
  async history(
    @CurrentUserId() userId: string,
    @Param('connectionId') connectionId: string,
  ) {
    const workspaceId = await this.workspacesService.resolveForUser(userId);
    await this.connectionsService.findById(workspaceId, connectionId);
    const runs = await this.syncTasksService.getStatus(
      workspaceId,
      connectionId,
    );
    return runs.map((r) => ({
      id: r._id.toString(),
      kind: r.kind,
      trigger: r.trigger,
      status: r.status,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      capabilitiesProcessed: r.capabilitiesProcessed,
      recordsTotal: r.recordsTotal,
      changeSummary: r.changeSummary,
      snapshotSeq: r.snapshotSeq,
      error: r.error,
    }));
  }
}