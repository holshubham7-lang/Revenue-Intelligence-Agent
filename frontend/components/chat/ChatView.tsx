"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Bot, FolderOpen, RefreshCcw } from "lucide-react";

import { ChatMessage, type ChatMessageData } from "@/components/chat/ChatMessage";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { ThinkingIndicator } from "@/components/chat/ThinkingIndicator";
import { postJson } from "@/lib/api/csrf-client";
import { company } from "@/lib/content";

const { chat } = company;

/** Show the answer bubble even if the engine is slow to emit its first token. */
const MAX_THINKING_MS = 2500;
/** How often to check whether the thinking cap has been reached. */
const THINKING_POLL_MS = 400;

type Phase = "idle" | "thinking" | "typing";
type HistoryTurn = { role: "user" | "assistant"; content: string };

type ChatViewProps = {
  initialMessages: ChatMessageData[];
  /**
   * Conversation this transcript is saved under, or null while it is unsaved.
   * Passing one makes every reply append to that thread instead of starting a
   * fresh document each message.
   */
  threadId?: string | null;
  /** Called with the id the server saved under, when a reply creates one. */
  onThread?: (threadId: string) => void;
  /**
   * Reports the user has already shared, as the server counted them. Drives the
   * first-run note: a company with no report is told to add one, and that note
   * must not survive the upload that answers it.
   */
  reportCount?: number;
  /** Opens the reports panel, which is where a file is actually chosen. */
  onOpenFiles?: () => void;
  /** Runs the assessment interview, offered alongside the upload. */
  onStartInterview?: () => void;
};

/**
 * Revenue assistant chat.
 *
 * Sends each question to `/api/chat` and renders the reply as it streams in. The
 * server saves both turns under the conversation's id and reports that id back, so
 * the same conversation can be reopened from the sidebar after a refresh.
 */
