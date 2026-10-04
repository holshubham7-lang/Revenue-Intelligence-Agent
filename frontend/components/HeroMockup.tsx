import { cn } from "@/lib/utils";
import { heroMockup } from "@/lib/content";

/*
 * Decorative dashboard mockup, built entirely from HTML + inline SVG.
 *
 * Rendered on the server (no client JS) and animated with a CSS keyframe, so
 * it costs nothing on the main thread and cannot cause layout shift. The whole
 * card is `aria-hidden` because it is illustrative — the real product screens
 * the numbers come from, not this graphic.
 *
 * The chart is a plain <svg> with a viewBox, so it scales cleanly from a
 * 360px phone to a wide desktop column without a second asset.
 */

const W = 640;
const H = 240;
const PAD = { top: 18, right: 14, bottom: 26, left: 46 };

/** Chart domain — fixed so the shape is stable between renders (no CLS). */
const Y_MIN = 1.5;
const Y_MAX = 5.0;

type Point = { x: number; y: number; month: string; value: number };

function project(index: number, value: number): Point {
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  return {
    x: PAD.left + (index / (heroMockup.trend.length - 1)) * innerW,
    y: PAD.top + (1 - (value - Y_MIN) / (Y_MAX - Y_MIN)) * innerH,
    month: "",
    value,
  };
}

/**
 * Catmull-Rom → cubic Bezier. Gives the line a smooth, data-analytics curve
 * without pulling in a charting library (and without animating width/height,
 * which is a jank source).
 */
function smoothPath(points: Point[]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const t = 0.2; // tension — lower is tighter/straighter

    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;

    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

const actual = heroMockup.trend
  .map((d, i) => (d.actual === null ? null : project(i, d.actual)))
  .filter((p): p is Point => p !== null);

const forecast = heroMockup.trend
  .map((d, i) => (d.forecast === null ? null : project(i, d.forecast)))
  .filter((p): p is Point => p !== null);

/** Bridge the gap so the dashed forecast visually continues the solid line. */
const bridge: Point[] = forecast.length
  ? [actual[actual.length - 1], ...forecast]
  : [];

const areaPath =
  actual.length > 1
    ? `${smoothPath(actual)} L ${actual[actual.length - 1].x.toFixed(2)} ${(H - PAD.bottom).toFixed(2)} L ${actual[0].x.toFixed(2)} ${(H - PAD.bottom).toFixed(2)} Z`
    : "";

const gridValues = [2, 3, 4, 5];
const lastActual = actual[actual.length - 1];

export function HeroMockup({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)} aria-hidden="true">
      {/* Soft gradient glow behind the card */}
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[3rem] bg-[radial-gradient(60%_60%_at_50%_40%,var(--brand)_0%,transparent_70%)] opacity-[0.14] blur-2xl dark:opacity-25" />

      <div className="animate-float overflow-hidden rounded-card border border-line bg-bg-elevated shadow-glow">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-line bg-bg-muted/60 px-4 py-3">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-2 flex items-center gap-1.5 rounded-pill bg-positive-soft px-2 py-0.5 font-mono text-[0.625rem] font-medium tracking-wide text-positive uppercase">
            <span className="animate-live size-1.5 rounded-full bg-positive" />
            {heroMockup.liveLabel}
          </span>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          {/* KPI row */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {heroMockup.kpis.map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-tile border border-line bg-bg p-2.5 sm:p-3"
              >
                <p className="truncate font-mono text-[0.5625rem] tracking-wide text-ink-subtle uppercase sm:text-[0.625rem]">
                  {kpi.label}
                </p>
                <p className="mt-1 font-display text-sm font-bold text-ink tabular-nums sm:text-lg">
                  {kpi.value}
                </p>
                <p className="mt-0.5 font-mono text-[0.5625rem] font-medium text-positive sm:text-[0.6875rem]">
                  {kpi.delta}
                </p>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="rounded-tile border border-line bg-bg p-2.5 sm:p-3">
            <div className="mb-1 flex items-baseline justify-between">
              <p className="font-mono text-[0.5625rem] tracking-wide text-ink-subtle uppercase sm:text-[0.625rem]">
                Revenue trend ($M)
              </p>
              <p className="flex items-center gap-2.5 font-mono text-[0.5625rem] text-ink-subtle sm:text-[0.625rem]">
                <span className="flex items-center gap-1">
                  <span className="h-0.5 w-3.5 rounded-full bg-brand" /> Actual
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-0 w-3.5 border-t-2 border-dashed border-accent" /> Forecast
                </span>
              </p>
            </div>

            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="h-auto w-full"
              fill="none"
              focusable="false"
            >
              <defs>
                <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Gridlines + y labels */}
              {gridValues.map((v) => {
                const { y } = project(0, v);
                return (
                  <g key={v}>
                    <line
                      x1={PAD.left}
                      y1={y}
                      x2={W - PAD.right}
                      y2={y}
                      stroke="var(--line)"
                      strokeWidth="1"
                    />
                    <text
                      x={PAD.left - 8}
                      y={y + 3.5}
                      textAnchor="end"
                      className="fill-ink-subtle font-mono text-[9px]"
                    >
                      ${v}M
                    </text>
                  </g>
                );
              })}

              {/* Area under the actual series */}
              {areaPath && <path d={areaPath} fill="url(#areaFill)" />}

              {/* Solid actual line */}
              <path
                d={smoothPath(actual)}
                stroke="var(--brand)"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Dashed forecast line */}
              {bridge.length > 1 && (
                <path
                  d={smoothPath(bridge)}
                  stroke="var(--accent)"
                  strokeWidth="2.25"
                  strokeDasharray="5 5"
                  strokeLinecap="round"
                />
              )}

              {/* Anchor dot on the last actual point + forecast endpoint */}
              {lastActual && (
                <circle
                  cx={lastActual.x}
                  cy={lastActual.y}
                  r="4"
                  fill="var(--brand)"
                  stroke="var(--bg-elevated)"
                  strokeWidth="2"
                />
              )}
              {forecast.length > 0 && (
                <circle
                  cx={forecast[forecast.length - 1].x}
                  cy={forecast[forecast.length - 1].y}
                  r="4"
                  fill="var(--accent)"
                  stroke="var(--bg-elevated)"
                  strokeWidth="2"
                />
              )}

              {/* X labels — every other month so they never collide */}
              {heroMockup.trend.map((d, i) =>
                i % 2 === 0 ? (
                  <text
                    key={d.month}
                    x={project(i, Y_MIN).x}
                    y={H - 8}
                    textAnchor="middle"
                    className="fill-ink-subtle font-mono text-[9px]"
                  >
                    {d.month}
                  </text>
                ) : null,
              )}
            </svg>
          </div>

          {/* AI insight strip */}
          <div className="flex items-start gap-2.5 rounded-tile border border-brand-line bg-brand-soft p-3">
            <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-brand text-brand-fg">
              <svg
                viewBox="0 0 24 24"
                className="size-3.5"
                fill="currentColor"
                focusable="false"
                aria-hidden="true"
              >
                <path d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2z" />
              </svg>
            </span>
            <p className="text-xs leading-relaxed text-brand-soft-fg">
              <span className="font-semibold">{heroMockup.insight.label}: </span>
              {heroMockup.insight.text}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
