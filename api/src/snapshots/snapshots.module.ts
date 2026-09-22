import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import {
  RevenueEntity,
  RevenueEntitySchema,
} from '../revenue-data/revenue-entity.schema.js';
import {
  RevenueSnapshot,
  RevenueSnapshotSchema,
} from './revenue-snapshot.schema.js';
import { SnapshotsService } from './snapshots.service.js';
import { SnapshotsController } from './snapshots.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RevenueSnapshot.name, schema: RevenueSnapshotSchema },
      { name: RevenueEntity.name, schema: RevenueEntitySchema },
    ]),
    AuthModule,
    WorkspacesModule,
  ],
  controllers: [SnapshotsController],
  providers: [SnapshotsService],
  exports: [SnapshotsService],
})
export class SnapshotsModule {}