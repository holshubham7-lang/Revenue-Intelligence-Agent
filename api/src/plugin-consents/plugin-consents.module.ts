import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import {
  PluginConsent,
  PluginConsentSchema,
} from './plugin-consent.schema.js';
import { PluginConsentsService } from './plugin-consents.service.js';
import { PluginConsentsController } from './plugin-consents.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PluginConsent.name, schema: PluginConsentSchema },
    ]),
    AuthModule,
    WorkspacesModule,
    AuditModule,
  ],
  controllers: [PluginConsentsController],
  providers: [PluginConsentsService],
  exports: [PluginConsentsService],
})
export class PluginConsentsModule {}