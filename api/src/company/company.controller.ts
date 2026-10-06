import { Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import type { Request } from "express";

import { internal, unprocessable } from "../common/api-error";
import { assertCsrf, readJson } from "../common/http";
import { CurrentUser } from "../auth/session.interceptor";
import type { UserDoc } from "../auth/user";
import { initOnboardingStage, saveCompanyRegistration, validateCompany } from "../companies";

/**
 * Company registration.
 *
 * Served at `/api/companies` — note the plural. The onboarding routes live under
 * `/api/company/...`. That split looks like a typo and is not: these are two
 * different paths in the Next.js app and the frontend calls both. They are
 * reproduced exactly rather than tidied up, because a "fix" here would silently
 * break whichever one was wrong.
 *
 * The record is keyed to the session's user id, resolved server-side and never
 * taken from the request body, so one user cannot write to another's company.
 */
@Controller("companies")
export class CompaniesController {
  /**
   * Saves the signed-in user's company profile.
   *
   * Same defences as the auth API: double-submit CSRF, a valid `revops_session`
   * cookie, and server-side field validation against the same option lists the
   * form offers. One company record per user; a repeat submission updates it.
   *
   * Request:  { companyName, website, industry, companySize, companyType,
   *             country, state, city, phone, revenueRange, problem }
   * Success:  201 { company: { id, name } }
   * Errors:   400 invalid_json · 401 unauthenticated · 403 csrf · 422 validation · 500
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async register(@Req() request: Request, @CurrentUser() user: UserDoc) {
    assertCsrf(request);

    const result = validateCompany(await readJson(request));
    if (!result.ok) {
      throw unprocessable("validation_failed", "Please fix the highlighted fields.", result.fields);
    }

    try {
      const doc = await saveCompanyRegistration(user._id, result.data);
      /* A first-time registration enters the funnel at `company_saved`.
         Idempotent: a later edit does not rewind a company that has already
         progressed past that stage. */
      await initOnboardingStage(user._id);
      return { company: { id: doc._id, name: doc.companyName } };
    } catch (error: unknown) {
      console.error("companies: failed to save", error instanceof Error ? error.message : error);
      throw internal("Couldn't save your company right now. Please try again in a moment.");
    }
  }
}
