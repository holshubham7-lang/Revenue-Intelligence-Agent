import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type RevenueFindingDocument = HydratedDocument<RevenueFinding>;

export type FindingSeverity = 'low' | 'medium' | 'high';
export type FindingTrend = 'up' | 'down' | 'flat' | 'mixed';

export interface FindingEntityReference {
  entityType: string;
  sourceKey: string;
  name?: string;
  before?: number;
  after?: number;
  stageChanged?: boolean;
}

@Schema({
  collection: 'revenue_findings',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  versionKey: false,
})
export class RevenueFinding {
  _id!: string;

  @Prop({ required: true, index: true })
  workspaceId!: string;

  @Prop({ required: true, index: true })
  connectionId!: string;

  @Prop({ type: String })
  snapshotId?: string;

  @Prop({ type: String })
  layer?: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ type: String })
  summary?: string;

  @Prop({ type: String, required: true })
  severity!: FindingSeverity;

  @Prop({ type: String })
  trend?: FindingTrend;

  @Prop({ type: Object })
  metrics?: {
    previous?: number;
    current?: number;
    delta?: number;
    pct?: number;
  };

  @Prop({ type: Array, default: [] })
  keyEntities?: FindingEntityReference[];

  @Prop({ type: [String], default: [] })
  recommendations?: string[];

  @Prop({ type: [String], default: [] })
  enginesUsed?: Array<'ai' | 'rule'>;

  @Prop({ type: Object })
  dismissal?: {
    dismissed: boolean;
    dismissedBy?: string;
    dismissedAt?: Date;
  };

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const RevenueFindingSchema = SchemaFactory.createForClass(RevenueFinding);
RevenueFindingSchema.index({ connectionId: 1, snapshotId: 1 });
RevenueFindingSchema.index({ workspaceId: 1, severity: -1 });