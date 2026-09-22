import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { PluginConnectionsService } from '../plugin-connections/plugin-connections.service.js';
import {
  RevenueChange,
  RevenueChangeDocument,
} from './revenue-change.schema.js';

@Controller('changes')
@UseGuards(JwtAuthGuard)
export class ChangeDetectionController {
  constructor(
    @InjectModel(RevenueChange.name)
    private readonly changeModel: Model<RevenueChangeDocument>,
    private readonly workspacesService: WorkspacesService,
    private readonly connectionsService: PluginConnectionsService,
  ) {}

  @Get('connections/:connectionId/recent')
  async recent(
    @CurrentUserId() userId: string,
    @Param('connectionId') connectionId: string,
    @Query('limit') limit?: string,
    @Query('minSeverity') minSeverity?: string,
  ) {
    const workspaceId = await this.workspacesService.resolveForUser(userId);
    await this.connectionsService.findById(workspaceId, connectionId);

    const filter: Record<string, unknown> = { workspaceId, connectionId };
    if (minSeverity === 'medium') {
      filter.severity = { $in: ['medium', 'high'] };
    } else if (minSeverity === 'high') {
      filter.severity = 'high';
    }

    const changes = await this.changeModel
      .find(filter, {
        sourceKey: 0,
        _id: 0,
      })
      .sort({ detectedAt: -1 })
      .limit(Math.min(Number(limit ?? '100') || 100, 500))
      .lean()
      .exec();

    return changes.map((c) => ({
      diffType: c.diffType,
      entityType: c.entityType,
      name: c.name,
      previousAmount: c.previousAmount,
      newAmount: c.newAmount,
      previousStage: c.previousStage,
      newStage: c.newStage,
      severity: c.severity,
      significance: c.significance,
      notes: c.notes,
      reviewed: c.reviewed ?? false,
      detectedAt: c.detectedAt,
      snapshotSeq: c.snapshotSeq,
    }));
  }
}