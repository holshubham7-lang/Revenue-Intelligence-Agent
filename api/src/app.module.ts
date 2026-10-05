import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { AuthController } from "./auth/auth.controller";
import { AccountController } from "./auth/account.controller";
import { HealthController } from "./health.controller";
import { SessionInterceptor } from "./auth/session.interceptor";
import { CompaniesController } from "./company/company.controller";
import { AgentOnboardingController, ActionPlanController, ChatController, ChatThreadsController } from "./company/onboarding.controller";
import { DataSourcesController } from "./company/data-sources.controller";

@Module({
  controllers: [
    HealthController,
    AuthController,
    AccountController,
    CompaniesController,
    ActionPlanController,
    AgentOnboardingController,
    ChatController,
    ChatThreadsController,
    DataSourcesController,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: SessionInterceptor,
    },
  ],
})
export class AppModule {}
