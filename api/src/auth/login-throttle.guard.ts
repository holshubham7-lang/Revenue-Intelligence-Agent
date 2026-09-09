import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

@Injectable()
export class LoginThrottleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { body?: { email?: unknown } }>();

    const bodyEmail = request.body?.email;
    const email =
      typeof bodyEmail === 'string'
        ? bodyEmail.trim().toLowerCase()
        : '';
    const key = `${request.ip ?? 'unknown'}|${email}`;
    const now = Date.now();

    if (buckets.size > 10_000) {
      for (const [k, bucket] of buckets) {
        if (bucket.resetAt <= now) {
          buckets.delete(k);
        }
      }
    }

    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }

    bucket.count += 1;
    if (bucket.count > MAX_ATTEMPTS) {
      throw new HttpException(
        'Too many sign-in attempts. Try again in a minute.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}