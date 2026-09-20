import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type UserPluginDocument = HydratedDocument<UserPlugin>;

export type ConnectionStatus = 'connected' | 'pending' | 'error' | 'expired';

@Schema({
  collection: 'user_plugins',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  versionKey: false,
})
export class UserPlugin {
  _id!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true, index: true })
  pluginSlug!: string;

  @Prop({
    type: String,
    enum: ['connected', 'pending', 'error', 'expired'],
    default: 'pending',
  })
  status!: ConnectionStatus;

  /** Encrypted access token blob (iv | data | tag). */
  @Prop({ type: String })
  encryptedToken?: string;

  /** Decrypted account identifier shown in the UI (e.g. portal name). */
  @Prop({ type: String })
  accountName?: string;

  /** Scopes actually granted at connect time. */
  @Prop({ type: [String], default: [] })
  scopes?: string[];

  @Prop({ type: Date })
  connectedAt?: Date;

  @Prop({ type: Date })
  lastSyncAt?: Date;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const UserPluginSchema = SchemaFactory.createForClass(UserPlugin);
UserPluginSchema.index(
  { userId: 1, pluginSlug: 1 },
  { unique: true, name: 'user_plugin_unique' },
);