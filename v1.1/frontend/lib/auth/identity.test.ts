import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import type { UserDoc } from "./user.ts";
import type { OAuthProfile } from "./oauth.ts";

/**
 * Account linking against a real Mongo, because the interesting cases are all
 * about what is actually in the document — a duplicate-key race, an identity
 * already present, a blocked account. A stubbed collection would assert against
 * my own assumptions rather than Mongo's behaviour.
 *
 * `identity.test-env` must be imported before anything that reaches `db.ts`: it
 * pins `MONGODB_DB` at evaluation time, and without it these fixtures would be
 * written into the development database.
 */

import "./identity.test-env.ts";

import { TEST_DATABASE } from "./identity.test-env.ts";
import { signInWithOAuth } from "./identity.ts";
import { getDb, getMongoClient } from "../db.ts";

let counter = 0;
/** Unique per call so tests never inherit each other's documents. */
function unique(tag: string): string {
  counter += 1;
  return `${tag}-${Date.now()}-${counter}`;
}

before(async () => {
  process.env.MONGODB_DB = TEST_DATABASE;
  const db = await getDb();
  assert.equal(db.databaseName, TEST_DATABASE, "these tests must not touch the dev database");
  await db.collection<UserDoc>("users").deleteMany({ email: TEST_PREFIX });
});

after(async () => {
  const db = await getDb();
  await db.collection<UserDoc>("users").deleteMany({ email: TEST_PREFIX });
  await (await getMongoClient()).close();
});

async function seedPasswordUser(email: string) {
  const db = await getDb();
  const now = new Date().toISOString();
  const doc: UserDoc = {
    _id: `seed-${email}`,
    name: "Existing Owner",
    email,
    passwordHash: "scrypt$fake$hash",
    authProvider: "password",
    isEmailVerified: false,
    isBlocked: false,
    isTestAccount: false,
    tokenVersion: 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.collection<UserDoc>("users").insertOne(doc);
  return doc;
}

/** A provider subject that no other test has used. */
function freshSubject(): string {
  return unique("subject");
}

const profile = (over: Partial<OAuthProfile> = {}): OAuthProfile => ({
  subject: freshSubject(),
  email: testEmail("profile"),
  emailVerified: true,
  name: "Social User",
  ...over,
});

/** Every fixture address carries this prefix, which is what the hooks delete. */
const TEST_PREFIX = /^e-/;

const testEmail = (tag: string) => `e-${unique(tag)}@example.com`;

/* -------------------------------------------------------------------------- */

test("a first social sign-in creates an account with no password", async () => {
  const result = await signInWithOAuth("google", profile());

  assert.ok(result.ok, "a new social sign-in must succeed");
  assert.equal(result.created, true);
  assert.equal(result.linked, false);
  assert.equal(result.user.authProvider, "google");
  assert.equal(result.user.passwordHash, "", "a social account must not have a password");
  assert.equal(result.user.isEmailVerified, true);
  assert.equal(result.user.identities?.[0].provider, "google");
});

test("a returning social sign-in finds the account by provider id, not email", async () => {
  const first = await signInWithOAuth("google", profile());
  assert.ok(first.ok);

  /* Same provider subject, different email — the user changed their work email.
     Keying on email would have created a second account. */
  const second = await signInWithOAuth("google", {
    subject: first.user.identities![0].subject,
    email: testEmail("renamed"),
    emailVerified: true,
    name: "Social User",
  });

  assert.ok(second.ok);
  assert.equal(second.created, false, "an email change must not fork the account");
  assert.equal(second.user._id, first.user._id);
});

test("two concurrent callbacks for the same identity resolve to one account", async () => {
  const shared = profile();

  const [a, b] = await Promise.all([
    signInWithOAuth("linkedin", shared),
    signInWithOAuth("linkedin", shared),
  ]);

  assert.ok(a.ok && b.ok, "both callbacks must succeed");
  assert.equal(a.user._id, b.user._id, "one identity, one account");

  const db = await getDb();
  const links = await db
    .collection<UserDoc>("users")
    .countDocuments({ "identities.subject": shared.subject });
  assert.equal(links, 1, "the identity must be stored exactly once");
});

/* -------------------------------------------------------------------------- */

test("a verified provider email links to an existing password account", async () => {
  const email = testEmail("link-ok");
  const seeded = await seedPasswordUser(email);

  const result = await signInWithOAuth("google", {
    subject: freshSubject(),
    email,
    emailVerified: true,
    name: "Existing Owner",
  });

  assert.ok(result.ok);
  assert.equal(result.linked, true);
  assert.equal(result.created, false);
  assert.equal(result.user._id, seeded._id, "linking must reuse the existing account");
  assert.equal(result.user.authProvider, "password", "the password login must keep working");
  assert.ok(result.user.passwordHash, "the existing password hash must survive linking");
  assert.equal(result.user.isEmailVerified, true);
});

test("an UNVERIFIED provider email is refused, not linked to an existing account", async () => {
  const email = testEmail("takeover");
  const seeded = await seedPasswordUser(email);

  /* This is the account-takeover case: an attacker who can create an unverified
     account at the provider using someone else's address. Linking would hand
     them the victim's account. */
  const result = await signInWithOAuth("microsoft", {
    subject: freshSubject(),
    email,
    emailVerified: false,
    name: "Someone Else",
  });

  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.code, "email_not_verified");

  const db = await getDb();
  const after = await db.collection<UserDoc>("users").findOne({ _id: seeded._id });
  assert.deepEqual(after?.identities, undefined, "nothing may be linked to the victim account");
  assert.equal(after?.passwordHash, seeded.passwordHash);
});

