import type { CookieOptions, Response } from 'express';
import { ConfigService } from '@nestjs/config';

const DEFAULT_NAME = 'stratveda_session';
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type SessionCookie = {
  name: string;
  options: CookieOptions;
};

export type SameSiteValue = 'strict' | 'lax' | 'none';

/** True when cookies must carry the `Secure` attribute (HTTPS in prod). */
export function isCookieSecure(config: ConfigService): boolean {
  const secureConfig = config.get<string>('COOKIE_SECURE');
  return (
    secureConfig === 'true' ||
    (secureConfig === undefined && process.env.NODE_ENV === 'production')
  );
}

/**
 * Resolves the SameSite value from COOKIE_SAMESITE, defaulting to 'lax'.
 * Cross-origin deployments (frontend and API on different hosts) must set
 * COOKIE_SAMESITE=none so cookies survive cross-site requests; that setting
 * is only valid over HTTPS, so it falls back to 'lax' when Secure is off.
 */
export function getCookieSameSite(config: ConfigService): SameSiteValue {
  const raw = (config.get<string>('COOKIE_SAMESITE') ?? 'lax').toLowerCase();
  const sameSite: SameSiteValue = ['strict', 'lax', 'none'].includes(raw)
    ? (raw as SameSiteValue)
    : 'lax';
  return sameSite === 'none' && !isCookieSecure(config) ? 'lax' : sameSite;
}

export function getSessionCookie(config: ConfigService): SessionCookie {
  const maxAge =
    Number(config.get<string>('JWT_EXPIRES_MS') ?? '') || DEFAULT_MAX_AGE_MS;
  return {
    name: config.get<string>('SESSION_COOKIE_NAME') ?? DEFAULT_NAME,
    options: {
      maxAge,
      httpOnly: true,
      sameSite: getCookieSameSite(config),
      secure: isCookieSecure(config),
      path: '/',
    },
  };
}

export function setSessionCookie(
  res: Response,
  sessionCookie: SessionCookie,
  token: string,
): void {
  res.cookie(sessionCookie.name, token, sessionCookie.options);
}

export function clearSessionCookie(
  res: Response,
  sessionCookie: SessionCookie,
): void {
  const { maxAge: _maxAge, ...clearOptions } = sessionCookie.options;
  res.clearCookie(sessionCookie.name, clearOptions);
}