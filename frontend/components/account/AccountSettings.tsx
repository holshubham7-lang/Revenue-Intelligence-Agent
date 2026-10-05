"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Loader2, ShieldCheck, UserCog } from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/Button";
import { postJson } from "@/lib/api/csrf-client";
import type { ProviderKey } from "@/lib/contracts";
import { company } from "@/lib/content";
import { cn } from "@/lib/utils";

const copy = company.account;

/**
 * Provider name lookup, widened so an account whose `authProvider` predates the
 * current provider list falls back to its raw value instead of indexing a type
 * that has no such key.
 */
const providerLabels: Record<string, string> = copy.details.providerLabels;

/** The account document, minus everything this page must never receive. */
export type AccountSettingsData = {
  name: string;
  email: string;
  profileImage?: string;
  hasPassword: boolean;
  /** `password`, or the provider this account signs in with. Server truth. */
  authProvider: string;
  isEmailVerified: boolean;
  /** Preformatted on the server: formatting in the client would render a
      different day for a viewer west of UTC than the server did. */
  memberSince: string;
  linkedProviders: { provider: ProviderKey; linkedEmail: string; linkedAt: string }[];
};

/** First letters of the first two words, uppercased — "Jane Doe" → "JD". */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

type FieldErrors = Record<string, string | undefined>;

const fieldClass = cn(
  "h-12 w-full rounded-control border border-line bg-bg-elevated px-4 text-[0.9375rem] text-ink shadow-inner transition-colors duration-200 ease-out",
  "placeholder:text-ink-subtle focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/25",
);

/**
 * A guarded avatar that falls back to initials if the provider image fails to
 * load. Using `loading="lazy"` keeps the page from downloading social photos
 * until they are visible.
 */
function AccountAvatar({ name, image }: { name: string; image?: string }) {
  const [failed, setFailed] = useState(false);

  if (!image || failed) {
    return (
      <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-brand-soft font-display text-lg font-bold text-brand">
        {initials(name)}
      </span>
    );
  }

  return (
    <span className="inline-flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft">
      {/* eslint-disable-next-line @next/next/no-img-element -- provider-hosted avatars span several hostnames, so a fixed next/image allowlist does not fit */}
      <img
        src={image}
        alt=""
        width={56}
        height={56}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="size-14 object-cover"
      />
    </span>
  );
}

/**
 * Pulls `{ field: message }` out of the API's error envelope.
 *
 * Field-level errors go on the inputs themselves; `fallback` is used when the
 * response has a message but no fields, which is every failure that isn't a
 * validation problem (wrong current password, a conflict, a database fault).
 */
async function readFailure(response: Response, fallback: string): Promise<FieldErrors> {
  try {
    const data = (await response.json()) as {
      error?: { message?: string; fields?: FieldErrors };
    };
    const message = data.error?.message ?? fallback;
    return data.error?.fields ? { ...data.error.fields, _form: message } : { _form: message };
  } catch {
    return { _form: fallback };
  }
}

/** True when the failure was described per-field rather than as one message. */
function hasFieldErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).some((key) => key !== "_form");
}

