import Link from "next/link";
import { FaInstagram, FaLinkedinIn, FaXTwitter } from "react-icons/fa6";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { PaymentRow } from "@/components/ui/PaymentIcons";
import { footer, site } from "@/lib/content";

/* Brand marks come from react-icons — Lucide dropped brand glyphs in v1. */
const SOCIAL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  linkedin: FaLinkedinIn,
  instagram: FaInstagram,
  x: FaXTwitter,
};

/** A single footer link. */
function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-9 items-center rounded-sm text-[0.9375rem] text-ink-muted transition-colors duration-200 ease-out hover:text-brand"
    >
      {children}
    </Link>
  );
}

/** Column heading — a real h2/h3 so the footer has a navigable outline. */
function ColumnTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-[0.6875rem] font-semibold tracking-[0.12em] text-ink uppercase">
      {children}
    </h2>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line bg-bg-elevated">
      <Container>
        {/* ------------------------------------------------------------ Top */}
        <div className="grid grid-cols-1 gap-10 py-14 sm:grid-cols-2 lg:grid-cols-12 lg:gap-8 lg:py-16">
          {/* (a) Company ------------------------------------------------ */}
          <div className="lg:col-span-4">
            <Logo />

            <p className="mt-4 max-w-sm text-[0.9375rem] leading-relaxed text-ink-muted">
              {site.shortDescription}
            </p>

            <ul className="mt-6 flex items-center gap-2">
              {site.social.map((item) => {
                const IconCmp = SOCIAL_ICONS[item.key];
                if (!IconCmp) return null;
                return (
                  <li key={item.key}>
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={item.label}
                      className="inline-flex size-11 items-center justify-center rounded-control border border-line text-ink-muted transition-colors duration-200 ease-out hover:border-brand-line hover:text-brand active:bg-brand-soft"
                    >
                      <IconCmp className="size-[1.125rem]" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* (b) Product links ------------------------------------------ */}
          <nav aria-label="Product" className="lg:col-span-2">
            <ColumnTitle>Product</ColumnTitle>
            <ul className="mt-4 flex flex-col">
              {footer.productLinks.map((link) => (
                <li key={link.href + link.label}>
                  <FooterLink href={link.href}>{link.label}</FooterLink>
                </li>
              ))}
            </ul>
          </nav>

          {/* (c) Policies ------------------------------------------------ */}
          <nav aria-label="Policies" className="lg:col-span-3">
            <ColumnTitle>Policies</ColumnTitle>
            <ul className="mt-4 flex flex-col">
              {footer.policyLinks.map((link) => (
                <li key={link.href + link.label}>
                  <FooterLink href={link.href}>{link.label}</FooterLink>
                </li>
              ))}
            </ul>
          </nav>

          {/* (d) Payments ------------------------------------------------ */}
          <div className="lg:col-span-3">
            <ColumnTitle>{footer.payments.title}</ColumnTitle>
            <p className="mt-4 text-sm text-ink-subtle">
              Secure checkout. All major cards and Indian payment rails supported.
            </p>
            <PaymentRow methods={footer.payments.methods} className="mt-4" />
          </div>
        </div>

        {/* -------------------------------------------------------- Bottom */}
        <div className="border-t border-line py-7">
          {/* Copyright hard left, developer credit hard right. Stacks centred
              on mobile where a two-up row would be too tight. */}
          <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:gap-4 sm:text-left">
            <p className="order-1 text-sm text-ink-subtle sm:order-none">
              {site.copyright.prefix}{" "}
              <a
                href={site.copyright.brandHref}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm font-medium text-ink transition-colors duration-200 ease-out hover:text-brand"
              >
                {site.copyright.brandLabel}
              </a>
              {site.copyright.suffix}
            </p>

            <p className="order-2 text-sm text-ink-subtle sm:order-none sm:text-right">
              {site.developerCredit.prefix}{" "}
              <a
                href={site.developerCredit.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm font-medium text-ink transition-colors duration-200 ease-out hover:text-brand"
              >
                {site.developerCredit.name}
              </a>
            </p>
          </div>
        </div>
      </Container>
    </footer>
  );
}
