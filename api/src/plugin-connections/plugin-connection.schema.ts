import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type PluginConnectionDocument = HydratedDocument<PluginConnection>;

export type ConnectionStatus =
  | 'pending'
  | 'active'
  | 'syncing'
  | 'expired'
  | 'stale'
  | 'revoking'
  | 'revoked'
  | 'error';

export type HydratedDataStatus =
  | 'not_initialized'
  | 'initializing'
  | 'hydrated'
  | 'partial'
  | 'failed';

@Schema({
  collection: 'plugin_connections',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  versionKey: false,
})
export class PluginConnection {
  _id!: string;

  @Prop({ required: true, index: true })
  workspaceId!: string;

  /** Marketplace catalog slug (unique per workspace). */
  @Prop({ required: true, index: true })
  connectorSlug!: string;

  /** Connector identifier in the Azure managedApis catalog (may equal slug). */
  @Prop({ type: String })
  connectorName?: string;

  /** Azure managed-connector connection resource name (managed flow only). */
  @Prop({ type: String })
  azureConnectionName?: string;

  @Prop({ type: String })
  azureRegion?: string;

  @Prop({
    type: String,
    enum: ['pending', 'active', 'syncing', 'expired', 'stale', 'revoking', 'revoked', 'error'],
    default: 'pending',
  })
  status!: ConnectionStatus;

  @Prop({ type: String })
  tokenType?: string;

  /** JSON-serialized EncryptedField protecting the access token at rest. */
  @Prop({ type: String, select: false })
  encryptedAccessToken?: string;

  /** JSON-serialized EncryptedField protecting the refresh token at rest. */
  @Prop({ type: String, select: false })
  encryptedRefreshToken?: string;

  @Prop({ type: Date })
  expiresAt?: Date;

  @Prop({ type: Date })
  nextRefreshAt?: Date;

  @Prop({ type: String })
  providerAccountId?: string;

  @Prop({ type: String })
  accountName?: string;

  @Prop({ type: [String], default: [] })
  readScopes?: string[];

  @Prop({ type: [String], default: [] })
  writeScopes?: string[];

  @Prop({
    type: String,
    enum: ['not_initialized', 'initializing', 'hydrated', 'partial', 'failed'],
    default: 'not_initialized',
  })
  hydratedDataStatus?: HydratedDataStatus;

  @Prop({ type: String })
  oauthRedirectUrl?: string;

  @Prop({ type: String, index: true })
  createdBy?: string;

  @Prop({ type: Date })
  connectedAt?: Date;

  @Prop({ type: Date })
  lastSyncedAt?: Date;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const PluginConnectionSchema =
  SchemaFactory.createForClass(PluginConnection);
PluginConnectionSchema.index(
  { workspaceId: 1, connectorSlug: 1 },
  { unique: true, name: 'plugin_connection_workspace_unique' },
);
PluginConnectionSchema.index({ workspaceId: 1, status: 1 });