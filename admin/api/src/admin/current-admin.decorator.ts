import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedAdminRequest } from './admin-auth.guard.js';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedAdminRequest>();
    return request.admin;
  },
);