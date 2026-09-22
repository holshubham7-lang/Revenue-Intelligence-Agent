import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PluginConsent,
  PluginConsentDocument,
  ConsentState,
} from './plugin-consent.schema.js';
import { AuditService } from '../audit/audit.service.js';

export interface GrantConsentInput {
  workspaceId: string;
  connectorId: string;
  connectionId: string;
  givenByUserId: string;
  scopes?: string[];
  scope?: string;
}

@Injectable()
export class PluginConsentsService {
  constructor(
    @InjectModel(PluginConsent.name)
    private readonly consentModel: Model<PluginConsentDocument>,
    private readonly auditService: AuditService,
  ) {}

  async grant(input: GrantConsentInput): Promise<PluginConsentDocument> {
    const consent = await this.consentModel
      .findOneAndUpdate(
        { connectionId: input.connectionId },
        {
          $set: {
            workspaceId: input.workspaceId,
            connectorId: input.connectorId,
            consentState: 'GRANTED' as ConsentState,
            givenByUserId: input.givenByUserId,
            grantedScopes: input.scopes?.join(', ') ?? input.scope ?? '',
            scopes: input.scopes,
            scope: input.scope,
            consentGivenAt: new Date(),
            consentRevokedAt: null,
            revocationReason: null,
            revokedByUserId: null,
          },
        },
        { upsert: true, new: true },
      )
      .exec();

    await this.auditService.record({
      workspaceId: input.workspaceId,
      actorId: input.givenByUserId,
      action: 'granted',
      category: 'consent',
      targetType: 'plugin_connection',
      targetId: input.connectionId,
      message: `Consent granted for connector ${input.connectorId}`,
      metadata: { scopes: input.scopes ?? [] },
    });
    return consent;
  }

  async verifyActive(connectionId: string): Promise<PluginConsentDocument> {
    const consent = await this.consentModel
      .findOne({ connectionId, consentState: 'GRANTED' })
      .exec();
    if (!consent) {
      throw new NotFoundException(
        'No active consent exists for this connection. Consent is required before data can be synced.',
      );
    }
    return consent;
  }

  async findByConnection(connectionId: string): Promise<PluginConsentDocument | null> {
    return this.consentModel.findOne({ connectionId }).lean().exec();
  }

  /**
   * Revokes consent for a connection, with reason and optional audience.
   * Returns true if a GRANTED consent transitioned to REVOKED.
   */
  async revoke(
    connectionId: string,
    input: {
      workspaceId: string;
      actorId?: string;
      reason?: string;
      permissionsForRevoke?: 'adhoc' | 'scheduled';
    },
  ): Promise<boolean> {
    const result = await this.consentModel
      .findOneAndUpdate(
        { connectionId, consentState: 'GRANTED' },
        {
          $set: {
            consentState: 'REVOKED' as ConsentState,
            consentRevokedAt: new Date(),
            revocationReason: input.reason ?? 'User requested disconnect',
            revokedByUserId: input.actorId,
            permissionsForRevoke:
              input.permissionsForRevoke ?? ('adhoc' as const),
          },
        },
        { new: true },
      )
      .exec();

    if (!result) return false;

    await this.auditService.record({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: 'revoked',
      category: 'consent',
      targetType: 'plugin_connection',
      targetId: connectionId,
      message: 'Consent revoked',
      metadata: { reason: input.reason },
    });
    return true;
  }

  async expiresAdhocConnection(
    connectionId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.consentModel
      .updateOne(
        { connectionId, consentState: 'GRANTED' },
        {
          $set: {
            consentState: 'EXPIRED' as ConsentState,
            consentRevokedAt: new Date(),
            revocationReason: 'Session validity window elapsed',
          },
        },
      )
      .exec();
    await this.auditService.record({
      workspaceId,
      action: 'expired',
      category: 'consent',
      targetType: 'plugin_connection',
      targetId: connectionId,
      message: 'Consent expired after session validity window',
    });
  }
}