import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, type HydratedDocument } from 'mongoose';

export type UserPluginDocument = HydratedDocument<UserPlugin>;

export type ConnectionStatus =
  | 'connected'
  | 'pending'
  | 'error'
  | 'expired'
  | 'disconnected';

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
    enum: ['connected', 'pending', 'error', 'expired', 'disconnected'],
    default: 'pending',
  })
  status!: ConnectionStatus;

  /** Connector identifier in the Azure managedApis catalog (e.g. hubspotcrm). */
  @Prop({ type: String })
  connectorName?: string;

  /** How the handshake is performed: Azure managed connector or our adapter. */
  @Prop({ type: String, enum: ['azure', 'adapter'], default: 'azure' })
  authMode?: 'azure' | 'adapter';

  /** Opaque OAuth state for the adapter (Path B) flow, used to correlate callbacks. */
  @Prop({ type: String, index: true })
  oauthState?: string;

  /** Name of the Microsoft.Web/connections resource in Azure. */
  @Prop({ type: String, index: true })
  azureConnectionName?: string;

  /** Azure connection id returned after consent completes. */
  @Prop({ type: String })
  azureConnectionId?: string;

  /** Full ARM resource id of the Azure connection. */
  @Prop({ type: String })
  azureResourceId?: string;

  /** Resource group holding the Azure connection. */
  @Prop({ type: String })
  azureResourceGroup?: string;

  /** Raw status/details snapshot from the Azure connection. */
  @Prop({ type: SchemaTypes.Mixed })
  metadata?: Record<string, unknown>;

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