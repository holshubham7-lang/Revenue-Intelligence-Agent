import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type DataSync = HydratedDocument<DataSyncRun>;

export type DataSyncKind = 'initial' | 'refresh';
export type DataSyncTrigger = 'manual' | 'callback' | 'schedule';
export type DataSyncStatus = 'running' | 'success' | 'error';

@Schema({
  collection: 'data_syncs',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  versionKey: false,
})
export class DataSyncRun {
  _id!: string;

  @Prop({ required: true, index: true })
  workspaceId!: string;

  @Prop({ required: true, index: true })
  connectionId!: string;

  @Prop({ required: true })
  connectorSlug!: string;

  @Prop({ type: String, required: true })
  kind!: DataSyncKind;

  @Prop({ type: String, required: true })
  trigger!: DataSyncTrigger;

  @Prop({ type: String, required: true, default: 'running' })
  status!: DataSyncStatus;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  finishedAt?: Date;

  @Prop({ type: Number, default: 0 })
  capabilitiesProcessed?: number;

  @Prop({ type: Number, default: 0 })
  recordsTotal?: number;

  @Prop({ type: Array, default: [] })
  perCapability?: Array<{
    capability: string;
    written: number;
    upserted: number;
  }>;

  @Prop({ type: Object })
  changeSummary?: {
    added: number;
    removed: number;
    modified: number;
  };

  @Prop({ type: String })
  snapshotId?: string;

  @Prop({ type: Number, default: 0 })
  snapshotSeq?: number;

  @Prop({ type: String })
  error?: string;

  @Prop({ type: String })
  createdBy?: string;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const DataSyncSchema = SchemaFactory.createForClass(DataSyncRun);
DataSyncSchema.index({ connectionId: 1, startedAt: -1 });