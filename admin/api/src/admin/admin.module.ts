import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminAuditLog, AdminAuditLogSchema, AdminUser, AdminUserSchema } from './admin.schemas.js';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { FieldDecryptService } from './field-decrypt.service.js';
import { AdminService } from './admin.service.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdminUser.name, schema: AdminUserSchema },
      { name: AdminAuditLog.name, schema: AdminAuditLogSchema },
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('ADMIN_JWT_SECRET'),
        signOptions: {
          expiresIn: Number(config.get<string>('ADMIN_SESSION_TTL', '604800')),
        },
        global: true,
      }),
    }),
    ConfigModule,
  ],
  controllers: [AdminController],
  providers: [
    AdminService,
    AdminAuthGuard,
    {
      provide: FieldDecryptService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new FieldDecryptService(config.get<string>('ENCRYPTION_KEY')),
    },
  ],
})
export class AdminModule {}