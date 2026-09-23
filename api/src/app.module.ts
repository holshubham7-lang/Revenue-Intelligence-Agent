import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { UsersModule } from './users/users.module.js';
import { CompaniesModule } from './companies/companies.module.js';
import { SocialAuthModule } from './social-auth/social-auth.module.js';
import { VaultModule } from './vault/vault.module.js';
import { AgentModule } from './agent/agent.module.js';
import { PluginsModule } from './plugins/plugins.module.js';
import { WorkspacesModule } from './workspaces/workspaces.module.js';
import { AuditModule } from './audit/audit.module.js';
import { PluginConsentsModule } from './plugin-consents/plugin-consents.module.js';
import { PluginConnectionsModule } from './plugin-connections/plugin-connections.module.js';
import { ConnectorRuntimeModule } from './connector-runtime/connector-runtime.module.js';
import { RevenueDataModule } from './revenue-data/revenue-data.module.js';
import { SnapshotsModule } from './snapshots/snapshots.module.js';
import { ChangeDetectionModule } from './change-detection/change-detection.module.js';
import { DataSyncModule } from './data-sync/data-sync.module.js';
import { RevenueIntelligenceModule } from './revenue-intelligence/revenue-intelligence.module.js';
import { ActionPlansModule } from './action-plans/action-plans.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    VaultModule,
    UsersModule,
    CompaniesModule,
    SocialAuthModule,
    AgentModule,
    PluginsModule,
    WorkspacesModule,
    AuditModule,
    PluginConsentsModule,
    PluginConnectionsModule,
    ConnectorRuntimeModule,
    RevenueDataModule,
    SnapshotsModule,
    ChangeDetectionModule,
    DataSyncModule,
    RevenueIntelligenceModule,
    ActionPlansModule,
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri:
          config.get<string>('MONGODB_URI') ??
          'mongodb://127.0.0.1:27017/revops',
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}