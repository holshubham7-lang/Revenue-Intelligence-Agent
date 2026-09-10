import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  Logger,
  Param,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import type { Request, Response } from 'express';
import { getSessionCookie, isCookieSecure, getCookieSameSite, setSessionCookie } from '../auth/session-cookie.js';
import { UsersService } from '../users/users.service.js';
import { SocialAuthService } from './social-auth.service.js';
import { SOCIAL_PROVIDERS, SocialProvider } from './social.providers.js';

const STATE_COOKIE = 'social_oauth_state';

@Controller('auth/social')
export class SocialAuthController {
  private readonly logger = new Logger(SocialAuthController.name);

  constructor(
    private readonly socialAuth: SocialAuthService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private parseProvider(value: string): SocialProvider {
    const provider = value as SocialProvider;
    if (!SOCIAL_PROVIDERS[provider]) {
      throw new BadRequestException('Unsupported social provider');
    }
    return provider;
  }

  private frontendOrigin(): string {
    return (
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
    );
  }

  @Get(':provider')
  async authorize(
    @Param('provider') providerValue: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const provider = this.parseProvider(providerValue);
    if (!this.socialAuth.isConfigured(provider)) {
      throw new BadRequestException(
        `${provider} social login is not configured yet. Add its OAuth credentials to configure it.`,
      );
    }

    const state = crypto.randomBytes(32).toString('base64url');

    // The OAuth dance runs across three different sites (frontend -> this API
    // -> provider -> this API). Mobile browsers drop SameSite=Lax cookies in
    // that cross-site redirect chain (ITP / third-party-cookie blocking), which
    // surfaces as "Invalid OAuth state" on phones while desktop keeps working.
    // Match the session cookie's SameSite/Secure attributes so the short-lived
    // state token survives the round trip in cross-site deployments too.
    res.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: getCookieSameSite(this.configService),
      secure: isCookieSecure(this.configService),
      path: '/',
      maxAge: 10 * 60 * 1000, // 10 minutes
    });

    const url = this.socialAuth.buildAuthorizeUrl(provider, state);
    res.redirect(url);
  }

  @Get(':provider/callback')
  async callback(
    @Param('provider') providerValue: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') error_description: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const provider = this.parseProvider(providerValue);

    try {
      if (error) {
        this.logger.error(
          `[SOCIAL-DEBUG] ${provider} OAuth error callback -> error=${error} error_description=${error_description ?? ''} code=${code ? 'present' : 'absent'}`,
        );
        throw new BadRequestException(`OAuth ${provider} denied the request`);
      }
      if (!code || !state) {
        throw new BadRequestException('Missing OAuth code or state');
      }

      const expectedState = String(req.cookies?.[STATE_COOKIE] ?? '');
      if (!expectedState || expectedState !== state) {
        throw new UnauthorizedException('Invalid OAuth state');
      }
      res.clearCookie(STATE_COOKIE, {
        sameSite: getCookieSameSite(this.configService),
        secure: isCookieSecure(this.configService),
        path: '/',
      });

      const profile = await this.socialAuth.exchangeCode(provider, code, state);
      const { user } = await this.usersService.createFromSocial({
          provider,
          providerId: profile.providerId,
          email: profile.email,
          name: profile.name,
          profileImage: profile.profileImage,
          emailVerified: profile.emailVerified,
        });

      if (user.isBlocked) {
        throw new ForbiddenException(
          'This account has been blocked. Contact support for help.',
        );
      }

      const token = await this.jwtService.signAsync({
        sub: user.id,
        tv: user.tokenVersion,
      });
      setSessionCookie(res, getSessionCookie(this.configService), token);

      res.redirect(`${this.frontendOrigin()}/dashboard`);
    } catch (err) {
      // Social login errors happen on a full-page navigation away from the
      // SPA, so the browser can't consume a JSON error body. Redirect back to
      // the frontend with the reason as a query param; the sign-in page
      // surfaces it as a toast.
      res.clearCookie(STATE_COOKIE, {
        sameSite: getCookieSameSite(this.configService),
        secure: isCookieSecure(this.configService),
        path: '/',
      });
      const message =
        err instanceof HttpException && err.message
          ? err.message
          : 'Social sign-in failed. Please try again.';
      this.logger.error(
        `[SOCIAL-DEBUG] ${provider} callback failed -> ${message}`,
      );
      res.redirect(
        `${this.frontendOrigin()}/sign-in?social_error=${encodeURIComponent(message)}`,
      );
    }
  }
}
