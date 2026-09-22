import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type PluginDocument = HydratedDocument<Plugin>;

export type PluginSource = 'builtin' | 'foundry';
export type PluginAuthType = 'oauth2' | 'apikey' | 'manual';
export type PluginAuthMode = 'azure-managed' | 'oauth' | 'manual';
export type PluginCategory =
  | 'crm'
  | 'marketing'
  | 'support'
  | 'data'
  | 'product';

/**
 * Per-connector OAuth metadata. When present, the platform authenticates
 * against the connector's own authorization/token servers. When absent for
 * catalog (foundry) connectors, the Azure managed-connector consent flow is
 * used instead. Client secrets are always stored encrypted.
 */
export interface PluginOAuthConfig {
  authorizationUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  /** Name of an env var holding the client secret; never persisted. */
  clientSecretRef?: string;
  scope?: string[];
  baseUrl?: string;
  responseType?: string;
}

/** Metadata used by the generic normalizer to map connector records. */
export interface PluginNormalizationConfig {
  entityType?: string;
  idField?: string;
  nameField?: string;
  amountField?: string;
  statusField?: string;
  stageField?: string;
  dateField?: string;
}

@Schema({
  collection: 'plugins',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  versionKey: false,
})
export class Plugin {
  _id!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug!: string;

  @Prop({ required: true, trim: true, maxlength: 120 })
  name!: string;

  @Prop({ type: String, default: '', maxlength: 500 })
  description?: string;

  @Prop({
    type: String,
    enum: ['crm', 'marketing', 'support', 'data', 'product'],
    default: 'crm',
  })
  category!: PluginCategory;

  /** Brand mark initials / short label, e.g. "HS", "SF". */
  @Prop({ type: String, default: '' })
  mark?: string;

  /** Brand accent color for the plugin tile (hex). */
  @Prop({ type: String, default: '#34744e' })
  brandColor?: string;

  /** Optional brand logo / mark URL shown on the plugin tile. */
  @Prop({ type: String })
  iconUrl?: string;

  /** Who provides the integration: built-in adapter or Azure Foundry catalog. */
  @Prop({
    type: String,
    enum: ['builtin', 'foundry'],
    default: 'builtin',
  })
  source!: PluginSource;

  /** Auth mechanism used to connect. */
  @Prop({
    type: String,
    enum: ['oauth2', 'apikey', 'manual'],
    default: 'oauth2',
  })
  authType!: PluginAuthType;

  /** Read-only OAuth scopes requested when connecting. */
  @Prop({ type: [String], default: [] })
  scopes?: string[];

  /** Expose the connector in the plugin marketplace. */
  @Prop({ type: Boolean, default: true })
  enabled?: boolean;

  /** Sort weight for catalog ordering (lower first). */
  @Prop({ type: Number, default: 100 })
  sortOrder?: number;

  /** Auth engine used to connect: Azure-managed or metadata-driven OAuth. */
  @Prop({
    type: String,
    enum: ['azure-managed', 'oauth', 'manual'],
    default: 'oauth',
  })
  authMode?: PluginAuthMode;

  /** Read model capabilities exposed to the connector runtime, e.g. deals. */
  @Prop({ type: [String], default: [] })
  capabilities?: string[];

  /** OAuth metadata for connectors authenticated directly (not via Azure). */
  @Prop({ type: Object })
  oauthConfig?: PluginOAuthConfig;

  /** Normalizer field mapping consumed by the generic revenue normalizer. */
  @Prop({ type: Object })
  normalization?: PluginNormalizationConfig;

  /** Only set for Foundry-sourced plugins. */
  @Prop({ type: String })
  foundryToolId?: string;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const PluginSchema = SchemaFactory.createForClass(Plugin);