import { createElement } from "react";
import {
  ArrowRight,
  BrainCircuit,
  ChartNoAxesCombined,
  FileBarChart,
  Funnel,
  LayoutDashboard,
  Moon,
  Plug,
  Rocket,
  Sparkles,
  Sun,
  TrendingUp,
  UserMinus,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps a string key (as stored in `lib/content.ts`) to a Lucide icon.
 *
 * Keeping the mapping here means the content file stays a pure-data module
 * with no icon-library imports, so copy edits never touch component code.
 */
const ICONS: Record<string, LucideIcon> = {
  "trending-up": TrendingUp,
  "layout-dashboard": LayoutDashboard,
  "user-minus": UserMinus,
  funnel: Funnel,
  sparkles: Sparkles,
  "file-bar-chart": FileBarChart,
  plug: Plug,
  "wand-sparkles": WandSparkles,
  "brain-circuit": BrainCircuit,
  rocket: Rocket,
  "chart-no-axes-combined": ChartNoAxesCombined,
  sun: Sun,
  moon: Moon,
  close: X,
  "arrow-right": ArrowRight,
};

export function getIcon(key: string): LucideIcon {
  return ICONS[key] ?? ChartNoAxesCombined;
}

type IconProps = {
  /** Key from the `ICONS` map above. */
  name: string;
  className?: string;
  /** Stroke width. Keep it consistent within a hierarchy level (1.75 default). */
  strokeWidth?: number;
};

/**
 * Renders a Lucide icon by key.
 *
 * Icons are decorative here — every icon in this system sits next to a text
 * label or inside a labelled control, so they are hidden from assistive tech
 * to avoid duplicate announcements. Pass `title` when an icon is the *only*
 * representation of meaning.
 */
export function Icon({ name, className, strokeWidth = 1.75 }: IconProps) {
  // `createElement` rather than `<Cmp />`: the component reference comes from a
  // lookup table, and the React Compiler lint rules reject rendering a
  // dynamically-resolved component through JSX.
  return createElement(getIcon(name), {
    className,
    strokeWidth,
    "aria-hidden": true,
  });
}
