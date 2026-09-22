import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  PluginConsent,
  PluginConsentDocument,
} from './plugin-consent.schema.js';
import { PluginConsentsService } from './plugin-consents.service.js';

@Controller('consents')
@UseGuards(JwtAuthGuard)
export class PluginConsentsController {
  constructor(
    @InjectModel(PluginConsent.name)
    private readonly consentModel: Model<PluginConsentDocument>,
    private readonly consentsService: PluginConsentsService,
    private readonly workspacesService: WorkspacesService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  async listForUser(@CurrentUserId() userId: string) {
    const workspaceId = await this.workspacesService.resolveForUser(userId);
    const consents = await this.consentModel
      .find({ workspaceId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return consents.map((c) => ({
      id: c._id.toString(),
      workspaceId: c.workspaceId,
      connectorId: c.connectorId,
      connectionId: c.connectionId,
      consentState: c.consentState,
      grantedScopes: c.grantedScopes,
      consentGivenAt: c.consentGivenAt,
      consentRevokedAt: c.consentRevokedAt,
      revocationReason: c.revocationReason,
    }));
  }
}