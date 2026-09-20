"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DashboardFooter } from "@/components/dashboard/DashboardFooter";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { CompanySetupModal } from "@/components/dashboard/CompanySetupModal";
import { CompanyOnboarding } from "@/components/dashboard/CompanyOnboarding";
import { ThinkingIndicator } from "@/components/dashboard/ThinkingIndicator";
import { Markdown } from "@/components/dashboard/Markdown";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { API_URL, APP_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  createChatSession,
  deleteChat,
  formatRelativeTime,
  loadChatHistory,
  saveChatHistory,
  upsertChat,
  type ChatSession,
} from "@/lib/chat-history";

type SessionUser = {
  id: string;
  name: string;
  email: string;
  companyId?: string;
  hasCompany?: boolean;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  status?: "typing";
};

type AuthState = "loading" | "authenticated" | "unauthenticated";

const SUGGESTIONS = [
  "Find revenue leaks in last quarter",
  "Build a RevOps health dashboard",
  "Summarize my monthly business report",
  "Where should we focus next?",
];

const MAX_HISTORY = 8;

export function DashboardShell() {
  const router = useRouter();
  const pathname = usePathname();
  const [history] = useState<ReturnType<typeof loadChatHistory>>(() =>
    loadChatHistory(),
  );
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [messages, setMessages] = useState<Message[]>(() => {
    const active = history.activeId
      ? history.sessions.find((s) => s.id === history.activeId)
      : undefined;
    return active ? active.messages.map((m) => ({ ...m })) : [];
  });
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<"idle" | "thinking" | "typing">("idle");
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [companyReady, setCompanyReady] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [chats, setChats] = useState<ChatSession[]>(history.sessions);
  const [activeChatId, setActiveChatId] = useState<string | null>(
    history.activeId,
  );
  const chatsRef = useRef<ChatSession[]>(history.sessions);
  const activeChatIdRef = useRef<string | null>(history.activeId);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    if (authState !== "authenticated") return;
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
  }, [messages, authState]);

  function openChat(chatId: string) {
    const session = chatsRef.current.find((s) => s.id === chatId);
    if (!session) return;
    activeChatIdRef.current = chatId;
    setActiveChatId(chatId);
    setMessages(session.messages.map((m) => ({ ...m })));
    setPhase("idle");
    setSidebarOpen(false);
  }

  function deleteChatEntry(chatId: string) {
    const nextChats = deleteChat(chatsRef.current, chatId);
    chatsRef.current = nextChats;
    setChats(nextChats);
    if (activeChatIdRef.current === chatId) {
      activeChatIdRef.current = null;
      setActiveChatId(null);
      setMessages([]);
    }
    saveChatHistory({ sessions: nextChats, activeId: activeChatIdRef.current });
  }

  async function checkOnboarding() {
    try {
      const response = await fetch(`${API_URL}/companies/me`, {
        credentials: "include",
      });
      if (!response.ok) return;
      const company = (await response.json()) as {
        onboardingCompleted?: boolean;
      };
      setOnboardingOpen(company.onboardingCompleted !== true);
    } catch {
      setOnboardingOpen(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function loadSession() {
      try {
        const response = await fetch(`${API_URL}/auth/me`, {
          credentials: "include",
        });
        if (!active) return;
        if (response.ok) {
          const data = (await response.json()) as SessionUser;
          setUser(data);
          const ready = Boolean(data.hasCompany ?? data.companyId);
          setCompanyReady(ready);
          setAuthState("authenticated");
          if (ready) {
            void checkOnboarding();
          }
        } else if (response.status === 401) {
          router.replace("/sign-in");
        } else {
          setAuthState("unauthenticated");
        }
      } catch {
        if (active) setAuthState("unauthenticated");
      }
    }
    loadSession();
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, phase]);

  async function handleLogout() {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
    } finally {
      window.location.assign(APP_URL);
    }
  }

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

    // Realistic "thinking" timing: keep the ThinkingIndicator visible briefly
    // so the phase labels feel alive, then switch to typing the moment the
    // first token arrives so the response streams in real time (no buffering
    // hold-then-dump behaviour).
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

    // Cap the thinking phase so it can never stall past the max duration.
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
              // Reveal typing with the very first token so streaming is live.
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

      // Stream finished: make sure we're in typing/idle state.
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

  function startNewChat() {
    activeChatIdRef.current = null;
    setActiveChatId(null);
    setMessages([]);
    setPhase("idle");
    setSidebarOpen(false);
  }

  function toggleSidebar() {
    setSidebarOpen((open) => !open);
  }

  async function completeCompanySetup() {
    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = (await response.json()) as SessionUser;
        setUser(data);
        setCompanyReady(Boolean(data.hasCompany ?? data.companyId));
      }
    } catch {
      // keep the modal open; the user can retry
    }
    void checkOnboarding();
  }

  if (authState === "loading") {
    return (
      <main className="flex h-dvh items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3">
          <Icon name="spark" size={28} className="animate-pulse-soft text-brand-600" />
          <p className="text-sm text-ink-muted">Loading your workspace…</p>
        </div>
      </main>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <main className="flex h-dvh items-center justify-center bg-surface px-4">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-center">
          <Icon name="lock" size={26} className="mx-auto text-brand-600" />
          <h1 className="mt-3 text-base font-semibold text-ink">
            Unable to verify your session
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Please sign in to return to your workspace.
          </p>
          <Button
            href="/sign-in"
            variant="primary"
            size="md"
            className="mt-5 w-full"
          >
            Go to sign in
          </Button>
        </div>
      </main>
    );
  }

  const canSend = Boolean(input.trim()) && phase === "idle";
  const newChatActive = pathname === "/dashboard" && activeChatId === null;

  return (
    <div className="flex h-dvh flex-col bg-surface">
      {user && !companyReady ? (
        <CompanySetupModal
          userName={user.name}
          onComplete={completeCompanySetup}
          onLogout={handleLogout}
        />
      ) : null}

      {user ? (
        <DashboardHeader
          user={user}
          onLogout={handleLogout}
          onToggleSidebar={toggleSidebar}
        />
      ) : null}

      <div className="relative flex min-h-0 flex-1">
        {sidebarOpen ? (
          <button
            type="button"
            aria-label="Close chat history"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-x-0 bottom-0 top-16 z-20 bg-ink/40 md:hidden"
          />
        ) : null}

        <aside
          className={cn(
            "fixed bottom-0 left-0 top-16 z-30 flex w-64 shrink-0 flex-col border-r border-line bg-surface-muted transition-transform duration-200 md:static md:top-auto md:translate-x-0 md:transition-none",
            sidebarOpen
              ? "translate-x-0 shadow-[0_0_40px_rgba(0,0,0,0.25)]"
              : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-end p-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close chat history"
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface hover:text-ink md:hidden"
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          <nav className="px-3 pb-2">
            <button
              type="button"
              onClick={startNewChat}
              aria-current={newChatActive ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                newChatActive
                  ? "bg-brand-50 text-brand-800"
                  : "text-ink-muted hover:bg-surface hover:text-brand-700",
              )}
            >
              <Icon
                name="plus"
                size={18}
                className={newChatActive ? "text-brand-600" : "text-ink-faint"}
              />
              New chat
            </button>
            {(
              [
                {
                  href: "/dashboard/company",
                  label: "Company",
                  icon: "building" as const,
                  match: (p: string) => p.startsWith("/dashboard/company"),
                },
                {
                  href: "/dashboard/plugins",
                  label: "Plugins",
                  icon: "plugin" as const,
                  match: (p: string) => p.startsWith("/dashboard/plugins"),
                },
                {
                  href: "/dashboard/account",
                  label: "Account settings",
                  icon: "user" as const,
                  match: (p: string) => p.startsWith("/dashboard/account"),
                },
              ] as const
            ).map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-brand-50 text-brand-800"
                      : "text-ink-muted hover:bg-surface hover:text-brand-700",
                  )}
                >
                  <Icon
                    name={item.icon}
                    size={18}
                    className={active ? "text-brand-600" : "text-ink-faint"}
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex-1 overflow-y-auto px-3">
            {chats.length > 0 ? (
              <div>
                <p className="px-1 pb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                  Chats
                </p>
                <ul className="space-y-0.5">
                  {[...chats]
                    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                    .map((chat) => {
                      const active = chat.id === activeChatId;
                      return (
                        <li key={chat.id}>
                          <div
                            className={cn(
                              "group flex items-center rounded-lg transition-colors",
                              active ? "bg-brand-50" : "hover:bg-surface",
                            )}
                          >
                            <button
                              type="button"
                              aria-current={active ? "true" : undefined}
                              onClick={() => openChat(chat.id)}
                              className={cn(
                                "flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors",
                                active
                                  ? "font-medium text-brand-800"
                                  : "text-ink-muted hover:text-brand-700",
                              )}
                            >
                              <span className="min-w-0">
                                <span className="block truncate">{chat.title}</span>
                                <span className="block truncate text-[0.6875rem] text-ink-faint">
                                  {formatRelativeTime(chat.updatedAt)}
                                </span>
                              </span>
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete chat: ${chat.title}`}
                              onClick={() => deleteChatEntry(chat.id)}
                              className="mr-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-faint transition-colors opacity-0 hover:bg-surface hover:text-danger-600 focus-visible:opacity-100 group-hover:opacity-100"
                            >
                              <Icon name="close" size={14} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ) : (
              <p className="px-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                Recent
              </p>
            )}
          </div>

          {user ? (
            <div className="mt-auto p-3 md:hidden">
              <div className="rounded-xl bg-brand-50 p-3 ring-1 ring-brand-200/60">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
                    <Icon name="crown" size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      StratVeda Premium
                    </p>
                    <p className="text-xs text-ink-muted">
                      More reports, faster insights
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPremiumOpen((open) => !open)}
                  aria-expanded={premiumOpen}
                  className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 active:bg-brand-800"
                >
                  Upgrade to Premium
                </button>
                {premiumOpen ? (
                  <p
                    role="status"
                    className="mt-2.5 text-xs leading-relaxed text-ink-muted"
                  >
                    Premium billing is coming soon. Your free workspace stays
                    active until then.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">

        {user && companyReady && onboardingOpen ? (
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
                        {/* ChatGPT-style icon action buttons */}
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

        </main>
      </div>

      <div className="flex border-t border-line">
        <div className="flex w-64 shrink-0 flex-col justify-end border-r border-line bg-surface-muted max-md:hidden">
          {user ? (
            <div className="p-3">
              <div className="rounded-xl bg-brand-50 p-3 ring-1 ring-brand-200/60">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
                    <Icon name="crown" size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      StratVeda Premium
                    </p>
                    <p className="text-xs text-ink-muted">
                      More reports, faster insights
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPremiumOpen((open) => !open)}
                  aria-expanded={premiumOpen}
                  className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 active:bg-brand-800"
                >
                  Upgrade to Premium
                </button>
                {premiumOpen ? (
                  <p
                    role="status"
                    className="mt-2.5 text-xs leading-relaxed text-ink-muted"
                  >
                    Premium billing is coming soon. Your free workspace stays
                    active until then.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {!onboardingOpen ? (
        <div className="flex min-w-0 flex-1 flex-col bg-surface px-4 py-3 md:px-6">
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
        ) : (
        <div id="onboarding-input-slot" className="flex min-w-0 flex-1 flex-col bg-surface px-4 py-3 md:px-6" />
        )}
      </div>

      <DashboardFooter />
    </div>
  );
}