import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChatMessage, LlmClient } from './llm.contract.js';

/**
 * Azure AI Foundry project endpoint chat client.
 *
 * Uses the OpenAI-compatible route:
 *   {project}/openai/v1/chat/completions
 *
 * Example project endpoint:
 *   https://REV-OPs.services.ai.azure.com/api/projects/rev-ops-v1
 *
 * The model/deployment name is passed in the body as `model`.
 * Auth is via the `api-key` header (optionally `Authorization: Bearer`).
 */
@Injectable()
export class AzureOpenAIClient implements LlmClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly deployment: string;
  private readonly maxTokens: number;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.baseUrl = (
      config.get<string>('AZURE_OPENAI_ENDPOINT') ??
      'https://your-resource.services.ai.azure.com/api/projects/your-project'
    ).replace(/\/+$/, '');
    this.apiKey = config.get<string>('AZURE_OPENAI_KEY') ?? '';
    this.deployment =
      config.get<string>('AZURE_OPENAI_DEPLOYMENT_NAME') ?? 'gpt-5.6-sol';
    this.maxTokens = Number(config.get<number>('AZURE_OPENAI_MAX_TOKENS') ?? 8192);
    this.timeoutMs = Number(config.get<number>('AZURE_OPENAI_TIMEOUT_MS') ?? 120000);
  }

  private chatUrl(): string {
    // The AI Foundry project /openai/v1 path does NOT accept an api-version
    // query parameter (it returns 400 "api-version query parameter is not
    // allowed when using /v1 path"). The version is implicit on that route.
    return `${this.baseUrl}/openai/v1/chat/completions`;
  }

  private requestBody(messages: ChatMessage[], stream: boolean) {
    return {
      model: this.deployment,
      messages,
      max_completion_tokens: this.maxTokens,
      stream,
    };
  }

  private async request(
    messages: ChatMessage[],
    stream: boolean,
    signal?: AbortSignal,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['api-key'] = this.apiKey;
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return fetch(this.chatUrl(), {
      method: 'POST',
      headers,
      body: JSON.stringify(this.requestBody(messages, stream)),
      signal: signal ?? AbortSignal.timeout(this.timeoutMs),
    });
  }

  /**
   * Non-streaming completion. Returns the full assistant text.
   */
  async complete(
    messages: ChatMessage[],
    _temperature = 1,
    signal?: AbortSignal,
  ): Promise<string> {
    const response = await this.request(messages, false, signal);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Azure Foundry error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() ?? '';
  }

  /**
   * Streaming completion (SSE). Yields each content delta as it arrives.
   */
  async *streamTokens(
    messages: ChatMessage[],
    _temperature = 1,
    signal?: AbortSignal,
  ): AsyncGenerator<string, void, undefined> {
    const response = await this.request(messages, true, signal);

    if (!response.ok || !response.body) {
      const body = await response.text();
      throw new Error(`Azure Foundry error ${response.status}: ${body}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') return;
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
}
