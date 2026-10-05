"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";

import { getCsrfToken } from "@/lib/api/csrf-client";
import {
  CHAT_THREADS_CHANGED,
  getOpenThread,
  getOpenThreadOnServer,
  startNewChat,
  subscribeToOpenThread,
  type ChatThreadEntry,
} from "@/lib/chat-events";
import { company } from "@/lib/content";
import { cn } from "@/lib/utils";

const { history: historyCopy } = company.chat;

export type ChatHistoryNavProps = {
  /** Conversations the server had already saved when this paint started. */
  initialThreads: ChatThreadEntry[];
  /** Called after a navigation so the mobile drawer can close itself. */
  onNavigate?: () => void;
};

/**
 * "Recent chats" inside the workspace sidebar, below the nav items.
 *
 * Each row links to `/chat?thread=…`, so opening a conversation is a normal
 * navigation: the page re-reads that thread and hands the transcript to a fresh
 * chat view. Starting one is the Chat entry above — there is deliberately no second
 * new-chat control, and it clears the address bar rather than linking to a second
 * route.
 *
 * The rows arrive from the server and stay current through `/api/chat/threads`
 * re-reads triggered by `CHAT_THREADS_CHANGED`, which the chat view announces when
 * a reply creates or extends a conversation. Re-fetching rather than re-rendering
 * the page is the point: a server re-render would remount the transcript mid-stream
 * and drop the tokens arriving on screen.
 */
export function ChatHistoryNav({ initialThreads, onNavigate }: ChatHistoryNavProps) {
  const [threads, setThreads] = useState<ChatThreadEntry[]>(initialThreads);
  const [loading, setLoading] = useState(false);
  const activeId = useSyncExternalStore(subscribeToOpenThread, getOpenThread, getOpenThreadOnServer);

  /** Best-effort: a list that fails to refresh is not worth interrupting a chat over. */
  const refresh = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch("/api/chat/threads", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = (await response.json()) as { threads?: ChatThreadEntry[] };
      if (Array.isArray(data.threads)) setThreads(data.threads);
    } catch {
      // Keep the rows already on screen.
    } finally {
      setLoading(false);
    }
  }, [loading]);

  useEffect(() => {
    const onThreadsChanged = () => void refresh();
    window.addEventListener(CHAT_THREADS_CHANGED, onThreadsChanged);
    return () => window.removeEventListener(CHAT_THREADS_CHANGED, onThreadsChanged);
  }, [refresh]);

  async function remove(id: string) {
    if (!window.confirm(historyCopy.deleteConfirm)) return;
    setThreads((prev) => prev.filter((thread) => thread.id !== id));
    // Deleting the conversation on screen moves the page off it, which hands over a
    // fresh chat — the same thing the Chat entry does.
    if (id === activeId) startNewChat("/chat");
    try {
      const token = await getCsrfToken();
      const response = await fetch(`/api/chat/threads?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "X-CSRF-Token": token },
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`delete failed (${response.status})`);
    } catch {
      void refresh();
    }
  }

  return (
    <div className="mt-2 border-t border-line pt-3">
      <p className="px-3 pb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-subtle">
        {historyCopy.listLabel}
      </p>

      {threads.length === 0 ? (
        <p className="px-3 py-1 text-xs leading-relaxed text-ink-subtle">{historyCopy.empty}</p>
      ) : (
        groupByRecency(threads).map((group) => (
          <div key={group.label} className="mb-1">
            <p className="px-3 pb-1 pt-1.5 text-xs font-medium text-ink-subtle">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((thread) => (
                <li key={thread.id} className="group relative">
                  <Link
                    href={`/chat?thread=${thread.id}`}
                    onClick={onNavigate}
                    aria-current={thread.id === activeId ? "true" : undefined}
                    className={cn(
                      "block truncate rounded-control py-2 pl-3 pr-8 text-[0.8125rem] leading-snug transition-colors duration-200 ease-out",
                      thread.id === activeId
                        ? "bg-bg-muted font-semibold text-ink"
                        : "text-ink-muted hover:bg-bg-muted hover:text-ink",
                    )}
                  >
                    {thread.title}
                  </Link>
                  <button
                    type="button"
                    onClick={() => void remove(thread.id)}
                    aria-label={`${historyCopy.deleteLabel}: ${thread.title}`}
                    className="absolute right-1 top-1/2 hidden size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-control text-ink-subtle transition-colors hover:bg-bg hover:text-negative group-hover:inline-flex focus-visible:inline-flex"
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

/** Buckets the list the way it reads: today, yesterday, then older. */
function groupByRecency(
  threads: ChatThreadEntry[],
): { label: string; items: ChatThreadEntry[] }[] {
  const groups: { label: string; items: ChatThreadEntry[] }[] = [];
  for (const thread of threads) {
    const label = recencyLabel(thread.updatedAt);
    const current = groups[groups.length - 1];
    if (current && current.label === label) current.items.push(thread);
    else groups.push({ label, items: [thread] });
  }
  return groups;
}

function recencyLabel(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return historyCopy.earlier;
  const days = Math.floor((startOfDay(new Date()) - startOfDay(then)) / 86_400_000);
  if (days <= 0) return historyCopy.today;
  if (days === 1) return historyCopy.yesterday;
  if (days <= 7) return historyCopy.previous7;
  return historyCopy.earlier;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
