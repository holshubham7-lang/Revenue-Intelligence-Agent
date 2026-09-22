import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

export type AuditCategory =
  | 'connection'
  | 'consent'
  | 'oauth'
  | 'sync'
  | 'snapshot'
  | 'change_detection'
  | 'revenue_intelligence'
  | 'action_plan'
  | 'workspace'
  | 'system';

export type AuditAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'connected'
  | 'disconnected'
  | 'revoked'
  | 'granted'
  | 'expired'
  | 'authorized'
  | 'failed'
  | 'started'
  | 'completed'
  | 'refreshed'
  | 'analyzed'
  | 'applied'
  | 'commented';

@Schema({
  collection: 'audit_logs',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  versionKey: false,
})
export class AuditLog {
  _id!: string;

  @Prop({ required: true, index: true })
  workspaceId!: string;

  @Prop({ type: String })
  actorId?: string;

  @Prop({ type: String })
  impersonatedBy?: string;

  @Prop({
    type: String,
    enum: [
      'created',
      'updated',
      'deleted',
      'connected',
      'disconnected',
      'revoked',
      'granted',
      'expired',
      'authorized',
      'failed',
      'started',
      'completed',
      'refreshed',
      'analyzed',
      'applied',
      'commented',
    ],
    required: true,
  })
  action!: AuditAction;

  @Prop({
    type: String,
    enum: [
      'connection',
      'consent',
      'oauth',
      'sync',
      'snapshot',
      'change_detection',
      'revenue_intelligence',
      'action_plan',
      'workspace',
      'system',
    ],
    required: true,
  })
  category!: AuditCategory;

  @Prop({ type: String, index: true })
  targetType?: string;

  @Prop({ type: String, index: true })
  targetId?: string;

  @Prop({ type: String })
  message?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ type: String })
  ipAddress?: string;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ workspaceId: 1, createdAt: -1 });