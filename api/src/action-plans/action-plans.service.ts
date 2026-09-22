import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditService } from '../audit/audit.service.js';
import {
  ActionPlan,
  ActionPlanDocument,
  ActionPlanStatus,
} from './action-plan.schema.js';
import {
  ActionPlanItem,
  ActionPlanItemDocument,
  ItemLogEntry,
} from './action-plan-item.schema.js';

export interface CreatePlanInput {
  workspaceId: string;
  connectionId?: string;
  title: string;
  summary?: string;
  priority?: 'low' | 'medium' | 'high';
  findingIds?: string[];
  createdBy?: string;
}

@Injectable()
export class ActionPlansService {
  constructor(
    @InjectModel(ActionPlan.name)
    private readonly planModel: Model<ActionPlanDocument>,
    @InjectModel(ActionPlanItem.name)
    private readonly itemModel: Model<ActionPlanItemDocument>,
    private readonly auditService: AuditService,
  ) {}

  async createPlan(input: CreatePlanInput): Promise<ActionPlanDocument> {
    const plan = await this.planModel.create({
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      title: input.title,
      summary: input.summary,
      priority: input.priority ?? 'medium',
      status: 'open',
      phase: 'planning',
      findingIds: input.findingIds ?? [],
      createdBy: input.createdBy,
    });

    await this.auditService.record({
      workspaceId: input.workspaceId,
      actorId: input.createdBy,
      action: 'created',
      category: 'action_plan',
      targetType: 'action_plan',
      targetId: plan._id.toString(),
      message: `Action plan created: ${plan.title}`,
    });

    return plan;
  }

  /** Seeds an initial set of items from the plan's summary (findings recs). */
  async seedItemsFromRecommendations(
    plan: ActionPlanDocument,
    recommendations: string[],
  ): Promise<ActionPlanItemDocument[]> {
    const items = recommendations.slice(0, 5).map((rec, i) =>
      this.itemModel.create({
        planId: plan._id.toString(),
        workspaceId: plan.workspaceId,
        itemTitle: rec.length > 140 ? `${rec.slice(0, 137)}...` : rec,
        status: 'open',
        priority: i === 0 ? 'high' : 'medium',
      }),
    );
    return Promise.all(items);
  }

  async addItem(
    workspaceId: string,
    planId: string,
    input: { itemTitle: string; description?: string; priority?: 'low'|'medium'|'high' },
  ): Promise<ActionPlanItemDocument> {
    const plan = await this.getPlan(workspaceId, planId);
    if (!input.itemTitle.trim()) {
      throw new NotFoundException('Item title is required');
    }
const item = await this.itemModel.create({
      planId: plan._id.toString(),
      workspaceId,
      itemTitle: input.itemTitle,
      description: input.description,
      status: 'open',
      priority: input.priority ?? 'medium',
    });
    await this.touchPlan(plan._id.toString());
    return item;
  }

  async listPlans(workspaceId: string): Promise<ActionPlanDocument[]> {
    return this.planModel
      .find({ workspaceId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async getPlan(
    workspaceId: string,
    planId: string,
  ): Promise<ActionPlanDocument> {
    const plan = await this.planModel
      .findOne({ _id: planId, workspaceId })
      .lean()
      .exec();
    if (!plan) {
      throw new NotFoundException('Action plan not found');
    }
    return plan;
  }

  async listItems(
    workspaceId: string,
    planId: string,
  ): Promise<ActionPlanItemDocument[]> {
    await this.getPlan(workspaceId, planId);
    return this.itemModel
      .find({ planId, workspaceId })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
  }

  async updateStatus(
    workspaceId: string,
    planId: string,
    status: ActionPlanStatus,
    actorId?: string,
  ): Promise<ActionPlanDocument> {
    const plan = await this.getPlan(workspaceId, planId);
    const patch: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
      phase:
        status === 'in_progress'
          ? 'executing'
          : status === 'done'
            ? 'completed'
            : status === 'cancelled'
              ? 'cancelled'
              : plan.phase,
    };
    if (status === 'done') {
      patch.adopted = true;
      patch.adoptedAt = new Date();
    }
    await this.planModel
      .findByIdAndUpdate(plan._id.toString(), { $set: patch })
      .exec();
    await this.auditService.record({
      workspaceId,
      actorId,
      action: 'updated',
      category: 'action_plan',
      targetType: 'action_plan',
      targetId: plan._id.toString(),
      message: `Action plan status -> ${status}`,
    });
    return this.getPlan(workspaceId, planId);
  }

  async updateItemStatus(
    workspaceId: string,
    planId: string,
    itemId: string,
    status: ActionPlanStatus,
    actorId?: string,
  ): Promise<ActionPlanItemDocument> {
    await this.getPlan(workspaceId, planId);
    const item = await this.itemModel.findOneAndUpdate(
      { _id: itemId, planId, workspaceId },
      {
        $set: {
          status,
          updatedAt: new Date(),
          closedAt: status === 'done' || status === 'cancelled' ? new Date() : null,
        },
        $push: {
          executionLog: {
            actorId,
            action: `status -> ${status}`,
            at: new Date(),
          } as ItemLogEntry,
        },
      },
      { new: true },
    );
    if (!item) {
      throw new NotFoundException('Action plan item not found');
    }
    return item;
  }

  /** Marks the item as applied / committed against the source of truth. */
  async commitItem(
    workspaceId: string,
    planId: string,
    itemId: string,
    actorId: string,
  ): Promise<ActionPlanItemDocument> {
    await this.getPlan(workspaceId, planId);
    const item = await this.itemModel.findOneAndUpdate(
      { _id: itemId, planId, workspaceId },
      {
        $set: {
          status: 'done',
          closedAt: new Date(),
          updatedAt: new Date(),
        },
        $push: {
          executionLog: {
            actorId,
            action: 'applied',
            at: new Date(),
            note: 'Action committed to the connected app.',
          } as ItemLogEntry,
        },
      },
      { new: true },
    );
    if (!item) {
      throw new NotFoundException('Action plan item not found');
    }
    await this.auditService.record({
      workspaceId,
      actorId,
      action: 'applied',
      category: 'action_plan',
      targetType: 'action_plan_item',
      targetId: item._id.toString(),
      message: `Action applied: ${item.itemTitle}`,
    });
    return item;
  }

  private async touchPlan(planId: string): Promise<void> {
    await this.planModel
      .findByIdAndUpdate(planId, { $set: { updatedAt: new Date() } })
      .exec();
  }
}