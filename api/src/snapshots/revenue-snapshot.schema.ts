import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import type { RevenueSummary } from '../revenue-data/revenue-data.service.js';

export type RevenueSnapshotDocument = HydratedDocument<RevenueSnapshot>;

export interface EntityFingerprint {
  entityType: string;
  sourceKey: string;
  rawHash: string;
  amount?: number;
  stage?: string;
}

@Schema({
  collection: 'revenue_snapshots',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  versionKey: false,
})
export class RevenueSnapshot {
  _id!: string;

  @Prop({ required: true, index: true })
  workspaceId!: string;

  @Prop({ required: true, index: true })
  connectionId!: string;

  @Prop({ required: true })
  snapshotTimestamp!: Date;

  /** Monotonic sequence number for the connection (only ever appended). */
  @Prop({ required: true, default: 1 })
  seq!: number;

  /** Aggregate metrics captured by the revenue model. */
  @Prop({ type: Object, required: true })
  summary!: RevenueSummary;

  /** Counts per entity type at snapshot time. */
  @Prop({ type: Object, default: {} })
  recordCounts?: Record<string, number>;

  /** Lightweight per-entity fingerprints for add/remove/modify diffing. */
  @Prop({ type: Array, default: [] })
  entityFingerprints?: EntityFingerprint[];

  @Prop({ type: String })
  runId?: string;

  @Prop({ type: String })
  createdBy?: string;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const RevenueSnapshotSchema = SchemaFactory.createForClass(RevenueSnapshot);
RevenueSnapshotSchema.index({ connectionId: 1, seq: 1 }, { unique: true });
RevenueSnapshotSchema.index({ workspaceId: 1, snapshotTimestamp: -1 });