test("a blocked account cannot be entered through a social provider", async () => {
  const email = testEmail("blocked");
  const seeded = await seedPasswordUser(email);
  const db = await getDb();
  await db.collection<UserDoc>("users").updateOne({ _id: seeded._id }, { $set: { isBlocked: true } });

  const result = await signInWithOAuth("google", {
    subject: freshSubject(),
    email,
    emailVerified: true,
    name: "Blocked User",
  });

  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.code, "account_blocked");
});

test("a blocked account already linked is still refused on a later sign-in", async () => {
  const subject = freshSubject();

  const first = await signInWithOAuth("google", {
    subject,
    email: testEmail("blocked-linked"),
    emailVerified: true,
    name: "Later Blocked",
  });
  assert.ok(first.ok);

  const db = await getDb();
  await db
    .collection<UserDoc>("users")
    .updateOne({ _id: first.user._id }, { $set: { isBlocked: true } });

  const second = await signInWithOAuth("google", {
    subject,
    email: testEmail("blocked-linked-2"),
    emailVerified: true,
    name: "Later Blocked",
  });

  assert.equal(second.ok, false);
  assert.equal(second.ok === false && second.code, "account_blocked");
});

/* -------------------------------------------------------------------------- */

test("one account can hold identities from more than one provider", async () => {
  const email = testEmail("multi");
  const seeded = await seedPasswordUser(email);

  const viaGoogle = await signInWithOAuth("google", {
    subject: freshSubject(),
    email,
    emailVerified: true,
    name: "Multi Provider",
  });
  assert.ok(viaGoogle.ok && viaGoogle.linked);

  const viaMicrosoft = await signInWithOAuth("microsoft", {
    subject: freshSubject(),
    email,
    emailVerified: true,
    name: "Multi Provider",
  });
  assert.ok(viaMicrosoft.ok, "a second provider must link to the same account");

  const db = await getDb();
  const stored = await db.collection<UserDoc>("users").findOne({ _id: seeded._id });
  const providers = (stored?.identities ?? []).map((i) => i.provider).sort();
  assert.deepEqual(providers, ["google", "microsoft"]);
  assert.equal(stored?.passwordHash, seeded.passwordHash);
});

