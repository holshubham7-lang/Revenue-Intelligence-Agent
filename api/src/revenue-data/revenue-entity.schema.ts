import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type RevenueEntityDocument = HydratedDocument<RevenueEntity>;

/**
 * Normalized, connector-agnostic revenue record. Change detection and
 * Revenue Intelligence operate exclusively on these records.
 */
@Schema({
  collection: 'revenue_entities',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  versionKey: false,
})
export class RevenueEntity {
  _id!: string;

  @Prop({ required: true, index: true })
  workspaceId!: string;

  @Prop({ required: true, index: true })
  connectionId!: string;

  @Prop({ required: true })
  connectorSlug!: string;

  /** Capability-derived type, e.g. deal, contact, ticket, invoice. */
  @Prop({ required: true })
  entityType!: string;

  /** Stable connector id; the dedupe key within a connection. */
  @Prop({ required: true })
  sourceKey!: string;

  @Prop({ type: String })
  name?: string;

  @Prop({ type: Number, default: 0 })
  amount?: number;

  @Prop({ type: String, default: 'USD' })
  currency?: string;

  @Prop({ type: String })
  status?: string;

  @Prop({ type: String })
  stage?: string;

  @Prop({ type: Date })
  rawDate?: Date;

  /** Raw record snapshot, retained for diagnostics. */
  @Prop({ type: Object })
  raw?: Record<string, unknown>;

  @Prop({ type: String })
  rawHash?: string;

  @Prop({ type: Date })
  syncedAt?: Date;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const RevenueEntitySchema = SchemaFactory.createForClass(RevenueEntity);
RevenueEntitySchema.index(
  { workspaceId: 1, connectionId: 1, entityType: 1, sourceKey: 1 },
  { unique: true, name: 'revenue_entity_dedupe_unique' },
);
RevenueEntitySchema.index({ workspaceId: 1, entityType: 1, stage: 1 });