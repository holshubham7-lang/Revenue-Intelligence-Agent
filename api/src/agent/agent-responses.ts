/**
 * Client for the Azure AI Foundry *agent* endpoint, OpenAI Responses protocol.
 *
 * Distinct from `foundry.ts`, which talks to a model deployment's
 * `/openai/v1/chat/completions`. This one addresses a deployed agent —
 * `/agents/{name}/endpoint/protocols/openai/responses` — whose instructions and
 * tools live on the deployment, so the request carries only the input text.
 *
 * Two contract quirks, both learned by probing the live endpoint:
 *  - This route *requires* an `api-version` query parameter (the project-level
 *    `/openai/v1` route rejects one). `2025-05-15-preview` is the version the
 *    agent service accepts; others return `UnsupportedApiVersion`.
 *  - Auth is the project `api-key` header. A bare `Authorization: Bearer` with
 *    the same key is a 403 here.
 *
 * A failure to reach the agent is deliberately an ordinary thrown error: the
 * caller in `analyze.ts` falls back to the model deployment, because a question
 * set generated from the uploaded metrics is worth more to the user than a 503.
 */

const endpoint = (process.env.AZURE_OPENAI_ENDPOINT ?? "").replace(/\/+$/, "");
const apiKey = process.env.AZURE_OPENAI_KEY ?? "";
const agentName = process.env.AZURE_FOUNDRY_AGENT_NAME ?? "Rev-Ops-V1";
const apiVersion = process.env.AZURE_FOUNDRY_AGENT_API_VERSION ?? "2025-05-15-preview";
const timeoutMs = Number(process.env.AZURE_OPENAI_TIMEOUT_MS ?? 120_000);

export class AgentEndpointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentEndpointError";
  }
}

function responsesUrl(): string {
  return (
    `${endpoint}/agents/${encodeURIComponent(agentName)}` +
    `/endpoint/protocols/openai/responses?api-version=${encodeURIComponent(apiVersion)}`
  );
}

/**
 * Pulls the assistant text out of a Responses API payload.
 *
 * The canonical shape is `output[]` of items whose `content[]` holds
 * `output_text` parts; newer revisions also set a top-level `output_text`.
 * Reasoning items and tool calls carry no user-facing text and are skipped. A
 * chat-shaped `choices[0].message.content` is accepted last so a protocol
 * change degrades to readable text rather than to silence.
 */
export function extractResponseText(data: unknown): string {
  if (typeof data !== "object" || data === null) return "";
  const payload = data as Record<string, unknown>;

  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (Array.isArray(payload.output)) {
    const parts: string[] = [];
    for (const item of payload.output) {
      if (typeof item !== "object" || item === null) continue;
      const content = (item as Record<string, unknown>).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (typeof part !== "object" || part === null) continue;
        const text = (part as Record<string, unknown>).text;
        if (typeof text === "string" && text.trim()) parts.push(text);
      }
    }
    if (parts.length > 0) return parts.join("\n").trim();
  }

  const choices = payload.choices;
  if (Array.isArray(choices) && typeof choices[0] === "object" && choices[0] !== null) {
    const message = (choices[0] as Record<string, unknown>).message;
    if (typeof message === "object" && message !== null) {
      const content = (message as Record<string, unknown>).content;
      if (typeof content === "string") return content.trim();
    }
  }
  return "";
}

/**
 * Runs one non-streaming agent turn and returns its text.
 *
 * One retry, and only for transient transport faults — the same policy as the
 * model client. A 4xx from the service (a missing agent card, say) is not
 * transient and is not retried.
 */
export async function runAgent(input: string): Promise<string> {
  if (!endpoint) throw new AgentEndpointError("AZURE_OPENAI_ENDPOINT is not set.");

  let lastError: unknown = new AgentEndpointError("unknown error");

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(responsesUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "api-key": apiKey } : {}),
        },
        body: JSON.stringify({ input, stream: false }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new AgentEndpointError(`Foundry agent error ${response.status}: ${detail}`);
      }

      const text = extractResponseText(await response.json());
      if (!text) throw new AgentEndpointError("Foundry agent returned no text.");
      return text;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const transient =
        message.includes("fetch failed") ||
        message.includes("ECONNRESET") ||
        message.includes("ETIMEDOUT") ||
        message.includes("timed out") ||
        message.includes("socket hang up");
      if (!transient || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  throw lastError;
}
