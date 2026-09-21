import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { User, UserSchema } from '../users/user.schema.js';
import { Plugin, PluginSchema } from './plugin.schema.js';
import { UserPlugin, UserPluginSchema } from './user-plugin.schema.js';
import { PluginsService } from './plugins.service.js';
import { PluginsController, PluginsCallbackController } from './plugins.controller.js';
import { AzureCatalogService } from './azure-catalog.service.js';
import { AzureConnectionService } from './azure-connection.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Plugin.name, schema: PluginSchema },
      { name: UserPlugin.name, schema: UserPluginSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AuthModule,
  ],
  controllers: [PluginsController, PluginsCallbackController],
  providers: [PluginsService, AzureCatalogService, AzureConnectionService],
  exports: [PluginsService],
})
export class PluginsModule implements OnModuleInit {
  constructor(private readonly pluginsService: PluginsService) {}

  async onModuleInit(): Promise<void> {
    await this.pluginsService.seedCatalog();
  }
}