import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ConnectorRuntimeModule } from '../connector-runtime/connector-runtime.module.js';
import {
  RevenueEntity,
  RevenueEntitySchema,
} from './revenue-entity.schema.js';
import { RevenueNormalizerService } from './revenue-normalizer.service.js';
import { RevenueDataService } from './revenue-data.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RevenueEntity.name, schema: RevenueEntitySchema },
    ]),
    AuthModule,
    WorkspacesModule,
    ConnectorRuntimeModule,
  ],
  providers: [RevenueDataService, RevenueNormalizerService],
  exports: [RevenueDataService, RevenueNormalizerService],
})
export class RevenueDataModule {}