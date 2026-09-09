import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

export type AuthProvider = 'email' | 'google' | 'microsoft' | 'linkedin';

@Schema({
  collection: 'users',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  versionKey: false,
  autoIndex: true,
  toJSON: {
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret.passwordHash;
      delete ret.__v;
      return ret;
    },
  },
})
export class User {
  _id!: string;

  @Prop({ required: true, trim: true, maxlength: 120 })
  name!: string;

  @Prop({
    type: {
      iv: { type: String, required: true },
      tag: { type: String, required: true },
      data: { type: String, required: true },
    },
    select: false,
  })
  nameEncrypted?: { iv: string; tag: string; data: string };

  @Prop({
    required: true,
    unique: true,
    index: true,
    lowercase: true,
    trim: true,
    maxlength: 255,
  })
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

  @Prop({
    type: String,
    index: true,
  })
  companyId?: string;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index(
  { authProvider: 1, providerId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      authProvider: { $in: ['google', 'microsoft', 'linkedin'] },
    },
  },
);
