import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Request } from 'express';
import { getSessionCookie } from './session-cookie.js';
import { User } from '../users/user.schema.js';

export type JwtPayload = { sub: string; tv?: number };

export type AuthenticatedRequest = Request & {
  user?: { userId: string };
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();

    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Not authenticated');
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Session expired or invalid');
    }

    const user = await this.userModel.findById(payload.sub).exec();
    if (!user) {
      throw new UnauthorizedException('Account no longer exists');
    }
    if (user.isBlocked) {
      throw new UnauthorizedException('Account is blocked');
    }
    if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
      throw new UnauthorizedException(
        'Session revoked. Please sign in again.',
      );
    }

    request.user = { userId: user._id.toString() };
    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | undefined {
    const cookieName = getSessionCookie(this.config).name;
    return request.cookies?.[cookieName] as string | undefined;
  }
}