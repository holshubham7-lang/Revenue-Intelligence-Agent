import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { EncryptionModule } from '../encryption/encryption.module.js';
import { User, UserSchema } from '../users/user.schema.js';
import { Plugin, PluginSchema } from './plugin.schema.js';
import { UserPlugin, UserPluginSchema } from './user-plugin.schema.js';
import { PluginsService } from './plugins.service.js';
import {
  PluginsController,
  PluginsCallbackController,
  PluginsOAuthController,
} from './plugins.controller.js';
import { AzureCatalogService } from './azure-catalog.service.js';
import { AzureConnectionService } from './azure-connection.service.js';
import { ConnectorRegistry } from './connectors/connector-registry.service.js';
import { HubSpotAdapter } from './connectors/hubspot.adapter.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Plugin.name, schema: PluginSchema },
      { name: UserPlugin.name, schema: UserPluginSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AuthModule,
    EncryptionModule,
  ],
  controllers: [
    PluginsController,
    PluginsCallbackController,
    PluginsOAuthController,
  ],
  providers: [
    PluginsService,
    AzureCatalogService,
    AzureConnectionService,
    ConnectorRegistry,
    HubSpotAdapter,
  ],
  exports: [PluginsService],
})
export class PluginsModule implements OnModuleInit {
  constructor(private readonly pluginsService: PluginsService) {}

  async onModuleInit(): Promise<void> {
    await this.pluginsService.seedCatalog();
  }
}