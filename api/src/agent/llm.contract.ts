/**
 * Shared contract for LLM clients used by the agent.
 *
 * The Azure AI Foundry client implements this interface so the AgentService
 * can answer chat requests (and stream) through a single abstraction.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmClient {
  /**
   * Non-streaming completion. Returns the full assistant text.
   */
  complete(
    messages: ChatMessage[],
    temperature?: number,
    signal?: AbortSignal,
  ): Promise<string>;

  /**
   * Streaming completion. Yields each text delta as it arrives.
   */
  streamTokens(
    messages: ChatMessage[],
    temperature?: number,
    signal?: AbortSignal,
  ): AsyncGenerator<string, void, undefined>;
}
