import { verifySessionToken } from "@/lib/auth/session";
import type { ProviderKey } from "@/lib/auth/oauth";
import { getDb } from "@/lib/db";

/**
 * A linked social identity.
 *
 * `subject` is the provider's own stable user id, not the email address. Looking
 * accounts up by provider id is what stops a user losing their account by
 * changing their work email, and stops two different people who share a recycled
 * address from colliding.
 */
export type OAuthIdentity = {
  provider: ProviderKey;
  subject: string;
  /** The address at the moment of linking — for audit, never for lookups. */
  linkedEmail: string;
  linkedAt: string;
};

/** Shape of a user document in `revops.users` (matches the collection). */
export type UserDoc = {
  _id: string;
  name: string;
  email: string;
  /** Empty string for social-only accounts; they have no password to check. */
  passwordHash: string;
  authProvider: string;
  /**
   * The provider's user id, for v1.0 compatibility.
   *
   * A unique index on `{ authProvider, providerId }` (partial, social providers
   * only) has existed on this collection since v1.0, and Mongo treats an absent
   * field as `null` for uniqueness — so a social account written *without* this
   * field collides with every other social account from the same provider and
   * the insert fails with `E11000`. That is precisely how "sign-in works for the
   * first user and not for anyone else" happens, so social sign-ins keep
   * populating it even though lookups now use `identities`.
   */
  providerId?: string;
  /**
   * Provider-hosted avatar URL, captured at social sign-in.
   *
   * Same field name v1.0 used, so the admin panel reads either generation.
   * Only ever written through `normalizeProfileImage`, which is what keeps a
   * `javascript:` or `data:` URL out of an `img src`.
   */
  profileImage?: string;
  isEmailVerified: boolean;
  isBlocked: boolean;
  isTestAccount: boolean;
  tokenVersion: number;
  identities?: OAuthIdentity[];
  createdAt: string;
  updatedAt: string;
};

/** Emails are stored normalized (trimmed, lowercase); look that way too. */
export async function findUserByEmail(email: string): Promise<UserDoc | null> {
  const db = await getDb();
  return db.collection<UserDoc>("users").findOne({ email });
}

export async function findUserById(id: string): Promise<UserDoc | null> {
  const db = await getDb();
  return db.collection<UserDoc>("users").findOne({ _id: id });
}

/**
 * Accepts a provider avatar URL only if it is a real http(s) URL.
 *
 * The value originates from the provider, not from the request body, so it is
 * not attacker-controlled in the usual sense — but it is still a URL that ends
 * up in an `<img src>`, and "the provider said so" is not a reason to accept
 * `javascript:` or `data:`. Anything else is dropped to `undefined` rather than
 * stored, so the field simply stays absent and the UI falls back to initials.
 *
 * Carried over from v1.0's `users.service.normalizeProfileImage`; kept here so
 * both generations of the field are held to the same rule.
 */
export function normalizeProfileImage(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

/**
 * Finds the account already linked to this provider identity.
 *
 * This is the lookup that makes repeat sign-ins work regardless of which
 * address the user currently has on file with the provider.
 */
export async function findUserByIdentity(
  provider: ProviderKey,
  subject: string,
): Promise<UserDoc | null> {
  const db = await getDb();
  const users = db.collection<UserDoc>("users");
  const found = await users.findOne({
    identities: { $elemMatch: { provider, subject } },
  });
  if (found) return found;

  /* v1.0 stored the provider id in `providerId` and had no `identities` array.
     Without this fallback those users look brand new on every sign-in, and since
     their address is already taken they get pushed into a duplicate-account
     error instead of into their account. Matching on the old fields also lets
     `adoptLegacyIdentity` below migrate them in place. */
  return users.findOne({ authProvider: provider, providerId: subject });
}

/**
 * Back-fills the `identities` array on a v1.0 account.
 *
 * Best-effort: a failure here leaves the account working exactly as it did, just
 * without the modern field, so it must never block the sign-in.
 */
export async function adoptLegacyIdentity(
  user: UserDoc,
  provider: ProviderKey,
  subject: string,
  linkedEmail: string,
): Promise<void> {
  try {
    const db = await getDb();
    await db.collection<UserDoc>("users").updateOne(
      { _id: user._id, identities: { $not: { $elemMatch: { provider } } } },
      {
        $push: {
          identities: { provider, subject, linkedEmail, linkedAt: new Date().toISOString() },
        },
      },
    );
  } catch (err) {
    console.warn(
      `legacy identity adopt failed for user ${user._id}`,
      err instanceof Error ? err.message : err,
    );
  }
}

/** Lets the same account link more than one provider without losing any. */
export async function ensureIdentityIndex(): Promise<void> {
  const db = await getDb();
  await db
    .collection<UserDoc>("users")
    .createIndex(
      { "identities.provider": 1, "identities.subject": 1 },
      { unique: true, sparse: true, name: "user_identity" },
    );
}

/**
 * Resolves a session token to a live, authorised user — the single gate every
 * protected route/layout uses.
 *
 * Rejects (returns null) when the token is malformed/expired, when no such user
 * exists, when the account is blocked, or when the token's `ver` no longer
 * matches the user's current `tokenVersion` (i.e. the session was revoked by a
 * sign-out or a security event). Because revocation is enforced here, a stolen
 * cookie dies the moment the account's `tokenVersion` is bumped.
 */
export async function resolveSessionUser(token: string | undefined): Promise<UserDoc | null> {
  if (!token) return null;
  const claims = verifySessionToken(token);
  if (!claims) return null;
  const user = await findUserById(claims.sub);
  if (!user) return null;
  if (user.isBlocked) return null;
  if (user.tokenVersion !== claims.ver) return null;
  return user;
}