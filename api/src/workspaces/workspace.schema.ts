import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type WorkspaceDocument = HydratedDocument<Workspace>;

export interface WorkspaceSettings {
  syncCadenceMinutes?: number;
  autoSyncOnRefresh?: boolean;
  retentionDays?: number;
}

@Schema({
  collection: 'workspaces',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  versionKey: false,
})
export class Workspace {
  _id!: string;

  @Prop({ required: true, index: true })
  ownerId!: string;

  @Prop({ type: String })
  companyId?: string;

  @Prop({ required: true, trim: true, maxlength: 200 })
  name!: string;

  @Prop({
    type: {
      syncCadenceMinutes: { type: Number, min: 10, max: 10080 },
      autoSyncOnRefresh: { type: Boolean },
      retentionDays: { type: Number, min: 7, max: 730 },
    },
    default: { syncCadenceMinutes: 1440, autoSyncOnRefresh: true, retentionDays: 365 },
  })
  settings?: WorkspaceSettings;

  @Prop({ type: String })
  createdBy?: string;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const WorkspaceSchema = SchemaFactory.createForClass(Workspace);
WorkspaceSchema.index(
  { ownerId: 1, companyId: 1 },
  { unique: true, name: 'workspace_owner_company_unique' },
);