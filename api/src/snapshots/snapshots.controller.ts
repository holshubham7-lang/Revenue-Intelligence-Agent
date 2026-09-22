import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { PluginConnectionsService } from '../plugin-connections/plugin-connections.service.js';
import { SnapshotsService } from './snapshots.service.js';

@Controller('snapshots')
@UseGuards(JwtAuthGuard)
export class SnapshotsController {
  constructor(
    private readonly snapshotsService: SnapshotsService,
    private readonly workspacesService: WorkspacesService,
    private readonly connectionsService: PluginConnectionsService,
  ) {}

  @Get('connections/:connectionId')
  async listForConnection(
    @CurrentUserId() userId: string,
    @Param('connectionId') connectionId: string,
    @Query('limit') limit?: string,
  ) {
    const workspaceId = await this.workspacesService.resolveForUser(userId);
    await this.connectionsService.findById(workspaceId, connectionId);
    const snapshots = await this.snapshotsService.listForConnection(
      connectionId,
      Math.min(Number(limit ?? '30') || 30, 100),
    );
    return snapshots.map((s) => ({
      id: s._id.toString(),
      seq: s.seq,
      snapshotTimestamp: s.snapshotTimestamp,
      recordCounts: s.recordCounts,
      summary: s.summary,
      runId: s.runId,
    }));
  }
}