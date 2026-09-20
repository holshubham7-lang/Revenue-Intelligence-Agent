import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { Plugin, PluginSchema } from './plugin.schema.js';
import { UserPlugin, UserPluginSchema } from './user-plugin.schema.js';
import { PluginsService } from './plugins.service.js';
import { PluginsController } from './plugins.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Plugin.name, schema: PluginSchema },
      { name: UserPlugin.name, schema: UserPluginSchema },
    ]),
    AuthModule,
  ],
  controllers: [PluginsController],
  providers: [PluginsService],
  exports: [PluginsService],
})
export class PluginsModule implements OnModuleInit {
  constructor(private readonly pluginsService: PluginsService) {}

  async onModuleInit(): Promise<void> {
    await this.pluginsService.seedCatalog();
  }
}