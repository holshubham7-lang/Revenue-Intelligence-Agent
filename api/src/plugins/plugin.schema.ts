import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type PluginDocument = HydratedDocument<Plugin>;

export type PluginSource = 'builtin' | 'foundry';
export type PluginAuthType = 'oauth2' | 'apikey' | 'manual';
export type PluginCategory =
  | 'crm'
  | 'marketing'
  | 'support'
  | 'data'
  | 'product';

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

  /** Only set for Foundry-sourced plugins. */
  @Prop({ type: String })
  foundryToolId?: string;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const PluginSchema = SchemaFactory.createForClass(Plugin);