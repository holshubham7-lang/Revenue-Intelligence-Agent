/**
 * Tests for the post-sign-in destination.
 *
 * Sign-in used to hardcode `/company`, which is only the right answer for
 * someone's first visit. These pin the mapping that replaced it, because the
 * failure is silent and looks like data loss: a returning user is dropped on a
 * registration form they already submitted, and nothing errors.
 *
 * `workspaceEntryFor` takes a plain document so the whole mapping is testable
 * without a database.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { isCompanyProfileComplete, workspaceEntryFor } from "./onboarding.ts";
import type { CompanyDoc } from "./companies.ts";
import { ONBOARDING_TRANSITIONS, type OnboardingStage } from "./data/types.ts";

const ALL_STAGES = Object.keys(ONBOARDING_TRANSITIONS) as OnboardingStage[];

function companyDoc(stage?: OnboardingStage): CompanyDoc {
  return {
    _id: "c1",
    userId: "u1",
    companyName: "Acme",
    website: null,
    industry: "SaaS",
    companySize: "11-50",
    companyType: "Startup",
    country: "India",
    state: "Maharashtra",
    city: "Pune",
    phone: "+91 98765 43210",
    revenueRange: "$1M-$5M",
    problem: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...(stage ? { onboardingStage: stage } : {}),
  };
}

test("no company record sends the user to the registration form", () => {
  assert.equal(workspaceEntryFor(null), "/company");
});

test("a saved company sends the user to the chat, not back to the form", () => {
  // The regression this replaces: this user is exactly the one who was shown
  // the form again on every return visit. It is also where the company form
  // hands off on save, so the two agree on one destination.
  assert.equal(workspaceEntryFor(companyDoc("company_saved")), "/chat");
});

test("a company record with no stage predates the funnel and goes to the chat", () => {
  // `initOnboardingStage` back-fills the field on save, so an absent stage means
  // a record written before the funnel was tracked — necessarily "form
  // submitted, nothing else done".
  assert.equal(workspaceEntryFor(companyDoc()), "/chat");
});

test("every stage resolves to a real workspace route", () => {
  const ALLOWED = new Set(["/company", "/data", "/chat"]);
  for (const stage of ALL_STAGES) {
    const entry = workspaceEntryFor(companyDoc(stage));
    assert.ok(
      ALLOWED.has(entry),
      `${stage} resolves to ${entry}, which is not a workspace route`,
    );
  }
});

test("every stage from company_saved onwards points at the chat", () => {
  // `/data` used to own the pre-chat stages. The files it held are now a panel
  // inside the chat, so a stage resolving to `/data` would send a returning user
  // through a redirect hop to reach the conversation they were asked for.
  assert.equal(workspaceEntryFor(companyDoc("awaiting_data")), "/chat");
  assert.equal(workspaceEntryFor(companyDoc("analyzing")), "/chat");
  assert.equal(workspaceEntryFor(companyDoc("questions")), "/chat");
  assert.equal(workspaceEntryFor(companyDoc("plan_ready")), "/chat");
});

test("no user who has saved a company is ever sent back to the form", () => {
  // The whole point: `/company` is only for someone who has never completed
  // registration. If a future stage is added and mapped to `/company`, this
  // fails rather than quietly reintroducing the bug.
  for (const stage of ALL_STAGES) {
    assert.notEqual(
      workspaceEntryFor(companyDoc(stage)),
      "/company",
      `${stage} must not route a registered company back to the form`,
    );
  }
});

test("profile completeness is exactly the presence of a company record", () => {
  assert.equal(isCompanyProfileComplete(null), false);
  assert.equal(isCompanyProfileComplete(companyDoc()), true);
  assert.equal(isCompanyProfileComplete(companyDoc("plan_ready")), true);
});