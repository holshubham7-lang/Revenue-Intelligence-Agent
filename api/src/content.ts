/**
 * Central content store for the Revenue Intelligence marketing site.
 *
 * Everything a marketer might want to change lives here so that no JSX file
 * needs to be touched for a copy edit. Components import from this module and
 * stay purely presentational.
 *
 * Icon fields hold a *string key* (not a component) so this file stays free of
 * `lucide-react` / `react-icons` imports. The consuming component maps the key
 * to the real icon component — see `components/ui/Icon.tsx`.
 */

/* -------------------------------------------------------------------------- */
/* Brand                                                                       */
/* -------------------------------------------------------------------------- */

export const site = {
  name: "Revenue Intelligence",
  legalName: "StratVeda Technologies Pvt. Ltd.",
  shortDescription:
    "Revenue intelligence that turns scattered revenue data into forecasts, alerts, and next-best actions.",
  /** Used for canonical/OG URLs. Point at the real domain when it exists. */
  url: "https://www.revenueintelligence.ai",
  supportEmail: "support@stratvedatech.com",
  supportPhone: "+91 98765 43210",
  address: {
    line1: "4th Floor, Tech Park Road",
    line2: "Bengaluru, Karnataka 560103",
    country: "India",
  },
  social: [
    { key: "linkedin", label: "StratVeda on LinkedIn", href: "https://www.linkedin.com" },
    { key: "instagram", label: "StratVeda on Instagram", href: "https://www.instagram.com" },
    { key: "x", label: "StratVeda on X", href: "https://x.com" },
  ],
  developerCredit: {
    prefix: "Design and Developed By",
    name: "StratVeda Technologies",
    href: "https://www.stratvedatech.com/",
  },
  copyright: {
    prefix: "Copyright © 2026",
    brandLabel: "StratVeda Technologies Pvt. Ltd.",
    brandHref: "https://stratvedatech.com/",
    suffix: " All rights reserved.",
  },
} as const;

/* -------------------------------------------------------------------------- */
/* SEO                                                                         */
/* -------------------------------------------------------------------------- */

export const seo = {
  title: "Revenue Intelligence — Understand, forecast, and grow your revenue",
  description:
    "Connect your CRM, billing, and product data. Revenue Intelligence unifies it, forecasts what is coming, and tells your team exactly what to do next.",
  keywords: [
    "revenue intelligence",
    "revenue forecasting",
    "revenue analytics",
    "churn prediction",
    "pipeline analytics",
    "B2B SaaS analytics",
  ],
  ogImage: "/opengraph-image",
  locale: "en_IN",
} as const;

/* -------------------------------------------------------------------------- */
/* Header                                                                      */
/* -------------------------------------------------------------------------- */

export const header = {
  /* The header is intentionally minimal: brand + the two account actions.
     There is no main nav and no mobile menu, so the component is a Server
     Component with no client JavaScript. */
  brand: {
    homeLabel: "Revenue Intelligence — home",
  },
  accountMenuLabel: "Account",
  actions: {
    signIn: { label: "Sign in", href: "/signin" },
    signUp: { label: "Sign up", href: "/signup" },
  },
  skipToContent: "Skip to main content",
} as const;

/* -------------------------------------------------------------------------- */
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

export const hero = {
  eyebrow: "Revenue intelligence platform",
  /** `highlight` is rendered in the accent colour inside the h1. */
  headline: {
    lead: "Turn revenue data into",
    highlight: "confident decisions",
  },
  subheadline:
    "Connect every revenue signal, forecast what comes next, and know exactly where to act — before the quarter closes.",
  primaryCta: { label: "Get started free", href: "/signup" },
  secondaryCta: { label: "Sign in", href: "/signin" },
  trustLine: "No credit card required · Set up in under 10 minutes",
} as const;

/**
 * Data rendered inside the hero dashboard mockup. Kept here (not in JSX) so the
 * numbers can be swapped without touching the SVG/chart component.
 */
