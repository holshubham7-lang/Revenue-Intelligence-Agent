import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type ActionPlanDocument = HydratedDocument<ActionPlan>;

export type ActionPlanStatus = 'draft' | 'open' | 'in_progress' | 'done' | 'cancelled';
export type PriorityLevel = 'low' | 'medium' | 'high';

@Schema({
  collection: 'action_plans',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  versionKey: false,
})
export class ActionPlan {
  _id!: string;

  @Prop({ required: true, index: true })
  workspaceId!: string;

  @Prop({ type: String, index: true })
  connectionId?: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ type: String })
  summary?: string;

  @Prop({
    required: true,
    default: 'draft',
    index: true,
  })
  status!: ActionPlanStatus;

  @Prop({ required: true, default: 'medium' })
  priority!: PriorityLevel;

  @Prop({ type: String })
  createdBy?: string;

  /** Finding(s) that motivated this plan. */
  @Prop({ type: [String], default: [] })
  findingIds?: string[];

  @Prop({ type: String })
  phase?: string;

  @Prop({ type: Date })
  targetDate?: Date;

  @Prop({ type: Boolean, default: false })
  draft?: boolean;

  @Prop({ type: Boolean, default: false })
  adopted?: boolean;

  @Prop({ type: Date })
  adoptedAt?: Date;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const ActionPlanSchema = SchemaFactory.createForClass(ActionPlan);
ActionPlanSchema.index({ workspaceId: 1, createdAt: -1 });