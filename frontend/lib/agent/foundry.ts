import type { CompanyDoc } from "@/lib/companies";

/**
 * Revenues.ai agent backend — talks to the Azure AI Foundry OpenAI-compatible
 * endpoint that hosts the deployed assistant model.
 *
 * Flow (matches the v1.0 reference, re-expressed for this codebase):
 *   1. `generateQuestions(company)` asks the model for a JSON list of
 *      onboarding questions tailored to the company profile.
 *   2. `generateAssessment(company, questions, answers)` turns the collected
 *      Q&A into a Revenue Intelligence assessment (markdown).
 *   3. `streamChat(company, content, history)` streams the assistant's reply
 *      token-by-token, grounded in the company profile and its assessment.
 *
 * The model's system prompt is configured on the deployment itself, so
 * onboarding sends the instructions as a user turn. Chat additionally prepends
 * a short grounding system message so replies stay tied to this company.
 */

const endpoint = (process.env.AZURE_OPENAI_ENDPOINT ?? "").replace(/\/+$/, "");
const apiKey = process.env.AZURE_OPENAI_KEY ?? "";
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME ?? "gpt-5.6-sol";
const maxTokens = Number(process.env.AZURE_OPENAI_MAX_TOKENS ?? 8192);
const timeoutMs = Number(process.env.AZURE_OPENAI_TIMEOUT_MS ?? 120_000);
const questionCount = clamp(
  Number(process.env.ONBOARDING_QUESTION_COUNT ?? 6),
  3,
  15,
);

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : 6;
}

export type FoundryMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function chatUrl(): string {
  // The AI Foundry project /openai/v1 path rejects an api-version query param,
  // so it is intentionally omitted — the version is implicit on that route.
  return `${endpoint}/openai/v1/chat/completions`;
}

/**
 * Issues one chat-completions request and throws on a non-2xx response. Shared
 * by the non-streaming and streaming paths so both send an identical body.
 */
async function request(
  messages: FoundryMessage[],
  { stream }: { stream: boolean },
): Promise<Response> {
  if (!endpoint) {
    throw new Error("AZURE_OPENAI_ENDPOINT is not set.");
  }

  const response = await fetch(chatUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "api-key": apiKey, Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: deployment,
      messages,
      max_completion_tokens: maxTokens,
      stream,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Agent engine error ${response.status}: ${detail}`);
  }
  return response;
}

/**
 * Runs a single non-streaming completion and returns the assistant text (or
 * empty string). One retry for transient network failures, like the reference.
 */
async function complete(
  messages: FoundryMessage[],
  { allowRetry = true }: { allowRetry?: boolean } = {},
): Promise<string> {
  let lastError: unknown = new Error("unknown error");
  const attempts = allowRetry ? 2 : 1;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await request(messages, { stream: false });
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content?.trim() ?? "";
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const transient =
        message.includes("fetch failed") ||
        message.includes("ECONNRESET") ||
        message.includes("ETIMEDOUT") ||
        message.includes("timed out") ||
        message.includes("socket hang up") ||
        message.includes("Agent engine error");
      if (!transient || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  throw lastError;
}

/** A prior chat turn, as supplied by the client. */
export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

const maxHistory = 8;

/**
 * Prepends the company's profile, (when present) its onboarding assessment, and
 * (when present) the reports it has shared, so replies stay grounded in this
 * business rather than generic advice.
 *
 * `dataset` is the rendered form of the company's analysed reports, passed in by
 * the caller because reading them is a database read and this module must stay
 * free of one. It is the difference between answering "which deals went cold?"
 * from the file the user just shared and answering it from general advice about
 * deals going cold.
 */
function buildGrounding(company: CompanyDoc, dataset?: string): string {
  const parts = [
    "You are the Revenue Intelligence assistant for the company below. Ground every answer in this profile, its assessment, and any reports it has shared — and be specific and practical.",
    "",
    "Company profile:",
    buildCompanyProfile(company),
  ];

  const assessment = company.assessment?.result?.trim();
  if (assessment) {
    parts.push("", "Onboarding assessment:", assessment.slice(0, 6000));
  }

  const shared = dataset?.trim();
  if (shared) {
    parts.push(
      "",
      "Reports this company has shared. These are the figures and the analysis of them below — answer questions about the data from these, quote specific numbers, and say so plainly when a question cannot be answered from what is here rather than guessing.",
      shared,
    );
  } else {
    parts.push(
      "",
      "This company has not shared a report yet. If a question can only be answered from its data, say what report would answer it instead of inventing an answer.",
    );
  }

  return parts.join("\n");
}

/** Builds the message array for a chat turn: grounding + history + new message. */
export function buildChatMessages(
  company: CompanyDoc,
  content: string,
  history: ChatTurn[] = [],
  dataset?: string,
): FoundryMessage[] {
  const messages: FoundryMessage[] = [
    { role: "system", content: buildGrounding(company, dataset) },
  ];
  for (const turn of history.slice(-maxHistory)) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: "user", content });
  return messages;
}

/**
 * Streams the assistant's reply for a chat turn, yielding each content delta as
 * it arrives from the engine's Server-Sent Events response.
 */
export async function* streamChat(
  company: CompanyDoc,
  content: string,
  history: ChatTurn[] = [],
  dataset?: string,
): AsyncGenerator<string, void, undefined> {
  const response = await request(buildChatMessages(company, content, history, dataset), {
    stream: true,
  });

  if (!response.body) {
    throw new Error("The intelligence engine returned an empty stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{
              delta?: { content?: string };
              message?: { content?: string };
              finish_reason?: string | null;
            }>;
          };
          const choice = parsed.choices?.[0];
          if (!choice) continue;
          const delta = choice.delta?.content ?? choice.message?.content;
          if (delta) yield delta;
          if (choice.finish_reason) return;
        } catch {
          // ignore malformed partial frames
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Builds the company's profile block used inside agent prompts. */
export function buildCompanyProfile(company: CompanyDoc): string {
  const lines = [
    `- Name: ${company.companyName}`,
    company.website ? `- Website: ${company.website}` : "",
    company.industry ? `- Industry: ${company.industry}` : "",
    company.companySize ? `- Company size: ${company.companySize}` : "",
    company.country ? `- Country: ${company.country}` : "",
    company.revenueRange ? `- Annual revenue range: ${company.revenueRange}` : "",
    company.problem ? `- Problem statement / query: ${company.problem}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * Accepts model output that may wrap the JSON in fences, then extracts a string
 * array either from `{"questions": [...]}` or a bare `[...]`.
 */
export function parseJsonStringArray(content: string): string[] {
  const trimmed = content.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidates.push(fenced[1].trim());

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object") {
        const list = (parsed as { questions?: unknown }).questions;
        if (Array.isArray(list)) {
          return list.filter((q): q is string => typeof q === "string");
        }
      }
      if (Array.isArray(parsed)) {
        return parsed.filter((q): q is string => typeof q === "string");
      }
    } catch {
      // try the next candidate representation
    }
  }
  return [];
}

