import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { SocialAuthController } from './social-auth.controller.js';
import { SocialAuthService } from './social-auth.service.js';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [SocialAuthController],
  providers: [SocialAuthService],
  exports: [SocialAuthService],
})
export class SocialAuthModule {}
