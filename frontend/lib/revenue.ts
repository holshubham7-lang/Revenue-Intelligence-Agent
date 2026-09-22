/** Shared formatting helpers for the revenue views. */

export function formatRelativeScanTime(value: string | Date): string {
  const then = typeof value === "string" ? new Date(value) : value;
  const diffMs = Date.now() - then.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatCurrency(
  value: number | undefined | null,
  currency = "USD",
): string {
  const amount = value ?? 0;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: amount >= 1000 ? 0 : 2,
  }).format(amount);
}

export function formatPercent(value: number | undefined | null): string {
  const v = value ?? 0;
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export function formatDate(value: string | Date | undefined | null): string {
  if (!value) return "—";
  const then = typeof value === "string" ? new Date(value) : value;
  return then.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}