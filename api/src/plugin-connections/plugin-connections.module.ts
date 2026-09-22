import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { EncryptionModule } from '../encryption/encryption.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { PluginConsentsModule } from '../plugin-consents/plugin-consents.module.js';
import { PluginsModule } from '../plugins/plugins.module.js';
import {
  PluginConnection,
  PluginConnectionSchema,
} from './plugin-connection.schema.js';
import { UserPlugin, UserPluginSchema } from '../plugins/user-plugin.schema.js';
import { PluginConnectionsService } from './plugin-connections.service.js';
import { PluginConnectionsController } from './plugin-connections.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PluginConnection.name, schema: PluginConnectionSchema },
      { name: UserPlugin.name, schema: UserPluginSchema },
    ]),
    AuthModule,
    WorkspacesModule,
    EncryptionModule,
    AuditModule,
    PluginConsentsModule,
    PluginsModule,
  ],
  controllers: [PluginConnectionsController],
  providers: [PluginConnectionsService],
  exports: [PluginConnectionsService],
})
export class PluginConnectionsModule {}