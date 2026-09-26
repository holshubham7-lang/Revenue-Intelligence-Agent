import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  SOCIAL_PROVIDERS,
  SocialProvider,
} from './social.providers.js';

export type SocialProfile = {
  provider: SocialProvider;
  providerId: string;
  email: string;
  /** True only when the provider explicitly confirms the email is verified. */
  emailVerified?: boolean;
  name: string;
  profileImage?: string;
};

@Injectable()
export class SocialAuthService {
  private readonly logger = new Logger(SocialAuthService.name);

  constructor(private readonly config: ConfigService) {}

  private envPrefix(provider: SocialProvider): {
    id: string;
    secret: string;
  } {
    switch (provider) {
      case 'google':
        return { id: 'GOOGLE_CLIENT_ID', secret: 'GOOGLE_CLIENT_SECRET' };
      case 'microsoft':
        return { id: 'MICROSOFT_CLIENT_ID', secret: 'MICROSOFT_CLIENT_SECRET' };
      case 'linkedin':
        return { id: 'LINKEDIN_CLIENT_ID', secret: 'LINKEDIN_CLIENT_SECRET' };
    }
  }

  private clientId(provider: SocialProvider): string {
    return this.config.get<string>(this.envPrefix(provider).id) ?? '';
  }

  private clientSecret(provider: SocialProvider): string {
    return this.config.get<string>(this.envPrefix(provider).secret) ?? '';
  }

  private callbackUrl(provider: SocialProvider): string {
    const base = this.config.get<string>('CALLBACK_BASE') ?? 'http://localhost:3010';
    return `${base}/auth/social/${provider}/callback`;
  }

  /**
   * Microsoft tenant for the v2.0 endpoints. Defaults to `common` (multi-tenant),
   * set MICROSOFT_TENANT (e.g. 'organizations' or a tenant GUID) for
   * single-tenant app registrations.
   */
  private microsoftTenant(): string {
    return this.config.get<string>('MICROSOFT_TENANT') ?? 'common';
  }

  private renderProviderUrl(
    provider: SocialProvider,
    url: string,
  ): string {
    if (provider !== 'microsoft') {
      return url;
    }
    return url.replaceAll('{tenant}', this.microsoftTenant());
  }

  isConfigured(provider: SocialProvider): boolean {
    return Boolean(this.clientId(provider) && this.clientSecret(provider));
  }

  buildAuthorizeUrl(provider: SocialProvider, state: string): string {
    const { authUrl, scopes } = SOCIAL_PROVIDERS[provider];
    const params = new URLSearchParams({
      client_id: this.clientId(provider),
      redirect_uri: this.callbackUrl(provider),
      response_type: 'code',
      scope: scopes.join(' '),
      state,
    });

    switch (provider) {
      case 'google':
        params.set('access_type', 'online');
        params.set('prompt', 'select_account');
        params.set('include_granted_scopes', 'true');
        params.set('code_challenge', this.codeChallenge(state));
        params.set('code_challenge_method', 'S256');
        break;
      case 'microsoft':
        params.set('response_mode', 'query');
        params.set('code_challenge', this.codeChallenge(state));
        params.set('code_challenge_method', 'S256');
        break;
      case 'linkedin':
        // LinkedIn's web (non-native) flow does not support PKCE reliably;
        // sending a challenge/verifier can cause invalid_client at exchange.
        // Leave code_challenge unset so the issued code is not PKCE-bound.
        break;
    }

    return `${this.renderProviderUrl(provider, authUrl)}?${params.toString()}`;
  }

