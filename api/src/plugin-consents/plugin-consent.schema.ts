import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type PluginConsentDocument = HydratedDocument<PluginConsent>;

export type ConsentState = 'GRANTED' | 'REVOKED' | 'EXPIRED';
export type RevokePermission = 'adhoc' | 'scheduled';

@Schema({
  collection: 'plugin_consents',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  versionKey: false,
})
export class PluginConsent {
  _id!: string;

  @Prop({ required: true, index: true })
  workspaceId!: string;

  /** Marketplace catalog slug. */
  @Prop({ required: true, index: true })
  connectorId!: string;

  @Prop({ required: true, index: true })
  connectionId!: string;

  /** Who may revoke this consent: user-triggered or platform-scheduled. */
  @Prop({
    type: String,
    enum: ['adhoc', 'scheduled'],
    default: 'adhoc',
  })
  permissionsForRevoke?: RevokePermission;

  @Prop({
    type: String,
    enum: ['GRANTED', 'REVOKED', 'EXPIRED'],
    required: true,
    default: 'GRANTED',
  })
  consentState!: ConsentState;

  @Prop({ type: String })
  grantedScopes?: string;

  @Prop({ type: [String], default: [] })
  scopes?: string[];

  @Prop({ type: String })
  scope?: string;

  @Prop({ type: Date })
  consentGivenAt?: Date;

  @Prop({ type: Date })
  consentRevokedAt?: Date;

  @Prop({ type: String })
  revocationReason?: string;

  @Prop({ type: String })
  revokedByUserId?: string;

  @Prop({ type: String })
  givenByUserId?: string;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const PluginConsentSchema = SchemaFactory.createForClass(PluginConsent);
PluginConsentSchema.index(
  { connectionId: 1 },
  { unique: true, name: 'plugin_consent_connection_unique' },
);
PluginConsentSchema.index({ workspaceId: 1, consentState: 1 });
PluginConsentSchema.index({ connectorId: 1, consentState: 1 });