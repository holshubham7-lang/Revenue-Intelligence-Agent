"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CompanySetupModal } from "@/components/dashboard/CompanySetupModal";
import { DashboardFooter } from "@/components/dashboard/DashboardFooter";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { Icon } from "@/components/ui/Icon";
import { API_URL, APP_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  deleteChat,
  formatRelativeTime,
  loadChatHistory,
  saveChatHistory,
  type ChatSession,
} from "@/lib/chat-history";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  companyId?: string;
  hasCompany?: boolean;
};

type AuthState = "loading" | "authenticated" | "unauthenticated";

type DashboardContextValue = {
  user: SessionUser | null;
  companyReady: boolean;
  onboardingOpen: boolean;
  setOnboardingOpen: (open: boolean) => void;
  handleLogout: () => Promise<void>;
  completeCompanySetup: () => Promise<void>;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  premiumOpen: boolean;
  setPremiumOpen: (open: boolean) => void;
  chats: ChatSession[];
  setChats: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  activeChatId: string | null;
  setActiveChatId: React.Dispatch<React.SetStateAction<string | null>>;
  openChat: (chatId: string) => void;
  deleteChatEntry: (chatId: string) => void;
  startNewChat: () => void;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard(): DashboardContextValue {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used within <DashboardLayout>");
  }
  return context;
}

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [history] = useState<ReturnType<typeof loadChatHistory>>(() =>
    loadChatHistory(),
  );
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [companyReady, setCompanyReady] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);
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

  const checkOnboarding = useCallback(async () => {
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
  }, []);

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
  }, [router, checkOnboarding]);

  const completeCompanySetup = useCallback(async () => {
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
  }, [checkOnboarding]);

  const handleLogout = useCallback(async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // proceed to redirect regardless
    } finally {
      window.location.assign(APP_URL);
    }
  }, []);

  function toggleSidebar() {
    setSidebarOpen((open) => !open);
  }

  function startNewChat() {
    activeChatIdRef.current = null;
    setActiveChatId(null);
    saveChatHistory({ sessions: chatsRef.current, activeId: null });
    setSidebarOpen(false);
    if (pathname !== "/dashboard") {
      router.push("/dashboard");
    }
  }

  function deleteChatEntry(chatId: string) {
    const nextChats = deleteChat(chatsRef.current, chatId);
    chatsRef.current = nextChats;
    setChats(nextChats);
    if (activeChatIdRef.current === chatId) {
      activeChatIdRef.current = null;
      setActiveChatId(null);
    }
    saveChatHistory({ sessions: nextChats, activeId: activeChatIdRef.current });
  }

  function openChat(chatId: string) {
    const session = chatsRef.current.find((s) => s.id === chatId);
    if (!session) return;
    activeChatIdRef.current = chatId;
    setActiveChatId(chatId);
    saveChatHistory({ sessions: chatsRef.current, activeId: chatId });
    setSidebarOpen(false);
    if (pathname !== "/dashboard") {
      router.push("/dashboard");
    }
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
          <button
            type="button"
            onClick={() => router.push("/sign-in")}
            className="mt-5 flex w-full cursor-pointer items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Go to sign in
          </button>
        </div>
      </main>
    );
  }

  const value: DashboardContextValue = {
    user,
    companyReady,
    onboardingOpen,
    setOnboardingOpen,
    handleLogout,
    completeCompanySetup,
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar,
    premiumOpen,
    setPremiumOpen,
    chats,
    setChats,
    activeChatId,
    setActiveChatId,
    openChat,
    deleteChatEntry,
    startNewChat,
  };

  const newChatActive = pathname === "/dashboard" && activeChatId === null;

  return (
    <div className="flex h-dvh flex-col bg-surface">
      <DashboardContext.Provider value={value}>
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
                    href: "/dashboard/connected-apps",
                    label: "Connected Apps",
                    icon: "link" as const,
                    match: (p: string) => p.startsWith("/dashboard/connected-apps"),
                  },
                  {
                    href: "/dashboard/action-plans",
                    label: "Action Plans",
                    icon: "action" as const,
                    match: (p: string) => p.startsWith("/dashboard/action-plans"),
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
              <div className="mt-auto p-3">
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

          <main className="flex min-w-0 flex-1 flex-col">{children}</main>
        </div>

        <DashboardFooter />
      </DashboardContext.Provider>
    </div>
  );
}