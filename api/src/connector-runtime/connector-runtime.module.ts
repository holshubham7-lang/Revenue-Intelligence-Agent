import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { User, UserSchema } from '../users/user.schema.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { PluginsModule } from '../plugins/plugins.module.js';
import { PluginConnectionsModule } from '../plugin-connections/plugin-connections.module.js';
import { ConnectorAdapterService } from './connector-adapter.service.js';
import { ConnectorRuntimeService } from './connector-runtime.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    AuthModule,
    WorkspacesModule,
    PluginsModule,
    PluginConnectionsModule,
  ],
  providers: [ConnectorAdapterService, ConnectorRuntimeService],
  exports: [ConnectorRuntimeService, ConnectorAdapterService],
})
export class ConnectorRuntimeModule {}