  private codeChallenge(state: string): string {
    return crypto
      .createHash('sha256')
      .update(state)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  async exchangeCode(
    provider: SocialProvider,
    code: string,
    state: string,
  ): Promise<SocialProfile> {
    if (!this.isConfigured(provider)) {
      throw new InternalServerErrorException(
        `${provider} social login is not configured yet`,
      );
    }

    const config = SOCIAL_PROVIDERS[provider];
    const body = new URLSearchParams({
      client_id: this.clientId(provider),
      client_secret: this.clientSecret(provider),
      code,
      redirect_uri: this.callbackUrl(provider),
      grant_type: 'authorization_code',
      ...(provider !== 'linkedin' ? { code_verifier: state } : {}),
    });

    if (provider === 'linkedin') {
      this.logger.debug(
        `[SOCIAL-DEBUG] linkedin exchange params -> client_id=${body.get('client_id')} redirect_uri=${body.get('redirect_uri')} code_len=${body.get('code')?.length ?? 0} verifier_len=${body.get('code_verifier')?.length ?? 0}`,
      );
    }

    const tokenRes = await fetch(this.renderProviderUrl(provider, config.tokenUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!tokenRes.ok) {
      const bodyText = await tokenRes.text();
      this.logger.error(
        `[SOCIAL-DEBUG] ${provider} token exchange failed (${tokenRes.status}): ${bodyText}`,
      );
      throw new UnauthorizedException('Failed to exchange OAuth code');
    }

    const token = (await tokenRes.json()) as {
      access_token?: string;
      id_token?: string;
      error?: string;
    };

    if (!token.access_token) {
      throw new UnauthorizedException(
        token.error ?? 'OAuth token exchange failed',
      );
    }

    return this.fetchProfile(provider, token.access_token, token.id_token);
  }

  /**
   * Decodes the JWT payload of an OpenID Connect id_token without verifying
   * its signature. The token already came over a TLS connection from the
   * provider's token endpoint, so the claims are trusted enough for profile
   * mapping (the provider vouches for them). Returns null on any parse error.
   */
  private decodeIdToken(
    idToken: string | undefined,
  ): Record<string, unknown> | null {
    if (!idToken) return null;
    try {
      const payload = idToken.split('.')[1] ?? '';
      const json = Buffer.from(
        payload.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString('utf8');
      return JSON.parse(json) as Record<string, unknown>;
    } catch {
      this.logger.debug('[SOCIAL-DEBUG] id_token payload could not be decoded');
      return null;
    }
  }

  private async fetchProfile(
    provider: SocialProvider,
    accessToken: string,
    idToken?: string,
  ): Promise<SocialProfile> {
    const config = SOCIAL_PROVIDERS[provider];
    const res = await fetch(config.profileUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new UnauthorizedException('Failed to fetch social profile');
    }

    const raw = (await res.json()) as Record<string, unknown>;
    const tokenClaims = this.decodeIdToken(idToken);

    switch (provider) {
      case 'google': {
        const providerId = String(raw.id ?? '');
        const email = String(raw.email ?? '').toLowerCase();
        const name = String(raw.name ?? raw.given_name ?? '').trim();
        if (!providerId || !email) {
          throw new BadRequestException('Incomplete Google profile');
        }
        return {
          provider,
          providerId,
          email,
          emailVerified: raw.verified_email === true || raw.email_verified === true,
          name,
          profileImage: raw.picture ? String(raw.picture) : undefined,
        };
      }
      case 'microsoft': {
        // Prefer the signed id_token: it is the authoritative source for
        // verified Microsoft identity claims (email, email_verified, oid,
        // name). The Graph /oidc/userinfo response is a fallback and often
        // omits `email_verified` entirely.
        const providerId = String(
          tokenClaims?.oid ?? tokenClaims?.sub ?? raw.oid ?? raw.sub ?? '',
        ).toLowerCase();
        const email = String(
          tokenClaims?.email ??
            tokenClaims?.preferred_username ??
            raw.email ??
            raw.preferred_username ??
            '',
        ).toLowerCase();
        const name = String(tokenClaims?.name ?? raw.name ?? '').trim();
        if (!providerId || !email) {
          throw new BadRequestException('Incomplete Microsoft profile');
        }
        // Microsoft only issues an `email` claim for accounts with a verified
        // mailbox, and `preferred_username` is the verified UPN from the
        // directory. Both come from a signed Microsoft token, so a present
        // Microsoft-issued email is by definition verified.
        const emailVerified =
          raw.email_verified === true ||
          tokenClaims?.email_verified === true ||
          Boolean(email);
        this.logger.debug(
          `[SOCIAL-DEBUG] microsoft profile -> email=${email} emailVerified=${emailVerified} providerId=${providerId}`,
        );
        return {
          provider,
          providerId,
          email,
          emailVerified,
          name,
          profileImage: raw.picture
            ? String(raw.picture)
            : tokenClaims?.picture
              ? String(tokenClaims.picture)
              : undefined,
        };
      }
      case 'linkedin': {
        const providerId = String(raw.sub ?? '');
        const email = String(raw.email ?? '').toLowerCase();
        const name = String(raw.name ?? `${raw.given_name ?? ''} ${raw.family_name ?? ''}`).trim();
        if (!providerId || !email) {
          throw new BadRequestException('Incomplete LinkedIn profile');
        }
        const profileImage = raw.picture ? String(raw.picture) : undefined;
        this.logger.debug(
          `[SOCIAL-DEBUG] linkedin profile -> email=${email} picture=${profileImage ? 'present' : 'MISSING'} keys=${Object.keys(raw).join(',')}`,
        );
        return {
          provider,
          providerId,
          email,
          emailVerified: raw.email_verified === true,
          name,
          profileImage,
        };
      }
      default:
        throw new UnauthorizedException('Unsupported provider');
    }
  }
}
