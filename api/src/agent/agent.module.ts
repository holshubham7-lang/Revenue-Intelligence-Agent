import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { User, UserSchema } from '../users/user.schema.js';
import { CompaniesModule } from '../companies/companies.module.js';
import { AgentController } from './agent.controller.js';
import { AgentService } from './agent.service.js';
import { AzureOpenAIClient } from './azure-openai-client.js';

@Module({
  imports: [
    AuthModule,
    CompaniesModule,
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [AgentController],
  providers: [AgentService, AzureOpenAIClient],
  exports: [AgentService],
})
export class AgentModule {}
