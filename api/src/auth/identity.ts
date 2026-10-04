import { ObjectId } from "mongodb";
import type { MongoServerError } from "mongodb";

import type { OAuthProfile, ProviderKey } from "./oauth";
import {
  adoptLegacyIdentity,
  ensureIdentityIndex,
  findUserByEmail,
  findUserByIdentity,
  normalizeProfileImage,
  type OAuthIdentity,
  type UserDoc,
} from "./user";
import { getDb } from "../db";

/**
 * Turning a verified provider identity into a session.
 *
 * Three outcomes, and the middle one is the interesting one:
 *
 * - **known identity** → sign in. The fast path, and the one that has to work
 *   no matter what the user renamed their work email to.
 * - **known email, provider says verified** → link the identity to that account
 *   and sign in. This is what makes "I signed up with a password, now I want to
 *   use Google" work without a second account or a password reset.
 * - **known email, provider does *not* vouch for it** → refuse.
 *
 * That last case is the whole reason `emailVerified` is carried this far. A
 * provider will happily hand over an address it has never checked; if we linked
 * that to an existing account, anyone able to create an unverified account at
 * that provider could walk straight into it. Refusing and pointing the user at
 * password sign-in is the only safe answer.
 */

export type SocialSignInOutcome =
  | { ok: true; user: UserDoc; created: boolean; linked: boolean }
  | { ok: false; code: SocialSignInError; message: string };

export type SocialSignInError =
  | "account_blocked"
  | "email_not_verified"
  | "internal_error";

/** Filled in from the provider's own profile; never from the request body. */
function displayName(profile: OAuthProfile): string {
  const trimmed = profile.name.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 200) : profile.email.split("@")[0];
}

/**
 * The avatar to store, or `undefined` when the provider sent none.
 *
 * Normalised, so a `javascript:`/`data:` URL can never reach an `img src`.
 */
function profileImage(profile: OAuthProfile): string | undefined {
  return normalizeProfileImage(profile.picture);
}

let indexEnsured: Promise<void> | null = null;

async function ensureIndexes(): Promise<void> {
  if (!indexEnsured) {
    indexEnsured = ensureIdentityIndex().catch((err) => {
      indexEnsured = null;
      throw err;
    });
  }
  await indexEnsured;
}

