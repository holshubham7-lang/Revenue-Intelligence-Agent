import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { AgentModule } from '../agent/agent.module.js';
import { PluginConnectionsModule } from '../plugin-connections/plugin-connections.module.js';
import { SnapshotsModule } from '../snapshots/snapshots.module.js';
import { ChangeDetectionModule } from '../change-detection/change-detection.module.js';
import { AuditModule } from '../audit/audit.module.js';
import {
  RevenueFinding,
  RevenueFindingSchema,
} from './revenue-finding.schema.js';
import { RevenueIntelligenceService } from './revenue-intelligence.service.js';
import { RevenueIntelligenceController } from './revenue-intelligence.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RevenueFinding.name, schema: RevenueFindingSchema },
    ]),
    AuthModule,
    WorkspacesModule,
    AgentModule,
    PluginConnectionsModule,
    SnapshotsModule,
    ChangeDetectionModule,
    AuditModule,
  ],
  controllers: [RevenueIntelligenceController],
  providers: [RevenueIntelligenceService],
  exports: [RevenueIntelligenceService],
})
export class RevenueIntelligenceModule {}