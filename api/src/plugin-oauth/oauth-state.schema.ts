import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type OAuthStateDocument = HydratedDocument<OAuthState>;

/**
 * One-time OAuth CSRF/state token used by the generic connector OAuth flow.
 * Only the SHA-256 hash of the state is persisted; the raw value is returned
 * to the caller exactly once.
 */
@Schema({
  collection: 'oauth_states',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  versionKey: false,
})
export class OAuthState {
  _id!: string;

  @Prop({ required: true, index: true })
  workspaceId!: string;

  @Prop({ required: true, index: true })
  connectorSlug!: string;

  @Prop({ required: true, index: true })
  connectionId!: string;

  @Prop({ required: true, unique: true })
  stateHash!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ type: Boolean, default: false })
  used!: boolean;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const OAuthStateSchema = SchemaFactory.createForClass(OAuthState);