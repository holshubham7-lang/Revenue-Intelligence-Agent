"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CompanyOnboarding } from "@/components/dashboard/CompanyOnboarding";
import { ThinkingIndicator } from "@/components/dashboard/ThinkingIndicator";
import { Markdown } from "@/components/dashboard/Markdown";
import { DashboardLayout, useDashboard } from "@/components/dashboard/DashboardLayout";
import { Icon } from "@/components/ui/Icon";
import { API_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  createChatSession,
  loadChatHistory,
  saveChatHistory,
  upsertChat,
  type ChatSession,
} from "@/lib/chat-history";

type Message = {
  role: "user" | "assistant";
  content: string;
  status?: "typing";
};

const SUGGESTIONS = [
  "Find revenue leaks in last quarter",
  "Build a RevOps health dashboard",
  "Summarize my monthly business report",
  "Where should we focus next?",
];

const MAX_HISTORY = 8;

export function DashboardShell() {
  return (
    <DashboardLayout>
      <ChatView />
    </DashboardLayout>
  );
}

function ChatView() {
  const {
    user,
    companyReady,
    onboardingOpen,
    setOnboardingOpen,
    chats,
    setChats,
    activeChatId,
    setActiveChatId,
  } = useDashboard();

  const [history] = useState<ReturnType<typeof loadChatHistory>>(() =>
    loadChatHistory(),
  );
  const [messages, setMessages] = useState<Message[]>(() => {
    const active = history.activeId
      ? history.sessions.find((s) => s.id === history.activeId)
      : undefined;
    return active ? active.messages.map((m) => ({ ...m })) : [];
  });
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<"idle" | "thinking" | "typing">("idle");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatsRef = useRef<ChatSession[]>(chats);
  const activeChatIdRef = useRef<string | null>(activeChatId);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    const session = chatsRef.current.find((s) => s.id === activeChatId);
    if (session) {
      setMessages(session.messages.map((m) => ({ ...m })));
      setPhase("idle");
    } else if (activeChatId === null) {
      setMessages([]);
      setPhase("idle");
    }
  }, [activeChatId]);

  useEffect(() => {
    if (!user) return;
    if (messages.length === 0) return;
    const timer = window.setTimeout(() => {
      let nextId = activeChatIdRef.current;
      let nextChats: ChatSession[];
      if (nextId) {
        nextChats = upsertChat(chatsRef.current, nextId, messages);
      } else {
        const created = createChatSession(messages);
        nextChats = [created, ...chatsRef.current];
        nextId = created.id;
        activeChatIdRef.current = nextId;
        setActiveChatId(nextId);
      }
      chatsRef.current = nextChats;
      setChats(nextChats);
      saveChatHistory({ sessions: nextChats, activeId: nextId });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [messages, user, setChats, setActiveChatId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, phase]);

  const handleTypingComplete = useCallback(() => {
    setMessages((prev) =>
      prev.map((m, i) =>
        i === prev.length - 1 && m.role === "assistant"
          ? { ...m, status: undefined }
          : m,
      ),
    );
    setPhase("idle");
  }, []);

  async function send(text: string) {
    const content = text.trim();
    if (!content || phase !== "idle") return;
    setInput("");
    setPhase("thinking");
    setMessages((prev) => [...prev, { role: "user", content }]);

    const MAX_THINKING_MS = 2500;
    const thinkingStart = Date.now();
    let started = false;
    let revealed = false;

    const reveal = (firstToken?: string) => {
      if (revealed) return;
      revealed = true;
      setPhase("typing");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: firstToken ?? "",
          status: "typing",
        },
      ]);
    };

    const appendToken = (token: string) => {
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant") {
          copy[copy.length - 1] = {
            ...last,
            content: last.content + token,
          };
        }
        return copy;
      });
    };

    const maybeReveal = () => {
      if (revealed || !started) return;
      if (Date.now() - thinkingStart >= MAX_THINKING_MS) {
        reveal();
      }
    };

    const capTimer = window.setTimeout(maybeReveal, 400);

    try {
      const history = messages
        .filter((m) => m.role !== "user" || m.content !== content)
        .slice(-MAX_HISTORY)
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch(`${API_URL}/agent/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content, history }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Agent request failed (${response.status})`);
      }

      started = true;

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
          const dataLine = block
            .split("\n")
            .find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          const payload = dataLine.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload);
            if (typeof parsed.token === "string") {
              if (!revealed) {
                reveal(parsed.token);
              } else {
                appendToken(parsed.token);
              }
            }
          } catch {
            // ignore malformed frames
          }
        }
      }

      if (!revealed) reveal();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `I wasn't able to reach the intelligence engine right now. ${message}`,
        },
      ]);
    } finally {
      window.clearTimeout(capTimer);
      handleTypingComplete();
    }
  }

  async function handleCopy(index: number, text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedIndex(index);
    window.setTimeout(() => setCopiedIndex((c) => (c === index ? null : c)), 2000);
  }

  function tryAgain(index: number) {
    let previousUser = "";
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        previousUser = messages[i].content;
        break;
      }
    }
    if (!previousUser) return;
    setMessages((prev) => prev.slice(0, index));
    send(previousUser);
  }

  const canSend = Boolean(input.trim()) && phase === "idle";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        {companyReady && onboardingOpen ? (
          <CompanyOnboarding
            onDone={(result, conversation) => {
              setOnboardingOpen(false);
              if (result) {
                const chatMessages = (conversation?.length
                  ? conversation
                  : [{ role: "assistant", content: result }]
                ).map((m) => ({
                  role: m.role === "user" ? ("user" as const) : ("assistant" as const),
                  content: m.content,
                }));
                const created = createChatSession(
                  chatMessages,
                  "Revenue Intelligence assessment",
                );
                const nextChats = [created, ...chatsRef.current];
                chatsRef.current = nextChats;
                setChats(nextChats);
                activeChatIdRef.current = created.id;
                setActiveChatId(created.id);
                setMessages(chatMessages);
                saveChatHistory({
                  sessions: nextChats,
                  activeId: created.id,
                });
              }
            }}
          />
        ) : (
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-4 pb-10 text-center">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-200/70">
                  <Icon name="spark" size={28} />
                </span>
                <h1 className="mt-5 text-2xl font-bold tracking-[-0.02em] text-ink">
                  How can I help you today?
                </h1>
                <p className="mt-2 max-w-md text-[0.9375rem] leading-relaxed text-ink-muted">
                  Ask about your revenue data and the agent will surface leaks,
                  opportunities, and next steps for your business.
                </p>
                <div className="mt-8 grid w-full max-w-2xl gap-2.5 sm:grid-cols-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setInput(suggestion)}
                      className="cursor-pointer rounded-xl border border-line bg-surface-muted px-4 py-3 text-left text-sm text-ink-muted transition-colors hover:border-brand-500 hover:bg-brand-50/60 hover:text-brand-800"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
                {messages.map((message, index) => {
                  const isStreaming =
                    message.role === "assistant" &&
                    message.status === "typing" &&
                    index === messages.length - 1;

                  if (isStreaming) {
                    return (
                      <div key={index} className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-line bg-surface-muted px-4 py-3 text-[0.9375rem] leading-relaxed text-ink">
                          <span>{message.content}</span>
                          <span className="inline-block w-[2px] h-[1.1em] align-middle ml-px bg-brand-600 animate-cursor-blink" />
                        </div>
                      </div>
                    );
                  }

                  if (message.role === "assistant") {
                    return (
                      <div key={index} className="flex justify-start">
                        <div className="max-w-[85%]">
                          <div className="rounded-2xl rounded-bl-md border border-line bg-surface-muted px-4 py-3 text-[0.9375rem] leading-relaxed text-ink">
                            <Markdown content={message.content} />
                          </div>
                          <div className="mt-1.5 ml-1 flex items-center gap-1">
                            <button
                              type="button"
                              aria-label="Copy response"
                              data-tooltip="Copy"
                              onClick={() => handleCopy(index, message.content)}
                              className={cn(
                                "tooltip flex size-8 cursor-pointer items-center justify-center rounded-lg transition-colors",
                                copiedIndex === index
                                  ? "text-brand-700"
                                  : "text-ink-faint hover:bg-surface hover:text-ink",
                              )}
                            >
                              <Icon
                                name={copiedIndex === index ? "check" : "copy"}
                                size={16}
                              />
                            </button>
                            <button
                              type="button"
                              aria-label="Try again"
                              data-tooltip="Try again"
                              onClick={() => tryAgain(index)}
                              className="tooltip flex size-8 cursor-pointer items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-surface hover:text-ink"
                            >
                              <Icon name="refresh" size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={index}
                      className={cn(
                        "flex",
                        message.role === "user" ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-4 py-3 text-[0.9375rem] leading-relaxed",
                          message.role === "user"
                            ? "rounded-br-md bg-brand-600 text-white"
                            : "rounded-bl-md border border-line bg-surface-muted text-ink",
                        )}
                      >
                        {message.content}
                      </div>
                    </div>
                  );
                })}
                {phase === "thinking" ? <ThinkingIndicator /> : null}
              </div>
            )}
          </div>
        )}
      </div>

      {onboardingOpen ? (
        <div
          id="onboarding-input-slot"
          className="shrink-0 border-t border-line bg-surface px-4 py-3 md:px-6"
        />
      ) : (
        <div className="shrink-0 border-t border-line bg-surface px-4 py-3 md:px-6">
          <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl border border-line-strong bg-surface-muted p-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Ask StratVeda Revenue Intelligence Agent…"
              aria-label="Message the Revenue Intelligence Agent"
              className="max-h-48 min-h-6 flex-1 resize-none bg-transparent px-2 py-1.5 text-[0.9375rem] text-ink placeholder:text-ink-faint focus:outline-none"
            />
            <button
              type="button"
              onClick={() => send(input)}
              disabled={!canSend}
              aria-label="Send message"
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                canSend
                  ? "cursor-pointer bg-brand-600 text-white hover:bg-brand-700"
                  : "cursor-not-allowed bg-surface text-ink-faint opacity-60",
              )}
            >
              <Icon name="send" size={18} />
            </button>
          </div>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[0.6875rem] text-ink-faint">
            AI-powered insights help you make better decisions. Verify critical information when needed.
          </p>
        </div>
      )}
    </div>
  );
}