export type OnboardingAssessment = {
  questions: string[];
  answers: string[];
  result: string;
};

/**
 * Asks the deployed model to think up a focused set of onboarding questions for
 * this company. Returns the parsed questions, or throws if none come back.
 */
export async function generateQuestions(company: CompanyDoc): Promise<string[]> {
  const prompt = [
    "You are conducting a structured Revenue Intelligence onboarding interview with a business owner.",
    "",
    "Company profile:",
    buildCompanyProfile(company),
    "",
    `Based strictly on the company profile above, generate exactly ${questionCount} concise, high-value questions to better understand the business before producing a Revenue Intelligence assessment. Each question must be self-contained (understandable on its own), and relevant to revenue, sales, pricing, customers, or operations.`,
    "",
    "Respond with ONLY a JSON object in this exact shape:",
    `{"questions":["question 1","question 2", ...]}`,
    "Do not include markdown fences, commentary, or anything other than the JSON object.",
  ].join("\n");

  const content = await complete([{ role: "user", content: prompt }]);
  const questions = parseJsonStringArray(content).filter((q) => {
    const len = q.trim().length;
    return len > 0 && len <= 400;
  });

  if (questions.length === 0) {
    throw new Error("The intelligence engine did not return any onboarding questions.");
  }
  return questions;
}

/**
 * Produces the Revenue Intelligence assessment from the company profile and the
 * collected Q&A. Falls back to a deterministic markdown assessment when the
 * engine is unavailable so onboarding can always complete.
 */
export async function generateAssessment(
  company: CompanyDoc,
  questions: string[],
  answers: string[],
): Promise<string> {
  const qa = questions
    .map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i] ?? "(no answer)"}`)
    .join("\n\n");

  const prompt = [
    `You have just completed a Revenue Intelligence onboarding interview with ${company.companyName}.`,
    "",
    "Company profile:",
    buildCompanyProfile(company),
    "",
    "Interview answers:",
    qa,
    "",
    "Based on the company profile and the interview answers, produce a detailed Revenue Intelligence assessment following the system's assessment format — findings, priorities, and recommended actions. Be specific and practical for this business.",
  ].join("\n");

  let content = "";
  try {
    content = await complete([{ role: "user", content: prompt }]);
  } catch {
    // The engine is unavailable or exhausted right now. Degrade gracefully to a
    // deterministic assessment built from the profile and answers so the
    // onboarding flow always completes.
    content = buildFallbackAssessment(company, questions, answers);
  }

  if (!content.trim()) {
    content = buildFallbackAssessment(company, questions, answers);
  }
  return content;
}

/** Deterministic fallback used when the engine can't be reached. */
function buildFallbackAssessment(
  company: CompanyDoc,
  questions: string[],
  answers: string[],
): string {
  const learnings = questions
    .map((q, i) => `- **${q}**\n  ${answers[i]?.trim() || "Not answered."}`)
    .join("\n");

  return [
    "> Note: The live intelligence engine was briefly unavailable, so this assessment was compiled from your profile and answers. Ask your agent for a deeper analysis anytime.",
    "",
    `### Revenue Intelligence Assessment — ${company.companyName}`,
    "",
    "**Company snapshot**",
    buildCompanyProfile(company),
    "",
    "**What we learned**",
    learnings,
    "",
    "**Priority focus areas**",
    "1. **Own your funnel metrics** — instrument conversion at each stage so losses are visible before deciding where to invest.",
    "2. **Tighten the offer-to-value story** — clarify pricing objections and champion dynamics at the stages where deals stall.",
    "3. **Make pipeline data trustworthy** — standardize how interactions, pipeline changes, and loss reasons are captured.",
    "",
    "**Recommended first actions**",
    "- Define the conversion and velocity metrics you will track weekly.",
    "- Review target segment and pricing guidance with sales to remove ambiguity.",
    "- Fund the 2–3 highest-leverage actions, assign owners, and set a 30-day review.",
    "",
    "Ready to go deeper? Ask your agent for a full diagnostic on any of these areas.",
  ].join("\n");
}