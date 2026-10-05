/**
 * Tests for the account-settings validators.
 *
 * These guard the two writes the account page can make, and the one that matters
 * most is the password: a rule that drifts from the one signup enforces would let
 * a user create a password the sign-in form later refuses, and a missing
 * confirmation check would let a direct request set a password its author never
 * typed twice. Both failures are silent — the account is simply unusable later.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { validatePasswordChange, validateProfileUpdate } from "./validation.ts";

test("a plain name is accepted and trimmed", () => {
  const result = validateProfileUpdate({ name: "  Jane Cooper  " });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.name, "Jane Cooper");
});

test("a name shorter than two characters is rejected on the name field", () => {
  const result = validateProfileUpdate({ name: "J" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.fields.name ?? "", /at least 2 characters/);
});

test("a name of only whitespace is a too-short name, not a trimmed success", () => {
  // The bound is checked before trimming, so `"  "` cannot become `""` and be
  // written as an account with no name at all.
  const result = validateProfileUpdate({ name: "   " });
  assert.equal(result.ok, false);
});

test("an over-long name is rejected", () => {
  const result = validateProfileUpdate({ name: "a".repeat(81) });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.fields.name ?? "", /80 characters or fewer/);
});

test("a name that is not a string is rejected rather than coerced", () => {
  for (const name of [42, null, undefined, { first: "Jane" }, ["Jane"]]) {
    const result = validateProfileUpdate({ name });
    assert.equal(result.ok, false, `${JSON.stringify(name)} must not be accepted as a name`);
  }
});

test("a missing name body is rejected", () => {
  assert.equal(validateProfileUpdate({}).ok, false);
  assert.equal(validateProfileUpdate(null).ok, false);
  assert.equal(validateProfileUpdate("Jane").ok, false);
});

test("a valid password change is accepted", () => {
  const result = validatePasswordChange({
    currentPassword: "old-password",
    newPassword: "new-password",
    confirmPassword: "new-password",
  });
  assert.equal(result.ok, true);
});

test("a new password under eight characters is rejected", () => {
  const result = validatePasswordChange({
    currentPassword: "old-password",
    newPassword: "short7c",
    confirmPassword: "short7c",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.fields.newPassword ?? "", /at least 8 characters/);
});

test("a mismatch is reported on the confirmation, not silently ignored", () => {
  const result = validatePasswordChange({
    currentPassword: "old-password",
    newPassword: "new-password",
    confirmPassword: "new-password ",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.fields.confirmPassword ?? "", /do not match/);
});

test("a missing current password is rejected", () => {
  const result = validatePasswordChange({
    currentPassword: "",
    newPassword: "new-password",
    confirmPassword: "new-password",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.fields.currentPassword);
});

test("a missing confirmation reports only the confirmation", () => {
  // Reporting a mismatch *and* a missing field would describe one mistake twice.
  const result = validatePasswordChange({
    currentPassword: "old-password",
    newPassword: "new-password",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.fields.confirmPassword);
    assert.equal(result.fields.newPassword, undefined);
  }
});

test("an over-long new password is rejected", () => {
  const long = "a".repeat(129);
  const result = validatePasswordChange({
    currentPassword: "old-password",
    newPassword: long,
    confirmPassword: long,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.fields.newPassword ?? "", /128 characters or fewer/);
});

test("non-string password fields are rejected rather than coerced", () => {
  const result = validatePasswordChange({
    currentPassword: 12345678,
    newPassword: { toString: () => "new-password" },
    confirmPassword: "new-password",
  });
  assert.equal(result.ok, false);
});