import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { User, UserSchema } from '../users/user.schema.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { EncryptionModule } from '../encryption/encryption.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { PluginsModule } from '../plugins/plugins.module.js';
import { PluginConnectionsModule } from '../plugin-connections/plugin-connections.module.js';
import { PluginConsentsModule } from '../plugin-consents/plugin-consents.module.js';
import { AzureConnectionService } from './azure-connection.service.js';
import { ConnectorAdapterService } from './connector-adapter.service.js';
import { ConnectorRuntimeService } from './connector-runtime.service.js';
import { ConnectorRuntimeController } from './connector-runtime.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    AuthModule,
    WorkspacesModule,
    EncryptionModule,
    AuditModule,
    PluginsModule,
    PluginConnectionsModule,
    PluginConsentsModule,
  ],
  controllers: [ConnectorRuntimeController],
  providers: [
    AzureConnectionService,
    ConnectorAdapterService,
    ConnectorRuntimeService,
  ],
  exports: [ConnectorRuntimeService, ConnectorAdapterService, AzureConnectionService],
})
export class ConnectorRuntimeModule {}