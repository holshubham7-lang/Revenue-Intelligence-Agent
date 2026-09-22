import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { User, UserSchema } from '../users/user.schema.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { PluginsModule } from '../plugins/plugins.module.js';
import { PluginConnectionsModule } from '../plugin-connections/plugin-connections.module.js';
import { PluginConsentsModule } from '../plugin-consents/plugin-consents.module.js';
import { ConnectorRuntimeModule } from '../connector-runtime/connector-runtime.module.js';
import { RevenueDataModule } from '../revenue-data/revenue-data.module.js';
import { SnapshotsModule } from '../snapshots/snapshots.module.js';
import { ChangeDetectionModule } from '../change-detection/change-detection.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { DataSyncRun, DataSyncSchema } from './data-sync.schema.js';
import { SyncTasksService } from './sync-tasks.service.js';
import { DataSyncController } from './data-sync.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DataSyncRun.name, schema: DataSyncSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AuthModule,
    WorkspacesModule,
    PluginsModule,
    PluginConnectionsModule,
    PluginConsentsModule,
    ConnectorRuntimeModule,
    RevenueDataModule,
    SnapshotsModule,
    ChangeDetectionModule,
    AuditModule,
  ],
  controllers: [DataSyncController],
  providers: [SyncTasksService],
  exports: [SyncTasksService],
})
export class DataSyncModule {}