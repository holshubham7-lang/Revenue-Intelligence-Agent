import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "inverse" | "inverseOutline";
type Size = "sm" | "md" | "lg";

/*
 * One button system, six variants, three sizes.
 *
 * Every state the checklist asks for lives here: hover, focus (inherited from
 * the global :focus-visible ring), active (pressed, via `active:`), and
 * disabled (`disabled:` + `aria-disabled`). Hover and active only change
 * colour — never layout — so nothing shifts or jitters.
 *
 * IMPORTANT — never restyle a button by passing conflicting colour utilities
 * through `className`. `cn()` is a plain joiner with no conflict resolution
 * (see lib/utils.ts), so `bg-brand` from a variant and `bg-white` from
 * className would BOTH land in the class list and the winner would be decided
 * by Tailwind's stylesheet order, not by the order written here. That is how
 * the CTA "Sign up free" button once rendered brand-blue-on-brand-blue and only
 * became visible on hover. Add a variant instead.
 */

const base =
  "inline-flex items-center justify-center gap-2 rounded-control font-semibold " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out " +
  "cursor-pointer select-none whitespace-nowrap " +
  "disabled:pointer-events-none disabled:opacity-55 disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand text-brand-fg shadow-sm hover:bg-brand-hover hover:shadow-md active:bg-brand-hover",
  secondary:
    "bg-brand-soft text-brand-soft-fg hover:bg-brand-line active:bg-brand-line",
  outline:
    "border border-line-strong bg-bg-elevated text-ink hover:border-brand hover:text-brand active:bg-brand-soft",
  ghost: "text-ink-muted hover:bg-bg-muted hover:text-ink active:bg-bg-inset",

  /* For placement on the fixed deep-blue CTA band. Uses band-specific tokens
     so the styling is identical in light and dark theme. */
  inverse:
    "bg-white text-on-band shadow-sm hover:bg-on-band-hover hover:shadow-md active:bg-on-band-active",
  inverseOutline:
    "border border-white/50 bg-transparent text-white hover:border-white hover:bg-white/10 active:bg-white/20",
};

const sizes: Record<Size, string> = {
  // min-h-11 (44px) on every size keeps touch targets above the 44px minimum.
  sm: "min-h-11 px-4 text-sm",
  md: "min-h-11 px-5 text-[0.9375rem]",
  lg: "min-h-12 px-6 text-base",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
};

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: CommonProps & {
  href: string;
  external?: boolean;
  "aria-label"?: string;
  onClick?: () => void;
}) {
  const classes = cn(base, variants[variant], sizes[size], className);

  // External links open in a new tab safely (no reverse tabnabbing).
  if (href.startsWith("http")) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes}
        {...rest}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {children}
    </button>
  );
}
