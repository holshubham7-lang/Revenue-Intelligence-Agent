import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Request } from 'express';
import { AdminUser, AdminUserDocument } from './admin.schemas.js';

export const ADMIN_COOKIE_NAME = 'admin_session';

export type AdminJwtPayload = {
  sub: string;
  email: string;
  tv?: number;
};

export type AuthenticatedAdminRequest = Request & {
  admin?: { userId: string; email: string };
};

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
};

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectModel(AdminUser.name)
    private readonly userModel: Model<AdminUserDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedAdminRequest>();

    const token = request.cookies?.[ADMIN_COOKIE_NAME] as string | undefined;
    if (!token) {
      throw new UnauthorizedException('Admin session required');
    }

    let payload: AdminJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<AdminJwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Admin session expired or invalid');
    }

    if (!this.isAdminEmail(payload.email)) {
      throw new ForbiddenException('Account is not an admin');
    }

    const user = await this.userModel.findById(payload.sub).exec();
    if (!user) {
      throw new UnauthorizedException('Admin account no longer exists');
    }
    if (user.isBlocked) {
      throw new ForbiddenException('Admin account is blocked');
    }
    if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
      throw new UnauthorizedException(
        'Admin session revoked. Please sign in again.',
      );
    }

    request.admin = { userId: user._id.toString(), email: user.email };
    return true;
  }

  isAdminEmail(email: string | undefined): boolean {
    if (!email) return false;
    const admins = this.config
      .get<string>('ADMIN_EMAILS', '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    return admins.includes(email.trim().toLowerCase());
  }
}