import type { CookieOptions, Response } from 'express';
import { ConfigService } from '@nestjs/config';

const DEFAULT_NAME = 'stratveda_session';
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type SessionCookie = {
  name: string;
  options: CookieOptions;
};

export function getSessionCookie(config: ConfigService): SessionCookie {
  const maxAge =
    Number(config.get<string>('JWT_EXPIRES_MS') ?? '') || DEFAULT_MAX_AGE_MS;
  const secureConfig = config.get<string>('COOKIE_SECURE');
  const secure =
    secureConfig === 'true' ||
    (secureConfig === undefined && process.env.NODE_ENV === 'production');
  return {
    name: config.get<string>('SESSION_COOKIE_NAME') ?? DEFAULT_NAME,
    options: {
      maxAge,
      httpOnly: true,
      sameSite: 'lax',
      secure,
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