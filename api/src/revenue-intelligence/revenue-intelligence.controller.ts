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
import { SnapshotsService } from '../snapshots/snapshots.service.js';
import { RevenueIntelligenceService } from './revenue-intelligence.service.js';

@Controller('revenue-intelligence')
@UseGuards(JwtAuthGuard)
export class RevenueIntelligenceController {
  constructor(
    private readonly intelligenceService: RevenueIntelligenceService,
    private readonly workspacesService: WorkspacesService,
    private readonly connectionsService: PluginConnectionsService,
    private readonly snapshotsService: SnapshotsService,
  ) {}

  @Get('connections/:connectionId')
  async forConnection(
    @CurrentUserId() userId: string,
    @Param('connectionId') connectionId: string,
  ) {
    const workspaceId = await this.workspacesService.resolveForUser(userId);
    await this.connectionsService.findById(workspaceId, connectionId);
    const latest = await this.snapshotsService.getLatest(connectionId);
    const findings = await this.intelligenceService.listFindings(
      workspaceId,
      connectionId,
    );
    return {
      snapshotSeq: latest?.seq ?? 0,
      snapshotTimestamp: latest?.snapshotTimestamp ?? null,
      findings: findings.map((f) => ({
        id: f._id.toString(),
        layer: f.layer,
        title: f.title,
        summary: f.summary,
        severity: f.severity,
        trend: f.trend,
        metrics: f.metrics,
        keyEntities: f.keyEntities,
        recommendations: f.recommendations,
        enginesUsed: f.enginesUsed,
        dismissed: f.dismissal?.dismissed ?? false,
        createdAt: f.createdAt,
      })),
    };
  }

  @Post('connections/:connectionId/analyze')
  async analyze(
    @CurrentUserId() userId: string,
    @Param('connectionId') connectionId: string,
    @Body() _body: { regenerate?: boolean } | undefined,
  ) {
    const workspaceId = await this.workspacesService.resolveForUser(userId);
    await this.connectionsService.findById(workspaceId, connectionId);
    const result = await this.intelligenceService.analyze({
      workspaceId,
      connectionId,
      actorId: userId,
    });
    return {
      snapshotSeq: result.snapshotSeq,
      enginesUsed: result.enginesUsed,
      findings: result.findings.map((f) => ({
        id: f._id.toString(),
        layer: f.layer,
        title: f.title,
        summary: f.summary,
        severity: f.severity,
        trend: f.trend,
        metrics: f.metrics,
        keyEntities: f.keyEntities,
        recommendations: f.recommendations,
        enginesUsed: f.enginesUsed,
        dismissed: f.dismissal?.dismissed ?? false,
        createdAt: f.createdAt,
      })),
    };
  }

  @Post('connections/:connectionId/findings/:findingId/dismiss')
  async dismiss(
    @CurrentUserId() userId: string,
    @Param('connectionId') connectionId: string,
    @Param('findingId') findingId: string,
  ) {
    const workspaceId = await this.workspacesService.resolveForUser(userId);
    await this.connectionsService.findById(workspaceId, connectionId);
    await this.intelligenceService.dismissFinding(
      workspaceId,
      connectionId,
      findingId,
      userId,
    );
    return { dismissed: true };
  }
}