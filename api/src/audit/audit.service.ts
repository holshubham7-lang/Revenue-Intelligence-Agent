import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AuditLog,
  AuditLogDocument,
  AuditAction,
  AuditCategory,
} from './audit-log.schema.js';

export interface AuditRecordInput {
  workspaceId: string;
  actorId?: string;
  action: AuditAction;
  category: AuditCategory;
  targetType?: string;
  targetId?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Immutable audit trail. Every security-relevant operation (connect,
 * disconnect, consent grant/revoke, token refresh, sync, AI analysis,
 * action plan operations) records an entry that cannot be modified.
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditModel: Model<AuditLogDocument>,
  ) {}

  async record(input: AuditRecordInput): Promise<AuditLogDocument> {
    return this.auditModel.create({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: input.action,
      category: input.category,
      targetType: input.targetType,
      targetId: input.targetId,
      message: input.message,
      metadata: input.metadata,
    });
  }

  async listForWorkspace(
    workspaceId: string,
    options: { limit?: number; category?: AuditCategory } = {},
  ): Promise<AuditLogDocument[]> {
    const filter: Record<string, unknown> = { workspaceId };
    if (options.category) filter.category = options.category;
    return this.auditModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(options.limit ?? 50, 200))
      .lean()
      .exec();
  }
}