import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import {
  ActionPlansService,
  CreatePlanInput,
} from './action-plans.service.js';
import type { ActionPlanStatus } from './action-plan.schema.js';

@Controller('action-plans')
@UseGuards(JwtAuthGuard)
export class ActionPlansController {
  constructor(
    private readonly actionPlansService: ActionPlansService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  @Get()
  async list(@CurrentUserId() userId: string) {
    const workspaceId = await this.workspacesService.resolveForUser(userId);
    const plans = await this.actionPlansService.listPlans(workspaceId);
    const items = await Promise.all(
      plans.map((p) => this.actionPlansService.listItems(workspaceId, p._id.toString())),
    );
    return plans.map((plan, i) => {
      const planItems = items[i];
      return {
        id: plan._id.toString(),
        title: plan.title,
        summary: plan.summary,
        status: plan.status,
        priority: plan.priority,
        phase: plan.phase,
        adopted: plan.adopted ?? false,
        connectionId: plan.connectionId,
        createdAt: plan.createdAt,
        itemCount: planItems.length,
        doneItems: planItems.filter((it) => it.status === 'done').length,
        items: planItems.map((it) => ({
          id: it._id.toString(),
          itemTitle: it.itemTitle,
          status: it.status,
          priority: it.priority,
        })),
      };
    });
  }

  @Get(':planId')
  async getOne(
    @CurrentUserId() userId: string,
    @Param('planId') planId: string,
  ) {
    const workspaceId = await this.workspacesService.resolveForUser(userId);
    const plan = await this.actionPlansService.getPlan(workspaceId, planId);
    const items = await this.actionPlansService.listItems(workspaceId, planId);
    return {
      id: plan._id.toString(),
      title: plan.title,
      summary: plan.summary,
      status: plan.status,
      priority: plan.priority,
      phase: plan.phase,
      adopted: plan.adopted ?? false,
      findingIds: plan.findingIds,
      connectionId: plan.connectionId,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      items: items.map((it) => ({
        id: it._id.toString(),
        itemTitle: it.itemTitle,
        description: it.description,
        status: it.status,
        priority: it.priority,
        executionLog: it.executionLog ?? [],
        createdAt: it.createdAt,
      })),
    };
  }

  @Post()
  async create(
    @CurrentUserId() userId: string,
    @Body()
    body: {
      connectionId?: string;
      title: string;
      summary?: string;
      priority?: 'low' | 'medium' | 'high';
      findingIds?: string[];
      recommendations?: string[];
    },
  ) {
    const workspaceId = await this.workspacesService.resolveForUser(userId);
    const plan = await this.actionPlansService.createPlan({
      workspaceId,
      connectionId: body.connectionId,
      title: body.title,
      summary: body.summary,
      priority: body.priority,
      findingIds: body.findingIds,
      createdBy: userId,
    } as CreatePlanInput);

    if (body.recommendations && body.recommendations.length > 0) {
      await this.actionPlansService.seedItemsFromRecommendations(
        plan,
        body.recommendations,
      );
    }
    return { id: plan._id.toString() };
  }

  @Patch(':planId')
  async updateStatus(
    @CurrentUserId() userId: string,
    @Param('planId') planId: string,
    @Body() body: { status: ActionPlanStatus },
  ) {
    const workspaceId = await this.workspacesService.resolveForUser(userId);
    const plan = await this.actionPlansService.updateStatus(
      workspaceId,
      planId,
      body.status,
      userId,
    );
    return { id: plan._id.toString(), status: plan.status };
  }

  @Post(':planId/items')
  async addItem(
    @CurrentUserId() userId: string,
    @Param('planId') planId: string,
    @Body() body: { itemTitle: string; description?: string; priority?: 'low'|'medium'|'high' },
  ) {
    const workspaceId = await this.workspacesService.resolveForUser(userId);
    const item = await this.actionPlansService.addItem(workspaceId, planId, body);
    return { id: item._id.toString() };
  }

  @Patch(':planId/items/:itemId')
  async updateItemStatus(
    @CurrentUserId() userId: string,
    @Param('planId') planId: string,
    @Param('itemId') itemId: string,
    @Body() body: { status: ActionPlanStatus },
  ) {
    const workspaceId = await this.workspacesService.resolveForUser(userId);
    const item = await this.actionPlansService.updateItemStatus(
      workspaceId,
      planId,
      itemId,
      body.status,
      userId,
    );
    return { id: item._id.toString(), status: item.status };
  }

  @Post(':planId/items/:itemId/commit')
  async commitItem(
    @CurrentUserId() userId: string,
    @Param('planId') planId: string,
    @Param('itemId') itemId: string,
  ) {
    const workspaceId = await this.workspacesService.resolveForUser(userId);
    const item = await this.actionPlansService.commitItem(
      workspaceId,
      planId,
      itemId,
      userId,
    );
    return { id: item._id.toString(), status: item.status };
  }
}