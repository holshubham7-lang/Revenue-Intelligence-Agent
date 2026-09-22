import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { EncryptionModule } from '../encryption/encryption.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { PluginsModule } from '../plugins/plugins.module.js';
import { PluginConnectionsModule } from '../plugin-connections/plugin-connections.module.js';
import { PluginConsentsModule } from '../plugin-consents/plugin-consents.module.js';
import { ConnectorRuntimeModule } from '../connector-runtime/connector-runtime.module.js';
import { DataSyncModule } from '../data-sync/data-sync.module.js';
import { OAuthState, OAuthStateSchema } from './oauth-state.schema.js';
import { OAuthStateService } from './oauth-state.service.js';
import { PluginOAuthService } from './plugin-oauth.service.js';
import { PluginOAuthController } from './plugin-oauth.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OAuthState.name, schema: OAuthStateSchema },
    ]),
    AuthModule,
    WorkspacesModule,
    EncryptionModule,
    AuditModule,
    PluginsModule,
    PluginConnectionsModule,
    PluginConsentsModule,
    ConnectorRuntimeModule,
    DataSyncModule,
  ],
  controllers: [PluginOAuthController],
  providers: [PluginOAuthService, OAuthStateService],
  exports: [PluginOAuthService],
})
export class PluginOAuthModule {}