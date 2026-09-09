import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type AdminUserDocument = HydratedDocument<AdminUser>;
export type AdminAuditLogDocument = HydratedDocument<AdminAuditLog>;

export type AuthProvider = 'email' | 'google' | 'microsoft' | 'linkedin';

export type AuditEvent =
  | 'auth.signup'
  | 'auth.signin'
  | 'auth.signin.failed'
  | 'auth.logout'
  | 'user.password.changed'
  | 'user.profile.updated'
  | 'company.created';

export type AuditActorType = 'user' | 'system' | 'anonymous';

/**
 * Mirrors the app's `users` collection. `nameEncrypted` deliberately does NOT
 * use `select: false` here — the admin panel reads it and decrypts via the
 * shared ENCRYPTION_KEY. `passwordHash` is intentionally absent from responses
 * (never serialized).
 */
@Schema({
  collection: 'users',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  versionKey: false,
})
export class AdminUser {
  _id!: string;

  @Prop({ required: true, trim: true, maxlength: 120 })
  name!: string;

  @Prop({
    type: {
      iv: { type: String, required: true },
      tag: { type: String, required: true },
      data: { type: String, required: true },
    },
  })
  nameEncrypted?: { iv: string; tag: string; data: string };

  @Prop({ required: true, unique: true, index: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ type: String })
  profileImage?: string;

  @Prop({
    type: String,
    enum: ['email', 'google', 'microsoft', 'linkedin'],
    default: 'email',
  })
  authProvider!: AuthProvider;

  @Prop({ type: String })
  providerId?: string;

  @Prop()
  passwordHash?: string;

  @Prop({ type: Boolean, default: false })
  isEmailVerified!: boolean;

  @Prop({ type: Boolean, default: false })
  isBlocked!: boolean;

  @Prop({ type: Boolean, default: false })
  isTestAccount!: boolean;

  @Prop({ type: Number, default: 0 })
  tokenVersion!: number;

  @Prop({ type: String, index: true })
  companyId?: string;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const AdminUserSchema = SchemaFactory.createForClass(AdminUser);

@Schema({
  collection: 'audit_logs',
  timestamps: { createdAt: 'createdAt', updatedAt: false },
  versionKey: false,
})
export class AdminAuditLog {
  _id!: string;

  @Prop({ type: String, required: true, enum: ['auth.signup', 'auth.signin', 'auth.signin.failed', 'auth.logout', 'user.password.changed', 'user.profile.updated', 'company.created'] })
  event!: AuditEvent;

  @Prop({ type: String, enum: ['user', 'system', 'anonymous'] })
  actorType!: AuditActorType;

  @Prop({ type: String, index: true })
  actorId?: string;

  @Prop({ type: String })
  ip?: string;

  @Prop({ type: String })
  userAgent?: string;

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, unknown>;

  @Prop({ type: Date })
  createdAt?: Date;
}

export const AdminAuditLogSchema =
  SchemaFactory.createForClass(AdminAuditLog);