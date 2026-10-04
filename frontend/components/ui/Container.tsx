import { cn } from "@/lib/utils";

/**
 * Page-width container.
 *
 * `size="narrow"` is used for long-form policy text so the measure stays
 * readable on wide monitors (the "readable text measure" rule).
 */
export function Container({
  children,
  className,
  size = "default",
}: {
  children: React.ReactNode;
  className?: string;
  size?: "default" | "narrow";
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-5 sm:px-8",
        size === "narrow" ? "max-w-3xl" : "max-w-7xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
