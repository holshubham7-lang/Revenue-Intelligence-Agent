import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { WorkspacesService } from './workspaces.service.js';

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get('me')
  async getMine(@CurrentUserId() userId: string) {
    const workspace = await this.workspacesService.findByOwner(userId);
    if (!workspace) {
      return { workspaceId: null };
    }
    return {
      workspaceId: workspace._id.toString(),
      name: workspace.name,
      settings: workspace.settings ?? {},
    };
  }

  @Patch(':workspaceId/settings')
  async updateSettings(
    @CurrentUserId() userId: string,
    @Param('workspaceId') workspaceId: string,
    @Body()
    settings: {
      syncCadenceMinutes?: number;
      autoSyncOnRefresh?: boolean;
      retentionDays?: number;
    },
  ) {
    const updated = await this.workspacesService.updateSettings(
      workspaceId,
      userId,
      settings,
    );
    return { settings: updated };
  }
}