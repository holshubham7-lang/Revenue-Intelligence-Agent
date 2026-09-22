import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { ActionPlan, ActionPlanSchema } from './action-plan.schema.js';
import {
  ActionPlanItem,
  ActionPlanItemSchema,
} from './action-plan-item.schema.js';
import { ActionPlansService } from './action-plans.service.js';
import { ActionPlansController } from './action-plans.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ActionPlan.name, schema: ActionPlanSchema },
      { name: ActionPlanItem.name, schema: ActionPlanItemSchema },
    ]),
    AuthModule,
    WorkspacesModule,
    AuditModule,
  ],
  controllers: [ActionPlansController],
  providers: [ActionPlansService],
  exports: [ActionPlansService],
})
export class ActionPlansModule {}