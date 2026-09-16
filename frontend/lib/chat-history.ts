export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  userId?: string;
};

export type ChatHistoryState = {
  sessions: ChatSession[];
  activeId: string | null;
};

const STORAGE_KEY = "revops.chats.v1";
const TITLE_MAX = 48;

function isValidSession(item: unknown): item is ChatSession {
  if (!item || typeof item !== "object") return false;
  const session = item as ChatSession;
  return (
    typeof session.id === "string" &&
    typeof session.title === "string" &&
    Array.isArray(session.messages)
  );
}

export function loadChatHistory(): ChatHistoryState {
  if (typeof window === "undefined") {
    return { sessions: [], activeId: null };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { sessions: [], activeId: null };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { sessions: [], activeId: null };
    }
    const state = parsed as ChatHistoryState;
    const sessions = Array.isArray(state.sessions)
      ? state.sessions.filter(isValidSession)
      : [];
    const activeIds = new Set(sessions.map((s) => s.id));
    const activeId =
      typeof state.activeId === "string" && activeIds.has(state.activeId)
        ? state.activeId
        : null;
    return { sessions, activeId };
  } catch {
    return { sessions: [], activeId: null };
  }
}

export function saveChatHistory(state: ChatHistoryState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable (private mode / quota). Chats stay
    // in memory for this session only.
  }
}

export function titleFrom(content: string): string {
  const collapsed = content.replace(/\s+/g, " ").trim();
  if (!collapsed) return "New chat";
  return collapsed.length > TITLE_MAX
    ? `${collapsed.slice(0, TITLE_MAX).trimEnd()}…`
    : collapsed;
}

export function createChatSession(messages: ChatMessage[]): ChatSession {
  const now = new Date().toISOString();
  const firstUser = messages.find((m) => m.role === "user");
  return {
    id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: titleFrom(firstUser?.content ?? ""),
    createdAt: now,
    updatedAt: now,
    messages: messages.map(({ role, content }) => ({ role, content })),
  };
}

export function upsertChat(
  sessions: ChatSession[],
  sessionId: string | null,
  messages: ChatMessage[],
): ChatSession[] {
  const cleaned = messages.map(({ role, content }) => ({ role, content }));
  const now = new Date().toISOString();

  if (sessionId) {
    const index = sessions.findIndex((session) => session.id === sessionId);
    if (index === -1) {
      const created = createChatSession(cleaned);
      return [created, ...sessions];
    }
    const existing = sessions[index];
    if (JSON.stringify(existing.messages) === JSON.stringify(cleaned)) {
      return sessions;
    }
    const copy = [...sessions];
    copy[index] = { ...existing, messages: cleaned, updatedAt: now };
    return copy;
  }

  const created = createChatSession(cleaned);
  return [created, ...sessions];
}

export function deleteChat(
  sessions: ChatSession[],
  sessionId: string,
): ChatSession[] {
  return sessions.filter((session) => session.id !== sessionId);
}

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}