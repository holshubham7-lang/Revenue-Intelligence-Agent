/**
 * Tiny class-name joiner.
 *
 * Deliberately dependency-free — the app does not need the full power of
 * `clsx` + `tailwind-merge`, only "drop falsy values and join with spaces".
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
