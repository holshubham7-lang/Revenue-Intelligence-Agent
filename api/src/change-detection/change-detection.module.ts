import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { User, UserSchema } from '../users/user.schema.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { PluginConnectionsModule } from '../plugin-connections/plugin-connections.module.js';
import { SnapshotsModule } from '../snapshots/snapshots.module.js';
import {
  RevenueChange,
  RevenueChangeSchema,
} from './revenue-change.schema.js';
import { ChangeDetectionService } from './change-detection.service.js';
import { ChangeDetectionController } from './change-detection.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RevenueChange.name, schema: RevenueChangeSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AuthModule,
    WorkspacesModule,
    PluginConnectionsModule,
    SnapshotsModule,
  ],
  controllers: [ChangeDetectionController],
  providers: [ChangeDetectionService],
  exports: [ChangeDetectionService],
})
export class ChangeDetectionModule {}