/* -------------------------------------------------------------------------- */
/* v1.0 back-compatibility                                                    */
/* -------------------------------------------------------------------------- */

test("a v1.0 social user with no identities array can still sign in", async () => {
  const subject = freshSubject();
  const email = testEmail("legacy");
  const seeded = await seedPasswordUser(email);

  /* Exactly how v1.0 wrote these documents. */
  const db = await getDb();
  await db.collection<UserDoc>("users").updateOne(
    { _id: seeded._id },
    {
      $set: { authProvider: "google", providerId: subject },
      $unset: { passwordHash: "" },
    },
  );

  const result = await signInWithOAuth("google", {
    subject,
    email,
    emailVerified: true,
    name: "Legacy User",
  });

  assert.ok(result.ok, "an existing v1.0 account must not be stranded as a duplicate");
  assert.equal(result.user._id, seeded._id);
  assert.equal(result.created, false);

  /* And it gets upgraded in place, so the next sign-in uses the new lookup. */
  const stored = await db.collection<UserDoc>("users").findOne({ _id: seeded._id });
  assert.ok(
    stored?.identities?.some((i) => i.provider === "google" && i.subject === subject),
    "the identities array should have been back-filled",
  );
});

test("the v1.0 providerId index no longer blocks the second user of a provider", async () => {
  /* This is the reported symptom: the first Google sign-in works, the second one
     dies on `E11000 ... index: authProvider_1_providerId_1`. It happens because
     providerId was left unset, and Mongo indexes an absent field as `null`. */
  const first = await signInWithOAuth("linkedin", profile());
  assert.ok(first.ok);
  assert.equal(
    first.user.providerId,
    first.user.identities![0].subject,
    "providerId must be populated for the v1.0 unique index",
  );

  const second = await signInWithOAuth("linkedin", profile());
  assert.ok(second.ok, "a second LinkedIn user must not collide with the first");
  assert.notEqual(second.user._id, first.user._id);

  const db = await getDb();
  const linkedinDocs = await db
    .collection<UserDoc>("users")
    .countDocuments({ authProvider: "linkedin", providerId: { $type: "string" } });
  assert.ok(linkedinDocs >= 2, "both accounts should hold a distinct providerId");
});

test("the same provider subject cannot be claimed by two accounts", async () => {
  const shared = { subject: freshSubject(), emailVerified: true, name: "Guard" };

  const a = await signInWithOAuth("linkedin", { ...shared, email: testEmail("guard-a") });
  const b = await signInWithOAuth("linkedin", { ...shared, email: testEmail("guard-b") });

  assert.ok(a.ok && b.ok);
  assert.equal(
    a.user._id,
    b.user._id,
    "one provider identity must map to exactly one account",
  );
});

test("a social-only account cannot be entered with a password", async () => {
  const created = await signInWithOAuth("google", profile());
  assert.ok(created.ok);
  /* `passwordHash` empty means the password route's `!user.passwordHash` guard
     rejects it, so a social user cannot be brute-forced through /api/auth/signin. */
  assert.equal(created.user.passwordHash, "");
  assert.notEqual(created.user.authProvider, "password");
});

test("linking never downgrades an already-verified account", async () => {
  const email = testEmail("no-downgrade");
  const seeded = await seedPasswordUser(email);
  const db = await getDb();
  await db.collection<UserDoc>("users").updateOne({ _id: seeded._id }, { $set: { isEmailVerified: true } });

  const result = await signInWithOAuth("google", {
    subject: freshSubject(),
    email,
    emailVerified: false,
    name: "Existing Owner",
  });

  /* Unverified against an existing account is refused outright, so verification
     cannot be walked backwards through this path either. */
  assert.equal(result.ok, false);

  const after = await db.collection<UserDoc>("users").findOne({ _id: seeded._id });
  assert.equal(after?.isEmailVerified, true);
});