export async function signInWithOAuth(
  provider: ProviderKey,
  profile: OAuthProfile,
): Promise<SocialSignInOutcome> {
  const now = new Date().toISOString();

  try {
    await ensureIndexes();

    /* Already linked — sign in. */
    const existing = await findUserByIdentity(provider, profile.subject);
    if (existing) {
      if (existing.isBlocked) {
        return {
          ok: false,
          code: "account_blocked",
          message: "This account has been blocked. Contact support.",
        };
      }

      /* A v1.0 account: give it the identities array so this is the last time we
         have to consult `providerId`. */
      if (!existing.identities?.some((i) => i.provider === provider)) {
        await adoptLegacyIdentity(existing, provider, profile.subject, profile.email);
      }

      /* Refresh the stored avatar, so a photo change at the provider lands on the
         next sign-in. Only written when the provider actually sent one — LinkedIn
         omits `picture` on some responses, and reading that omission as "the user
         removed their photo" would quietly wipe a perfectly good image. */
      const image = profileImage(profile);
      let refreshed = existing;
      if (image && image !== existing.profileImage) {
        const db = await getDb();
        const updated = await db
          .collection<UserDoc>("users")
          .findOneAndUpdate(
            { _id: existing._id },
            { $set: { profileImage: image, updatedAt: now } },
            { returnDocument: "after" },
          );
        if (updated) refreshed = updated;
      }

      return { ok: true, user: refreshed, created: false, linked: false };
    }

    /* Not linked. Does an account already own this address? */
    const byEmail = await findUserByEmail(profile.email);

    if (byEmail) {
      if (byEmail.isBlocked) {
        return {
          ok: false,
          code: "account_blocked",
          message: "This account has been blocked. Contact support.",
        };
      }

      if (!profile.emailVerified) {
        return {
          ok: false,
          code: "email_not_verified",
          message:
            "That provider hasn't verified this email address, so we can't link it to your existing account. Sign in with your password instead, then link your account from settings.",
        };
      }

      // Link and sign in. The conditional update stops two concurrent callbacks
      // for the same identity both appending a duplicate link.
      const identity: OAuthIdentity = {
        provider,
        subject: profile.subject,
        linkedEmail: profile.email,
        linkedAt: now,
      };

      const db = await getDb();
      // Only promote verification — never revoke it if it was already set.
      const setFields: Partial<UserDoc> = { isEmailVerified: true, updatedAt: now };
      const image = profileImage(profile);
      if (image) setFields.profileImage = image;

      const linked = await db
        .collection<UserDoc>("users")
        .findOneAndUpdate(
          {
            _id: byEmail._id,
            identities: { $not: { $elemMatch: { provider, subject: profile.subject } } },
          },
          {
            $push: { identities: identity },
            $set: setFields,
          },
          { returnDocument: "after" },
        );

      if (!linked) {
        // Lost the race; the winner's document is the one we want.
        const raced = await findUserByIdentity(provider, profile.subject);
        if (raced) return { ok: true, user: raced, created: false, linked: true };
        return {
          ok: false,
          code: "internal_error",
          message: "Couldn't finish linking that account. Please try again.",
        };
      }

      return { ok: true, user: linked, created: false, linked: true };
    }

    /* New account. */
    const doc: UserDoc = {
      _id: new ObjectId().toHexString(),
      name: displayName(profile),
      email: profile.email,
      // No password: this account can only be entered through its provider.
      passwordHash: "",
      authProvider: provider,
      // Required by the v1.0 `{ authProvider, providerId }` unique index. Without
      // it Mongo indexes this as `providerId: null`, so the second Google user to
      // sign up collides with the first and the insert fails with E11000.
      providerId: profile.subject,
      // Absent when the provider sent no usable avatar — the field is simply
      // omitted rather than stored as null, so `profileImage?: string` holds.
      ...(profileImage(profile) ? { profileImage: profileImage(profile) } : {}),
      isEmailVerified: profile.emailVerified,
      isBlocked: false,
      isTestAccount: false,
      tokenVersion: 0,
      identities: [
        { provider, subject: profile.subject, linkedEmail: profile.email, linkedAt: now },
      ],
      createdAt: now,
      updatedAt: now,
    };

    const db = await getDb();
    try {
      await db.collection<UserDoc>("users").insertOne(doc);
    } catch (err) {
      // Two tabs completing the same sign-in, or a signup that landed between
      // our lookup and this insert. Re-read and treat as an existing account.
      if ((err as MongoServerError).code === 11000) {
        /* Someone else got here first. A race is only safe to accept if it was
           the *same identity* landing. If the collision was on the email
           instead, someone signed up for that address between our lookup and
           this insert, and honouring it would let an unverified provider claim
           their account — the same thing `email_not_verified` guards above. */
        const racedIdentity = await findUserByIdentity(provider, profile.subject);
        if (racedIdentity) {
          if (racedIdentity.isBlocked) {
            return {
              ok: false,
              code: "account_blocked",
              message: "This account has been blocked. Contact support.",
            };
          }
          return { ok: true, user: racedIdentity, created: false, linked: false };
        }

        const racedEmail = await findUserByEmail(profile.email);
        if (racedEmail) {
          if (racedEmail.isBlocked) {
            return {
              ok: false,
              code: "account_blocked",
              message: "This account has been blocked. Contact support.",
            };
          }
          if (!profile.emailVerified) {
            return {
              ok: false,
              code: "email_not_verified",
              message:
                "That provider hasn't verified this email address, so we can't link it to your existing account. Sign in with your password instead, then link your account from settings.",
            };
          }
          /* Verified, and now the address really is held by one account: link. */
          const identity: OAuthIdentity = {
            provider,
            subject: profile.subject,
            linkedEmail: profile.email,
            linkedAt: now,
          };
          const raceSetFields: Partial<UserDoc> = { isEmailVerified: true, updatedAt: now };
          const raceImage = profileImage(profile);
          if (raceImage) raceSetFields.profileImage = raceImage;

          await db.collection<UserDoc>("users").updateOne(
            {
              _id: racedEmail._id,
              identities: { $not: { $elemMatch: { provider, subject: profile.subject } } },
            },
            { $push: { identities: identity }, $set: raceSetFields },
          );
          const linkedNow = await findUserByIdentity(provider, profile.subject);
          if (linkedNow) {
            return { ok: true, user: linkedNow, created: false, linked: true };
          }
        }

        throw err;
      }
    }

    return { ok: true, user: doc, created: true, linked: false };
  } catch (err) {
    console.error("oauth sign-in failed", err instanceof Error ? err.message : err);
    return {
      ok: false,
      code: "internal_error",
      message: "Couldn't complete sign-in with that provider. Please try again.",
    };
  }
}