export function ChatView({
  initialMessages,
  threadId = null,
  onThread,
  reportCount = 0,
  onOpenFiles,
  onStartInterview,
}: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessageData[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  const phaseRef = useRef<Phase>(phase);
  /* Owned here as much as by the caller: the first reply names the thread the
     user was writing into, and the next message must go out with that id. */
  const threadRef = useRef<string | null>(threadId);
  const onThreadRef = useRef(onThread);

  useEffect(() => {
    threadRef.current = threadId;
  }, [threadId]);

  useEffect(() => {
    onThreadRef.current = onThread;
  }, [onThread]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Keep the newest turn in view as tokens arrive.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, phase]);

  const send = useCallback(
    async (text: string, historyOverride?: HistoryTurn[]) => {
      const content = text.trim();
      if (!content || phaseRef.current !== "idle") return;

      setDraft("");
      setError(null);
      setPhase("thinking");
      setMessages((prev) => [...prev, { role: "user", content }]);

      const startedAt = Date.now();
      let revealed = false;
      let firstToken = "";

      const reveal = () => {
        if (revealed) return;
        revealed = true;
        setPhase("typing");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: firstToken, streaming: true },
        ]);
      };

      const appendToken = (token: string) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant") {
            next[next.length - 1] = { ...last, content: last.content + token };
          }
          return next;
        });
      };

      // Don't leave the user staring at the waveform if the engine is slow.
      const capTimer = window.setInterval(() => {
        if (!revealed && Date.now() - startedAt >= MAX_THINKING_MS) reveal();
      }, THINKING_POLL_MS);

      try {
        /* A saved thread carries its own context, so nothing is sent with it. An
           unsaved one sends the whole transcript on screen, which becomes the
           start of the thread the reply creates — so what the user was looking at
           survives the refresh instead of only its last few turns. */
        const history = threadRef.current
          ? []
          : (historyOverride ??
              messagesRef.current
                .filter((m) => !(m.role === "user" && m.content === content))
                .map((m) => ({ role: m.role, content: m.content })));

        const response = await postJson("/api/chat", {
          content,
          history,
          ...(threadRef.current ? { threadId: threadRef.current } : {}),
        });

        if (!response.ok || !response.body) {
          throw new Error(`The agent request failed (${response.status}).`);
        }

        /* The reply that starts a conversation carries the id it was saved under,
           so the next one continues that thread instead of opening a new one, and
           the caller learns it every time — the recent list orders itself by the
           last reply. Absent when saving failed: the chat still works in memory. */
        const savedThread = response.headers.get("x-thread-id");
        if (savedThread) {
          threadRef.current = savedThread;
          onThreadRef.current?.(savedThread);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";

          for (const block of blocks) {
            const dataLine = block.split("\n").find((line) => line.startsWith("data:"));
            if (!dataLine) continue;
            const payload = dataLine.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload) as { token?: string };
              if (typeof parsed.token !== "string" || !parsed.token) continue;
              if (revealed) {
                appendToken(parsed.token);
              } else {
                firstToken = parsed.token;
                reveal();
              }
            } catch {
              // ignore malformed frames
            }
          }
        }

        if (!revealed) reveal();
      } catch (err) {
        // Drop the empty bubble the reveal may have already added.
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return last?.role === "assistant" && last.content.trim().length === 0
            ? prev.slice(0, -1)
            : prev;
        });
        setError(err instanceof Error ? err.message : chat.errorTitle);
      } finally {
        window.clearInterval(capTimer);
        setMessages((prev) =>
          prev.map((message, i) =>
            i === prev.length - 1 && message.role === "assistant" && message.streaming
              ? { ...message, streaming: false }
              : message,
          ),
        );
        setPhase("idle");
      }
    },
    [],
  );

  /** Re-asks the user message that preceded the given assistant turn. */
  function regenerate(index: number) {
    const userIndex = messages.findLastIndex(
      (m, i) => i < index && m.role === "user",
    );
    if (userIndex === -1) return;
    const prompt = messages[userIndex].content;
    const history: HistoryTurn[] = messages.slice(0, userIndex).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    setMessages((prev) => prev.slice(0, userIndex));
    void send(prompt, history);
  }

  async function handleCopy(index: number, content: string) {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      setCopiedIndex(null);
      return;
    }
    setCopiedIndex(index);
    window.setTimeout(() => setCopiedIndex((c) => (c === index ? null : c)), 2000);
  }

  function retryFailed() {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    const index = messages.indexOf(lastUser);
    setMessages(messages.slice(0, index));
    void send(lastUser.content, messages.slice(0, index).map((m) => ({
      role: m.role,
      content: m.content,
    })));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 pb-10 text-center">
            {/* The agent, rather than a sparkle. A generic sparkle said "something
                clever is happening"; a robot says who is answering, which is the
                question a first-run user actually has on this screen. */}
            <span className="relative inline-flex size-16 items-center justify-center rounded-card bg-brand-soft text-brand">
              <Bot className="size-8" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-ink">
              {chat.title}
            </h1>
            <p className="mt-2 max-w-md text-[0.9375rem] leading-relaxed text-ink-muted">
              {reportCount > 0 ? chat.subtitle : chat.start.body}
            </p>

            {/* The first-run note, and only while it is true. A company that has
                shared a report gets the suggestions instead: the note would be
                describing something already done. */}
            {reportCount === 0 && onOpenFiles ? (
              <div className="mt-6 w-full max-w-xl rounded-card border border-line bg-bg-elevated p-5 text-left shadow-sm">
                <p className="font-display text-base font-bold text-ink">{chat.start.title}</p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={onOpenFiles}
                    className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control bg-brand px-4 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand-hover"
                  >
                    <FolderOpen className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    {chat.start.cta}
                  </button>
                  {onStartInterview ? (
                    <button
                      type="button"
                      onClick={onStartInterview}
                      className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-line px-4 text-sm font-medium text-ink-muted transition-colors hover:bg-bg-muted hover:text-ink"
                    >
                      {chat.start.interviewLabel}
                    </button>
                  ) : null}
                </div>
                {onStartInterview ? (
                  <p className="mt-2.5 text-xs text-ink-subtle">{chat.interview.startHint}</p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-8 grid w-full max-w-2xl gap-2.5 sm:grid-cols-2">
              {chat.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setDraft(suggestion)}
                  className="cursor-pointer rounded-card border border-line bg-bg-muted px-4 py-3 text-left text-sm leading-relaxed text-ink-muted transition-colors hover:border-brand hover:text-ink"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
            {messages.map((message, index) => (
              <ChatMessage
                key={index}
                message={message}
                copied={copiedIndex === index}
                onCopy={(content) => handleCopy(index, content)}
                onRetry={() => regenerate(index)}
              />
            ))}

            {phase === "thinking" ? <ThinkingIndicator phases={chat.thinkingPhases} /> : null}

            {error ? (
              <div className="flex items-start gap-3" role="alert">
                <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-negative-soft text-negative">
                  <AlertCircle className="size-4" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <div className="max-w-[85%] rounded-card rounded-bl-md border border-negative/30 bg-bg-muted px-4 py-3 text-[0.9375rem] leading-relaxed text-ink">
                  <p className="font-semibold text-negative">{chat.errorTitle}</p>
                  <p className="mt-1.5">{error}</p>
                  <button
                    type="button"
                    onClick={retryFailed}
                    className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-control bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand-hover"
                  >
                    <RefreshCcw className="size-3.5" strokeWidth={2} aria-hidden="true" />
                    {chat.retryLabel}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-line bg-bg">
        <div className="mx-auto w-full max-w-3xl px-4 py-3 sm:px-6">
          <MessageComposer
            value={draft}
            onChange={setDraft}
            onSubmit={() => void send(draft)}
            placeholder={chat.placeholder}
            label={chat.sendLabel}
            disabled={phase !== "idle"}
            hint={chat.footnote}
            {...(onOpenFiles
              ? { onAttach: onOpenFiles, attachLabel: chat.attachLabel }
              : {})}
          />
        </div>
      </div>
    </div>
  );
}
