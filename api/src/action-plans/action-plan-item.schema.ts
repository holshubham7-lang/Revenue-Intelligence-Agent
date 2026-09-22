import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import type { ActionPlanStatus, PriorityLevel } from './action-plan.schema.js';

export type ActionPlanItemDocument = HydratedDocument<ActionPlanItem>;

export interface ItemLogEntry {
  actorId: string;
  action: string;
  at: Date;
  note?: string;
}

@Schema({
  collection: 'action_plan_items',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  versionKey: false,
})
export class ActionPlanItem {
  _id!: string;

  @Prop({ required: true, index: true })
  planId!: string;

  @Prop({ required: true, index: true })
  workspaceId!: string;

  @Prop({ required: true })
  itemTitle!: string;

  @Prop({ type: String })
  description?: string;

  @Prop({ type: String, required: true, default: 'open', index: true })
  status!: ActionPlanStatus;

  @Prop({ type: String, required: true, default: 'medium' })
  priority!: PriorityLevel;

  @Prop({ type: Date })
  dueAt?: Date;

  @Prop({ type: String })
  assignedTo?: string;

  @Prop({ type: Array, default: [] })
  executionLog?: ItemLogEntry[];

  @Prop({ type: Date })
  closedAt?: Date;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const ActionPlanItemSchema = SchemaFactory.createForClass(ActionPlanItem);
ActionPlanItemSchema.index({ planId: 1, status: 1 });
ActionPlanItemSchema.index({ workspaceId: 1, updatedAt: -1 });