export const heroMockup = {
  kpis: [
    { label: "ARR", value: "$4.82M", delta: "+18.4%", trend: "up" },
    { label: "Net revenue retention", value: "118%", delta: "+4.1pt", trend: "up" },
    { label: "Forecast accuracy", value: "94.2%", delta: "+2.8pt", trend: "up" },
  ],
  /** Revenue trend series (12 months, $M). Drives the SVG area chart. */
  trend: [
    { month: "Jan", actual: 1.9, forecast: null },
    { month: "Feb", actual: 2.1, forecast: null },
    { month: "Mar", actual: 2.35, forecast: null },
    { month: "Apr", actual: 2.6, forecast: null },
    { month: "May", actual: 2.9, forecast: null },
    { month: "Jun", actual: 3.2, forecast: null },
    { month: "Jul", actual: 3.45, forecast: null },
    { month: "Aug", actual: 3.8, forecast: null },
    { month: "Sep", actual: 4.1, forecast: null },
    { month: "Oct", actual: null, forecast: 4.35 },
    { month: "Nov", actual: null, forecast: 4.6 },
    { month: "Dec", actual: null, forecast: 4.82 },
  ],
  insight: {
    label: "AI insight",
    text: "Enterprise expansion in APAC is 3 weeks ahead of plan — 14 accounts are forecast to upgrade before quarter end.",
    severity: "positive",
  },
  liveLabel: "Live data",
} as const;

/* -------------------------------------------------------------------------- */
/* What you get                                                                */
/* -------------------------------------------------------------------------- */

