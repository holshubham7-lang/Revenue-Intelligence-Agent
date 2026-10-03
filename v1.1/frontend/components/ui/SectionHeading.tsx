import { cn } from "@/lib/utils";

/**
 * Shared section header: eyebrow, heading, optional intro.
 *
 * Keeping this in one place is what makes the vertical rhythm consistent down
 * the page — every marketing section gets the same eyebrow → h2 → intro
 * hierarchy and the same spacing, in the same order.
 */
export function SectionHeading({
  eyebrow,
  title,
  intro,
  titleId,
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  titleId: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-2xl",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      {eyebrow && (
        <p className="font-mono text-xs font-medium tracking-[0.12em] text-brand uppercase">
          {eyebrow}
        </p>
      )}
      <h2
        id={titleId}
        className="mt-3 font-display text-3xl leading-[1.15] font-bold text-ink sm:text-4xl"
      >
        {title}
      </h2>
      {intro && (
        <p className="mt-4 text-base leading-relaxed text-ink-muted sm:text-lg">{intro}</p>
      )}
    </div>
  );
}
