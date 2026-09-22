import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type RevenueChangeDocument = HydratedDocument<RevenueChange>;

export type ChangeLayerType =
  | 'summary'
  | 'growth'
  | 'units'
  | 'contract'
  | 'default';

export type RevenueChangeType =
  | 'added'
  | 'removed'
  | 'modified'
  | 'layer';

export type SeverityLevel = 'low' | 'medium' | 'high';

@Schema({
  collection: 'revenue_changes',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  versionKey: false,
})
export class RevenueChange {
  _id!: string;

  @Prop({ required: true, index: true })
  workspaceId!: string;

  @Prop({ required: true, index: true })
  connectionId!: string;

  /** Snapshot this change was detected against (the newer one). */
  @Prop({ required: true })
  snapshotId!: string;

  @Prop({ required: true })
  snapshotSeq!: number;

  @Prop({ required: true })
  diffType!: RevenueChangeType;

  @Prop({ type: String })
  layer?: ChangeLayerType;

  @Prop({ type: String })
  entityType?: string;

  @Prop({ type: String })
  sourceKey?: string;

  @Prop({ type: String })
  name?: string;

  @Prop({ type: Number })
  previousAmount?: number;

  @Prop({ type: Number })
  newAmount?: number;

  @Prop({ type: String })
  previousStage?: string;

  @Prop({ type: String })
  newStage?: string;

  @Prop({ required: true })
  severity!: SeverityLevel;

  @Prop({ type: String })
  significance?: string;

  @Prop({ type: String })
  notes?: string;

  @Prop({ default: false })
  reviewed?: boolean;

  @Prop({ type: Date })
  detectedAt!: Date;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const RevenueChangeSchema = SchemaFactory.createForClass(RevenueChange);
RevenueChangeSchema.index(
  { connectionId: 1, snapshotId: 1, sourceKey: 1 },
  { unique: true, sparse: true, name: 'revenue_change_dedupe_unique' },
);
RevenueChangeSchema.index({ workspaceId: 1, detectedAt: -1 });