export const features = {
  id: "features",
  eyebrow: "What you get",
  title: "Everything you need to run revenue on evidence",
  intro:
    "Six connected capabilities that turn raw pipeline and product data into decisions your team can defend in a board meeting.",
  items: [
    {
      icon: "trending-up",
      title: "Revenue forecasting",
      description:
        "Model-driven rollups that update as deals move, with confidence bands you can actually explain.",
    },
    {
      icon: "layout-dashboard",
      title: "Real-time dashboards",
      description:
        "One live view of bookings, billings, and retention. No spreadsheet reconciliation, no stale snapshots.",
    },
    {
      icon: "user-minus",
      title: "Churn and retention insights",
      description:
        "Early warning signals on accounts drifting away, scored by likelihood and revenue at risk.",
    },
    {
      icon: "funnel",
      title: "Pipeline and deal analytics",
      description:
        "Stage velocity, conversion rates, and slipped-deal detection across every segment and rep.",
    },
    {
      icon: "sparkles",
      title: "AI-powered recommendations",
      description:
        "Plain-language next-best actions generated from your own data — not generic playbooks.",
    },
    {
      icon: "file-bar-chart",
      title: "Custom reports and alerts",
      description:
        "Schedule the numbers leadership asks for, and get pinged the moment a metric moves out of range.",
    },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* How it works                                                                */
/* -------------------------------------------------------------------------- */

export const howItWorks = {
  id: "how-it-works",
  eyebrow: "How it works",
  title: "Four steps from raw data to real action",
  intro:
    "Most teams are live in a single afternoon. No rip-and-replace of your existing stack.",
  steps: [
    {
      icon: "plug",
      title: "Connect your data sources",
      description:
        "Plug in your CRM, billing, and product tools with read-only access. Nothing is rewritten in place.",
    },
    {
      icon: "wand-sparkles",
      title: "Unify and clean automatically",
      description:
        "Entities are matched, deduplicated, and normalised into one revenue model you can trust.",
    },
    {
      icon: "brain-circuit",
      title: "Get AI-powered insights",
      description:
        "Every sync produces findings and a forecast, explained in plain language your team will read.",
    },
    {
      icon: "rocket",
      title: "Act and track growth",
      description:
        "Turn each finding into an owned action plan and watch the metric move on the next refresh.",
    },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* Closing CTA                                                                 */
/* -------------------------------------------------------------------------- */

export const cta = {
  eyebrow: "Get started",
  title: "Know your revenue before it happens",
  supporting:
    "Join finance, sales, and product teams who stopped guessing at the number. Free to start, and you can be live before your next standup.",
  primary: { label: "Sign up free", href: "/signup" },
  secondary: { label: "Sign in", href: "/signin" },
  reassurance: "Free 14-day trial · No credit card required · Cancel anytime",
} as const;

/* -------------------------------------------------------------------------- */
/* Footer                                                                      */
/* -------------------------------------------------------------------------- */

export const footer = {
  productLinks: [
    { label: "Features", href: "/#features" },
    { label: "How it works", href: "/#how-it-works" },
    { label: "Pricing", href: "/pricing" },
  ],
  policyLinks: [
    { label: "Privacy Policy", href: "/privacy-policy" },
    { label: "Terms & Conditions", href: "/terms" },
    { label: "Cookie Policy", href: "/privacy-policy#cookies" },
  ],
  payments: {
    title: "Payments we accept",
    /** `key` maps to a react-icons component in components/ui/PaymentIcons.tsx */
    methods: [
      { key: "visa", label: "Visa" },
      { key: "mastercard", label: "Mastercard" },
      { key: "rupay", label: "RuPay" },
      { key: "upi", label: "UPI" },
      { key: "paypal", label: "PayPal" },
    ],
  },
} as const;

/* -------------------------------------------------------------------------- */
/* Sign up                                                                     */
/* -------------------------------------------------------------------------- */

/** Shape of the "brand moment" content rendered by `BrandPanel`. */
export type BrandPanelContent = {
  readonly headline: string;
  readonly benefits: readonly string[];
  readonly stat: {
    readonly label: string;
    readonly value: string;
    readonly caption: string;
  };
};

export const signup = {
  meta: {
    title: "Create your account",
    description: "Get a live forecast of your revenue in minutes.",
  },
  panel: {
    headline: "Know your revenue before it happens.",
    benefits: [
      "Connect your CRM, billing, and product tools in minutes",
      "Forecasts with the accuracy visible — never a black box",
      "Early-warning signals for churn and slipping deals",
      "A plain-language next best action for every finding",
    ],
    stat: { label: "Forecast accuracy", value: "94.2%", caption: "across 1,200+ teams" },
  },
  form: {
    title: "Create your account",
    subtitle: "Get a live forecast of your revenue in minutes.",
    oauthLabel: "Join with",
    divider: "or continue with your work email",
    providers: {
      google: {
        label: "Sign in with Google",
        oauthName: "Google",
        description: "Sign in with Google",
      },
      microsoft: {
        label: "Sign in with Microsoft",
        oauthName: "Microsoft",
        description: "Sign in with Microsoft",
      },
      linkedin: {
        label: "Sign in with LinkedIn",
        oauthName: "LinkedIn",
        description: "Sign in with LinkedIn",
      },
    },
    name: {
      label: "Full name",
      placeholder: "John Doe",
      hint: "The name your team will recognise.",
    },
    email: {
      label: "Work email",
      placeholder: "you@company.com",
      hint: "Your invite link is sent here.",
    },
    password: {
      label: "Password",
      placeholder: "At least 8 characters",
      show: "Show password",
      hide: "Hide password",
    },
    submit: "Create your account",
    submitting: "Creating your account…",
    success: {
      title: "Account created",
      message:
        "Your account is ready. Sign in to see your live forecast and next best actions.",
      actionLabel: "Go to sign in",
    },
    terms: {
      prefix: "By creating an account you agree to our",
      links: [
        { label: "Terms & Conditions", href: "/terms" },
        { label: "Privacy Policy", href: "/privacy-policy" },
      ],
      joiner: "and",
      punctuation: ".",
    },
    signInPrompt: "Already have an account?",
    signInLink: "Sign in",
    errors: {
      network:
        "We couldn't reach the sign-up service. Check your connection and try again.",
      server:
        "Couldn't create your account right now. Please try again in a moment.",
      oauthUnavailable:
        "Signing in with {provider} isn't connected yet. Try another method for now.",
    },
  },
} as const;

/* -------------------------------------------------------------------------- */
/* Sign in                                                                     */
/* -------------------------------------------------------------------------- */

export const signin = {
  meta: {
    title: "Welcome back",
    description:
      "Welcome back. Sign in to your Revenue Intelligence workspace to see your latest forecast, alerts, and next best actions.",
  },
  panel: {
    headline: "Know your revenue before it happens.",
    benefits: [
      "Your live forecast, updated as your data flows in",
      "Early-warning signals for churn and slipping deals",
      "A plain-language next best action for every finding",
    ],
    stat: { label: "Forecast accuracy", value: "94.2%", caption: "across 1,200+ teams" },
  },
  form: {
    title: "Welcome back",
    subtitle: "Sign in to your workspace to see your latest forecast and findings.",
    oauthLabel: "Continue with",
    divider: "or continue with your work email",
    email: {
      label: "Work email",
      placeholder: "you@company.com",
      hint: "Use the email tied to your workspace.",
    },
    password: {
      label: "Password",
      placeholder: "Your password",
      show: "Show password",
      hide: "Hide password",
    },
    forgot: "Forgot password?",
    submit: "Sign in",
    submitting: "Signing in…",
    errors: {
      network:
        "We couldn't reach the sign-in service. Check your connection and try again.",
      server: "Couldn't sign you in right now. Please try again in a moment.",
oauthUnavailable:
        "Signing in with {provider} isn't connected yet. Try another method for now.",
    },
    footer: {
      prompt: "Remembered it?",
      linkLabel: "Back to sign in",
      linkHref: "/signin",
    },
  },
} as const;

/* -------------------------------------------------------------------------- */
/* Dashboard (post-sign-in workspace)                                          */
/* -------------------------------------------------------------------------- */

export const company = {
  meta: {
    title: "Company profile",
    description:
      "Review and update the company details that tailor your forecasts, alerts, and next best actions.",
  },
  nav: {
    label: "Workspace navigation",
    signOutLabel: "Sign out",
    signingOutLabel: "Signing out…",
    signOutFailed: "We couldn't sign you out. Please try again.",
    items: [
      { key: "chat", label: "Chat", href: "/chat" },
      { key: "company", label: "Company profile", href: "/company" },
      { key: "dataSources", label: "Data sources", href: "/data" },
    ],
  },
  header: {
    menuLabel: "Open menu",
    closeLabel: "Close menu",
    workspaceLabel: "Workspace",
    upgradeLabel: "Upgrade to Premium",
  },
  page: {
    eyebrow: "Welcome to Revenue Intelligence",
    title: "Company registration",
    subtitle:
      "Tell us about your company so forecasts, alerts, and next best actions are tailored to you. You can change this any time.",
  },
  view: {
    eyebrow: "Your workspace",
    title: "Company profile",
    subtitle:
      "The company details saved in your workspace. Edit them any time and your forecasts, alerts, and next best actions stay in step.",
    editLabel: "Edit details",
    notProvided: "Not provided",
    createdLabel: "Registered",
    updatedLabel: "Last updated",
    assessmentLabel: "Assessment",
    assessmentComplete: "Complete",
    assessmentPending: "Not started yet",
  },
  stub: {
    eyebrow: "Workspace",
    soon: "This section is on its way. Check back soon.",
    backLabel: "Back to company profile",
  },

  /* ---------------------------------------------------------------------- */
  /* Prerequisite notice — shared by every route that needs a company record  */
  /* ---------------------------------------------------------------------- */

  /*
   * One notice, many routes. Chat, data sources, and the action plan all sit
   * downstream of the company profile, and each one used to answer that by
   * silently redirecting to `/company` — which reads as the click not working.
   * They now render this instead, so the requirement is stated where the user
   * asked and the next step is one click away.
   *
   * `steps` is the ordered prerequisite chain. A route renders the steps that
   * apply to it and marks the rest `pending`; only a step whose `href` is
   * reachable from the current state gets a link.
   *
   * Tone is deliberately amber, not brand green: green is this product's
   * "everything is working" colour, and a green card reads as a positive
   * confirmation rather than a blocked route. Amber says "action needed"
   * without the alarm of a destructive-action red.
   */
  prerequisite: {
    eyebrow: "Action required",
    label: "Setup incomplete",
    title: "Company details needed first",
    body: "Everything in this workspace is built on your company profile. Add it once and your data uploads, action plan, and chat all become available.",
    footnote:
      "Your progress isn't lost — you'll come straight back here once your details are saved.",
    steps: [
      {
        icon: "building",
        title: "Share your company details",
        body: "Tell us your industry, size, revenue range, and the problem you want to solve.",
        cta: "Add company details",
        href: "/company",
      },
      {
        icon: "database",
        title: "Share your data",
        body: "Upload your sales, marketing, operations, and customer success reports — or any one of them — so we can find where revenue is leaking.",
        cta: "Share your data",
        href: "/data",
      },
      {
        icon: "target",
        title: "Get your action plan",
        body: "Answer a few questions in the chat and we'll build a prioritised plan.",
        cta: "Start the chat",
        href: "/chat",
      },
    ],
    pendingLabel: "Locked",
    pendingHint: "Complete the step above first",
  },

  /* ---------------------------------------------------------------------- */
  /* Data upload, column mapping, and the resulting profile                 */
  /* ---------------------------------------------------------------------- */

  data: {
    meta: {
      title: "Data sources",
      description:
        "Share your sales, marketing, operations, and customer success reports so we can find where revenue is leaking.",
    },
    page: {
      eyebrow: "Your data",
      title: "Share your data",
      subtitle:
        "Revenue leaks between teams, not inside one of them. Share the reports you already produce — sales, marketing, operations, customer success — or all of them at once, and we'll show you exactly where the gaps are.",
    },
    reportTypes: {
      title: "Reports that help most",
      body: "Upload any of these, in any combination. Each one is optional.",
      items: [
        {
          key: "sales",
          title: "Sales",
          body: "Pipeline by stage, win rates, deal values, and how long deals sit before closing.",
        },
        {
          key: "marketing",
          title: "Marketing",
          body: "Spend by channel, leads generated, and how much pipeline each source creates.",
        },
        {
          key: "operations",
          title: "Operations",
          body: "Delivery throughput, cycle times, and where handoffs stall or get dropped.",
        },
        {
          key: "customerSuccess",
          title: "Customer success",
          body: "Retention, churn reasons, expansion, and accounts about to lapse.",
        },
        {
          key: "finance",
          title: "Finance",
          body: "Revenue by line, margins, invoice ageing, and forecast versus what actually landed.",
        },
      ],
      allLabel: "You can upload all five at once",
    },
    upload: {
      title: "Upload your reports",
      body: "Choose as many files as you have. We'll check each one, show you how we read every column, and only then analyse anything.",
      dropzone: "Drag your files here, or choose them from your computer.",
      chooseFile: "Choose files",
      uploading: "Uploading…",
      readingFile: "Reading {name}…",
      completeTitle: "Your data is analysed",
      continueToQuestions: "Continue to chat",
      uploadAnother: "Upload more reports",
      remainingLabel: "{count} still to confirm",
    },
    skip: "Skip for now",
    skipHint:
      "You can still get an action plan — we'll just ask about your business instead of using your files.",
    constraints:
      "Accepted formats: .csv, .tsv, .xlsx — up to 25 MB each. Every file is checked before it's stored, and none of them are used to train a model. Old .xls and PDF files can't be read here; re-save as .xlsx or export as CSV.",
    mapping: {
      title: "Check how we read your columns",
      body:
        "We matched your columns to the fields we need. Please check this is right — a wrong match would give you an action plan built on the wrong numbers.",
      columnLabel: "Your column",
      fieldLabel: "We read it as",
      ignore: "Ignore this column",
      ambiguous: "check",
      sheetLabel: "Sheet",
      requiredHint: "* Name is required. Everything else is optional but improves the analysis.",
      confirm: "Confirm and analyse",
      analysing: "Analysing…",
      skipFile: "Skip this file",
      discarded: "This file was skipped. Upload it again to include it.",
    },
    stats: {
      files: "Reports",
      records: "Records",
      amount: "Total value",
      dateRange: "Date range",
      stages: "Stages",
    },
    warningsTitle: "Things worth fixing in your data",
    notAnalysedTitle: "Not included in this analysis",
    dismiss: "Dismiss",
  },

  /* ---------------------------------------------------------------------- */
  /* Questions and the action plan                                            */
  /* ---------------------------------------------------------------------- */

  plan: {
    meta: {
      title: "Action plan",
      description: "A prioritised plan of what to do next, based on your data and your answers.",
    },
    page: {
      eyebrow: "Your plan",
      title: "A few questions first",
      subtitle:
        "Your data can't answer everything. These questions fill the gaps so your action plan is specific to your business.",
      withData: "These are informed by the reports you uploaded.",
      withoutData: "Answer these and we'll build your plan.",
    },
    questions: {
      placeholder: "Your answer…",
      submit: "Build my action plan",
      submitting: "Building your plan…",
      skip: "Skip and use the data alone",
      unavailableTitle: "We couldn't prepare your questions",
      unavailableBody:
        "The intelligence engine didn't respond, so we haven't guessed at questions. We never substitute a generic set, because you'd have no way of telling it apart from ones built from your data.",
      yourDataIsSaved: "Your uploads are analysed and saved.",
      retry: "Try again",
      retrying: "Asking the engine…",
      backToData: "Back to my data",
    },
    errors: {
      network: "We couldn't reach the service. Check your connection and try again.",
      generic: "Something went wrong. Please try again.",
    },
    plan: {
      diagnosisLabel: "What we found",
      actionsLabel: "What to do next",
      impactLabel: "Expected impact",
      priority: { high: "High", medium: "Medium", low: "Low" },
      effort: { low: "Low effort", medium: "Medium effort", high: "High effort" },
      metricLabel: "How you'll know it worked",
      dueLabel: "Due within",
      ownerLabel: "Owner",
      indexedNote:
        "This plan is saved to your agent's memory, so it can reference it in future conversations.",
      notIndexedNote: "This plan hasn't been added to your agent's memory yet.",
      regenerate: "Build a new plan",
      regenerating: "Rebuilding…",
      openChat: "Ask your agent about this",
    },
  },
  form: {
    legend: "Company details",
    companyName: {
      label: "Company name",
      placeholder: "Acme Corp",
      hint: "The legal or trading name your team will recognise.",
    },
    website: {
      label: "Website",
      placeholder: "https://acme.com",
      hint: "Optional — used to enrich your industry context.",
    },
    industry: {
      label: "Industry",
      placeholder: "Select an industry",
      options: ["Software", "Fintech", "E-commerce", "Healthcare", "Manufacturing", "Services", "Other"],
    },
    companySize: {
      label: "Company size",
      placeholder: "Select a range",
      options: ["1–10 people", "11–50 people", "51–200 people", "201–500 people", "500+ people"],
    },
    country: {
      label: "Country",
      placeholder: "India",
    },
    revenueRange: {
      label: "Annual revenue range",
      placeholder: "Select a revenue range",
      options: ["Under $1M", "$1M – $10M", "$10M – $50M", "$50M+"],
    },
    problem: {
      label: "Problem description / query",
      placeholder:
        "Describe the business problem or question you want Revenue Intelligence to help answer…",
      hint: "Optional · max 1500 words",
      maxWords: 1500,
    },
    submit: "Register company",
    submitting: "Registering…",
    editLegend: "Edit company details",
    save: "Save changes",
    saving: "Saving…",
    cancel: "Cancel",
    errors: {
      network:
        "We couldn't reach the service. Check your connection and try again.",
      server:
        "Couldn't save your company right now. Please try again in a moment.",
    },
  },
  chat: {
    meta: {
      title: "Chat",
      description:
        "Ask about your revenue, forecast, and next best actions in plain language.",
    },
    title: "How can I help you today?",
    subtitle:
      "Ask about your revenue data and your assessment — the agent will surface leaks, opportunities, and next steps for your business.",
    footnote:
      "AI-powered insights help you make better decisions. Verify critical information when needed.",
    placeholder: "Ask about your revenue, forecast, or next best actions…",
    sendLabel: "Send message",
    thinkingPhases: ["Thinking", "Preparing response"],
    errorTitle: "We hit a snag",
    retryLabel: "Try again",
    suggestions: [
      "What does my forecast look like this quarter?",
      "Where should I focus this month?",
      "Summarise the latest revenue changes.",
    ],
    /** The recent-chats rail: past conversations, reopened by clicking one. */
    history: {
      listLabel: "Recent chats",
      empty: "No conversations yet",
      deleteLabel: "Delete conversation",
      deleteConfirm: "Delete this conversation? This cannot be undone.",
      today: "Today",
      yesterday: "Yesterday",
      previous7: "Previous 7 days",
      earlier: "Earlier",
    },
  },
  onboarding: {
    meta: {
      title: "Onboarding",
      description:
        "Answer a few quick questions so the assessment is tailored to your business.",
    },
    welcome:
      "Hey! I'm ready to dig into your revenue. To tailor your assessment to your business, I'd like to ask a few quick questions first. Let's begin!",
    preparingQuestions: "Preparing your questions…",
    thinkingLabel: "Revenue Intelligence is thinking",
    answerPlaceholder: "Type your answer…",
    answerLabel: "Send answer",
    questionProgressLabel: "Question",
    responseLabel: "Building your assessment",
    responseSteps: [
      "Reviewing your answers",
      "Mapping revenue signals",
      "Analysing your business",
      "Generating your assessment",
    ],
    completeLabel: "Assessment complete",
    errorTitle: "We hit a snag",
    retryLabel: "Try again",
    retryAssessmentLabel: "Retry assessment",
    errorLoad: "The service could not prepare your questions right now.",
    errorSubmit: "The service could not build your assessment right now.",
  },
} as const;

/* -------------------------------------------------------------------------- */
/* Forgot password                                                             */
/* -------------------------------------------------------------------------- */

export const forgotPassword = {
  meta: {
    title: "Reset your password",
    description:
      "Enter your work email and we'll send you a secure link to reset your Revenue Intelligence password.",
  },
  form: {
    title: "Reset your password",
    subtitle:
      "Enter your work email and we'll send you a secure link to create a new password.",
    email: {
      label: "Work email",
      placeholder: "you@company.com",
      hint: "We'll send the reset link to this inbox.",
    },
    submit: "Send reset link",
    submitting: "Sending…",
    success: {
      title: "Check your inbox",
      message:
        "If an account exists for that email, a reset link is on its way. It expires in 30 minutes.",
    },
    errors: {
      network:
        "We couldn't reach that service. Check your connection and try again.",
      server: "Couldn't send the reset link right now. Please try again in a moment.",
    },
    footer: {
      prompt: "Remembered it?",
      linkLabel: "Back to sign in",
      linkHref: "/signin",
    },
  },
} as const;

/* -------------------------------------------------------------------------- */
/* Placeholder pages                                                           */
/* -------------------------------------------------------------------------- */

export const placeholderPages = {
  pricing: {
    title: "Pricing",
    description:
      "Simple, predictable plans that scale with your revenue. Full feature detail is on the way.",
  },
  "privacy-policy": {
    title: "Privacy Policy",
    description: "How StratVeda Technologies collects, uses, and protects your data.",
  },
  terms: {
    title: "Terms & Conditions",
    description: "The terms that govern your use of the Revenue Intelligence platform.",
  },
  "refund-policy": {
    title: "Refund Policy",
    description: "Our commitment to fair billing, refunds, and cancellations.",
  },
} as const;

/** Shared "coming soon" body for every placeholder route. */
export const placeholderBody =
  "This page is a placeholder while we finish building it. Everything on the home page is fully functional — head back there if you would like to take a look around." as const;
