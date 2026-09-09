import type { SVGProps } from "react";

export type IconName =
  | "arrow-left"
  | "arrow-right"
  | "arrow-up-right"
  | "check"
  | "question"
  | "spark"
  | "shield"
  | "upload"
  | "chart"
  | "layers"
  | "target"
  | "document"
  | "report"
  | "impact"
  | "scorecard"
  | "summary"
  | "priority"
  | "action"
  | "menu"
  | "close"
  | "play"
  | "clock"
  | "link"
  | "lock"
  | "plus"
  | "send"
  | "logout"
  | "eye"
  | "eye-off"
  | "search"
  | "alert"
  | "chevron-down"
  | "settings"
  | "edit"
  | "user"
  | "crown"
  | "trend"
  | "marketing"
  | "sales"
  | "operations"
  | "customers"
  | "disconnect"
  | "refresh"
  | "copy"
  | "dashboard"
  | "plugin"
  | "building";

const paths: Record<IconName, React.ReactNode> = {
  "arrow-left": (
    <path d="M20 12H5m0 0 6-6m-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
  ),
  "arrow-right": (
    <path d="M4 12h15m0 0-6-6m6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  ),
  "arrow-up-right": (
    <path d="M7 17 17 7m0 0H8m9 0v9" strokeLinecap="round" strokeLinejoin="round" />
  ),
  check: (
    <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  question: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.2a2.6 2.6 0 0 1 5.1.7c0 1.7-2.6 2.1-2.6 3.6" strokeLinecap="round" />
      <circle cx="12" cy="16.4" r="0.4" fill="currentColor" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.2 2.2m8.4 8.4 2.2 2.2m0-12.8-2.2 2.2M7.8 16.2l-2.2 2.2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3.2" />
    </>
  ),
  shield: (
    <path d="M12 3.5 19 6v5.2c0 4.1-2.7 7.6-7 9.3-4.3-1.7-7-5.2-7-9.3V6l7-2.5Zm-2.8 8.6 2 2 3.8-4" strokeLinecap="round" strokeLinejoin="round" />
  ),
  upload: (
    <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 13.5v2.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2.5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  chart: (
    <path d="M4 20V10m5.3 10V6.5m5.4 13.5V11m5.3 9V3.5" strokeLinecap="round" />
  ),
  layers: (
    <path d="m12 4 8 4.5-8 4.5-8-4.5L12 4Zm-8 9.5 8 4.5 8-4.5M4 14.5 12 19l8-4.5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  document: (
    <path d="M6.5 3.5h7L18.5 8v12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Zm7 0v4.5h4.5M8.5 12.5h7m-7 3.5h4" strokeLinecap="round" strokeLinejoin="round" />
  ),
  report: (
    <path d="M4.5 4.5a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-15Zm5 7.5h5v4.5h-5V12ZM9.5 5.5h5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  impact: (
    <path d="M4 20h16M6 20v-5m4 5v-8m4 8V7m4 13v-4" strokeLinecap="round" />
  ),
  scorecard: (
    <path d="M4 5.5h16M4 12h16M4 18.5h16M7.5 5.5V18.5" strokeLinecap="round" />
  ),
  summary: (
    <path d="M4.5 4.5h15v15h-15zM8 10h8M8 14h5M8 6.5h8" strokeLinecap="round" strokeLinejoin="round" />
  ),
  priority: (
    <path d="M12 3.5 20 7v5.5c0 4-2.6 7.5-8 9.5-5.4-2-8-5.5-8-9.5V7l8-3.5Zm-2.5 8 1.8 1.8 3.5-3.6" strokeLinecap="round" strokeLinejoin="round" />
  ),
  action: (
    <path d="M12 3.5 20 7v5.5c0 4-2.6 7.5-8 9.5-5.4-2-8-5.5-8-9.5V7l8-3.5Zm0 12v-8m0 8-2.5-2.5m2.5 2.5 2.5-2.5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  menu: (
    <path d="M4 6.5h16M4 12h16M4 17.5h16" strokeLinecap="round" />
  ),
  close: (
    <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
  ),
  play: (
    <path d="M8.5 5.8v12.4L18 12 8.5 5.8Z" strokeLinejoin="round" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  link: (
    <path d="M9.5 14.5 14.5 9.5m-8.5 6L4 17.5A2.1 2.1 0 0 0 7 20.5l2-2M20.5 7l-2 2a2.1 2.1 0 0 1-3-3l2-2a2.1 2.1 0 0 1 3 3Z" strokeLinecap="round" strokeLinejoin="round" />
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.5v2" strokeLinecap="round" />
    </>
  ),
  trend: (
    <path d="M4 17.5 9.5 12l3.5 3.5L20 8m0 0h-5m5 0v5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  marketing: (
    <>
      <path d="m3 11 18-5v12L3 14v-3Z" strokeLinejoin="round" />
      <path d="M11.6 17a3 3 0 1 1-5.9-1.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  sales: (
    <>
      <path d="M12 2.5v19" strokeLinecap="round" />
      <path d="M17 5.5H9a3.5 3.5 0 0 0 0 7h6a3.5 3.5 0 0 1 0 7H6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  operations: (
    <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" strokeLinecap="round" strokeLinejoin="round" />
  ),
  customers: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0M16 5.3a3.2 3.2 0 0 1 0 6.2M16.8 14a5.5 5.5 0 0 1 3.7 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  disconnect: (
    <>
      <path d="M9.5 14.5 14.5 9.5M6 18 4 17.5A2.1 2.1 0 0 1 7 20l2-2M20.5 7l-2 2a2.1 2.1 0 0 1-3-3l2-2a2.1 2.1 0 0 1 3 3Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.5 5.5l-13 13" strokeLinecap="round" />
    </>
  ),
  plus: (
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  ),
  refresh: (
    <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  send: (
    <path d="M4.5 12 19.5 4.5 15.5 19.5 12 14l-7.5-2Zm7.5 2 7.5-9.5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  logout: (
    <>
      <path d="M10 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 12H17m0 0-4-4m4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  "eye-off": (
    <>
      <path d="m3.5 3.5 17 17" strokeLinecap="round" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M10.7 5.2C11.1 5.1 11.5 5 12 5c6.5 0 10 7 10 7s-1.3 2.5-3.7 4.6M4.2 8.2C3 9.6 2 12 2 12s3.5 7 10 7c1.5 0 2.9-.5 4.1-1.2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" strokeLinecap="round" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5 21 20H3L12 3.5Z" strokeLinejoin="round" />
      <path d="M12 10v4" strokeLinecap="round" />
      <circle cx="12" cy="16.6" r="0.4" fill="currentColor" stroke="none" />
    </>
  ),
  "chevron-down": (
    <path d="m6 9.5 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v3m0 12.4v3M21.2 12h-3M5.8 12h-3M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1m0-12.9 2.1 2.1m8.8 8.6 2.1 2.1" strokeLinecap="round" />
    </>
  ),
  edit: (
    <>
      <path d="M14.5 4.5 19.5 9.5 8 21H3v-5L14.5 4.5Z" strokeLinejoin="round" />
      <path d="M12 7l5 5" strokeLinecap="round" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" strokeLinecap="round" />
    </>
  ),
  crown: (
    <path d="m4 8 4 3 4-5 4 5 4-3-1.8 9H5.8L4 8Z" strokeLinecap="round" strokeLinejoin="round" />
  ),
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  plugin: (
    <>
      <path d="M12 3v3M12 6v2.5M8 3v3M8 6h8M6.5 9h11v3a5.5 5.5 0 0 1-11 0V9Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 17.5V21" strokeLinecap="round" />
    </>
  ),
  building: (
    <>
      <path d="M4 20.5h16M6 20.5V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15.5M6 8.5h9M8.5 11.5h3m-3 3h3m4 6h2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number;
};

export function Icon({ name, size = 20, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}