/** A single-line status under a form: `status` for good news, `alert` for bad. */
function FormNote({ tone, children }: { tone: "ok" | "bad"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "bad" ? "alert" : "status"}
      className={cn(
        "mt-4 flex items-start gap-2 rounded-control border px-3.5 py-2.5 text-sm leading-relaxed",
        tone === "ok"
          ? "border-brand/30 bg-brand-soft text-brand-soft-fg"
          : "border-negative/30 bg-negative-soft text-negative",
      )}
    >
      {tone === "ok" ? (
        <Check className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
      ) : null}
      <span>{children}</span>
    </p>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  type?: string;
  autoComplete?: string;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(fieldClass, error && "border-negative focus:border-negative focus:ring-negative/25")}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Card({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-bg-elevated">
      <div className="border-b border-line bg-bg-muted px-5 py-4">
        <h2 className="font-display text-base font-bold text-ink">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{body}</p>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/**
 * Account settings — the person, not the company.
 *
 * Two writable things, and both are deliberately small: the display name, and the
 * password for accounts that have one. The email is read-only here on purpose —
 * it is the sign-in lookup key and the unique index, so changing it needs a
 * verification round trip this app has no mailer for. Saying so beats a field
 * that silently fails to save.
 *
 * Both forms keep their own errors inline rather than in a toast: a toast
 * disappears, and a validation message you can no longer read is a message the
 * user has to guess the meaning of.
 */
export function AccountSettings({ initial }: { initial: AccountSettingsData }) {
  const [name, setName] = useState(initial.name);
  const [savingName, setSavingName] = useState(false);
  const [nameNote, setNameNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [nameErrors, setNameErrors] = useState<FieldErrors>({});

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordNote, setPasswordNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(
    null,
  );
  const [passwordErrors, setPasswordErrors] = useState<FieldErrors>({});

  const { details } = copy;

  /** Clears one inline error as soon as the user starts fixing that field. */
  function clearPasswordError(field: string) {
    setPasswordErrors((prev) => {
      if (!prev[field]) return prev;
      return Object.fromEntries(Object.entries(prev).filter(([key]) => key !== field));
    });
  }

  async function handleSaveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingName) return;

    setNameNote(null);
    setNameErrors({});

    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setNameNote({ tone: "bad", text: copy.profile.emptyLabel });
      return;
    }
    /* Nothing to do. Answering here rather than posting keeps a double-click on
       Save from reporting a change that never happened. */
    if (trimmed === initial.name) {
      setNameNote({ tone: "bad", text: copy.profile.unchangedLabel });
      return;
    }

    setSavingName(true);
    try {
      const res = await postJson("/api/account/profile", { name: trimmed });
      if (!res.ok) {
        const errors = await readFailure(res, copy.profile.emptyLabel);
        setNameErrors(errors);
        /* Only when the failure wasn't already placed on the input — saying the
           same thing twice, once on the field and once underneath, reads as two
           separate problems. */
        if (errors._form && !hasFieldErrors(errors)) {
          setNameNote({ tone: "bad", text: errors._form });
        }
        return;
      }
      setName(trimmed);
      setNameNote({ tone: "ok", text: copy.profile.savedLabel });
      /* The header greets the user by name and is rendered by the shell above
         this component, which is a server component — a refresh is the only way
         it learns the new value, and it happens to be true of every other
         server-rendered copy too. */
      window.location.reload();
    } catch {
      setNameNote({ tone: "bad", text: copy.profile.emptyLabel });
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingPassword) return;

    setPasswordNote(null);
    setPasswordErrors({});

    if (!currentPassword) {
      setPasswordNote({ tone: "bad", text: copy.password.currentRequiredLabel });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordNote({
        tone: "bad",
        text: newPassword ? copy.password.newTooShortLabel : copy.password.newRequiredLabel,
      });
      return;
    }
    if (newPassword.length > 128) {
      setPasswordNote({ tone: "bad", text: copy.password.newTooLongLabel });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordNote({ tone: "bad", text: copy.password.mismatchLabel });
      return;
    }

    setSavingPassword(true);
    try {
      const res = await postJson("/api/account/password", {
        currentPassword,
        newPassword,
        confirmPassword,
      });
      if (!res.ok) {
        const errors = await readFailure(res, copy.password.wrongCurrentLabel);
        setPasswordErrors(errors);
        if (errors._form && !hasFieldErrors(errors)) {
          setPasswordNote({ tone: "bad", text: errors._form });
        }
        return;
      }
      /* Cleared rather than left filled: the old password is now wrong, and a
         password still sitting in a form is a password on screen. */
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordNote({ tone: "ok", text: copy.password.successLabel });
    } catch {
      setPasswordNote({ tone: "bad", text: copy.password.wrongCurrentLabel });
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-10 lg:px-12">
      <div className="flex items-start gap-3.5">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-card bg-brand-soft text-brand">
          <UserCog className="size-6" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div>
          <p className="font-mono text-xs tracking-[0.12em] text-ink-subtle uppercase">
            {copy.eyebrow}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">
            {copy.title}
          </h1>
          <p className="mt-2 max-w-xl text-[0.9375rem] leading-relaxed text-ink-muted">
            {copy.subtitle}
          </p>
        </div>
      </div>

      <div className="mt-8 space-y-6">
        {/* Profile ------------------------------------------------------- */}
        <Card title={copy.profile.title} body={copy.profile.body}>
          <form onSubmit={handleSaveName} noValidate>
            <Field
              id="account-name"
              label={copy.profile.nameLabel}
              value={name}
              onChange={(next) => {
                setName(next);
                setNameNote(null);
                setNameErrors((prev) => (prev.name ? {} : prev));
              }}
              placeholder={copy.profile.namePlaceholder}
              autoComplete="name"
              error={nameErrors.name}
            />
            <div className="mt-5 flex items-center justify-end gap-3">
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={savingName}
                onClick={() => setNameNote(null)}
              >
                {savingName ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    {copy.profile.savingLabel}
                  </>
                ) : (
                  copy.profile.saveLabel
                )}
              </Button>
            </div>
            {nameNote ? <FormNote tone={nameNote.tone}>{nameNote.text}</FormNote> : null}
          </form>
        </Card>

        {/* Password ------------------------------------------------------ */}
        <Card title={copy.password.title} body={copy.password.body}>
          {initial.hasPassword ? (
            <form onSubmit={handleChangePassword} noValidate className="space-y-5">
              <Field
                id="current-password"
                label={copy.password.currentLabel}
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(next) => {
                  setCurrentPassword(next);
                  clearPasswordError("currentPassword");
                }}
                placeholder={copy.password.currentPlaceholder}
                error={passwordErrors.currentPassword}
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  id="new-password"
                  label={copy.password.newLabel}
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(next) => {
                    setNewPassword(next);
                    clearPasswordError("newPassword");
                  }}
                  placeholder={copy.password.newPlaceholder}
                  error={passwordErrors.newPassword}
                />
                <Field
                  id="confirm-password"
                  label={copy.password.confirmLabel}
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(next) => {
                    setConfirmPassword(next);
                    clearPasswordError("confirmPassword");
                  }}
                  placeholder={copy.password.confirmPlaceholder}
                  error={passwordErrors.confirmPassword}
                />
              </div>
              <div className="flex items-center justify-end gap-3">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={savingPassword}
                  onClick={() => setPasswordNote(null)}
                >
                  <ShieldCheck className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  {savingPassword ? copy.password.submittingLabel : copy.password.submitLabel}
                </Button>
              </div>
              {passwordNote ? <FormNote tone={passwordNote.tone}>{passwordNote.text}</FormNote> : null}
            </form>
          ) : (
            <p className="text-[0.9375rem] leading-relaxed text-ink-muted">{copy.password.socialNote}</p>
          )}
        </Card>

        {/* Details ------------------------------------------------------- */}
        <Card title={details.title} body={details.body}>
          <div className="flex items-center gap-4">
            <AccountAvatar name={initial.name} image={initial.profileImage} />
            <div className="min-w-0">
              <p className="truncate font-display text-[0.9375rem] font-bold text-ink">
                {initial.name}
              </p>
              <p className="truncate text-sm text-ink-muted">{initial.email}</p>
            </div>
          </div>

          <dl className="mt-5 divide-y divide-line border-t border-line">
            <Row label={details.emailLabel} value={initial.email} />
            <Row
              label={details.providerLabel}
              value={
                initial.hasPassword
                  ? details.passwordProviderLabel
                  : (providerLabels[initial.authProvider] ?? initial.authProvider)
              }
            />
            <Row
              label={details.verifiedLabel}
              value={initial.isEmailVerified ? details.verifiedYesLabel : details.verifiedNoLabel}
            />
            <Row label={details.memberSinceLabel} value={initial.memberSince} />
          </dl>

          {initial.linkedProviders.length > 0 ? (
            <div className="mt-5">
              <p className="text-sm font-semibold text-ink">{details.linkedLabel}</p>
              <ul className="mt-2 space-y-1.5">
                {initial.linkedProviders.map((linked) => (
                  <li
                    key={`${linked.provider}-${linked.linkedEmail}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm"
                  >
                    <span className="font-medium text-ink">
                      {providerLabels[linked.provider] ?? linked.provider}
                    </span>
                    <span className="text-ink-subtle">{linked.linkedEmail}</span>
                    <span className="text-ink-subtle">· {linked.linkedAt}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs leading-relaxed text-ink-subtle">{details.linkedHint}</p>
            </div>
          ) : null}

          <div className="mt-6 border-t border-line pt-5">
            <p className="text-sm font-semibold text-ink">{details.workspaceLabel}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{details.workspaceBody}</p>
            <ButtonLink
              href="/company"
              variant="outline"
              size="sm"
              className="mt-3"
            >
              {details.workspaceCta}
              <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </ButtonLink>
          </div>
        </Card>
      </div>
    </div>
  );
}

/** One `label: value` line of the details table. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-3">
      <dt className="text-sm font-semibold text-ink-muted">{label}</dt>
      <dd className="text-[0.9375rem] text-ink">{value}</dd>
    </div>
  );
}