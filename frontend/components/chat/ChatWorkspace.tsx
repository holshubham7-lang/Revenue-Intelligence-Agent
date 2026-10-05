"use client";

import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";

import { ChatFilesPanel, type SharedReport } from "@/components/chat/ChatFilesPanel";
import type { ChatMessageData } from "@/components/chat/ChatMessage";
import { ChatShell } from "@/components/chat/ChatShell";
import { OnboardingChat } from "@/components/chat/OnboardingChat";
import { company } from "@/lib/content";

type ChatWorkspaceProps = {
  threadId: string | null;
  messages: ChatMessageData[];
  /** Reports already shared, so the panel and the empty state agree on first paint. */
  reports: SharedReport[];
  /** Whether the assessment interview is still worth offering. */
  showInterview: boolean;
};

/**
 * The chat transcript, the reports panel, and the interview behind one toggle.
 *
 * The panel is a column on wide screens and a drawer below `xl`. The breakpoint
 * is `xl` rather than `lg` deliberately: a column-mapping table cannot be
 * reviewed in a narrow column, so on anything short of a wide screen the panel
 * takes the full width instead of the transcript losing half of itself to it.
 *
 * Client because the three views are mutually exclusive states of one surface —
 * the interview replaces the chat, the drawer covers it — and switching between
 * them must not cost a server round trip.
 */
export function ChatWorkspace({ threadId, messages, reports, showInterview }: ChatWorkspaceProps) {
  const [count, setCount] = useState(reports.length);
  const [filesOpen, setFilesOpen] = useState(false);
  const [interview, setInterview] = useState(false);

  /* Escape closes the drawer. The panel is also closable by its own heading
     button; this is the keyboard route to the same thing. */
  useEffect(() => {
    if (!filesOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFilesOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filesOpen]);

  if (interview) {
    return <OnboardingChat onDismiss={() => setInterview(false)} />;
  }

  const openFiles = () => setFilesOpen(true);

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Below `xl` there is no panel column, so the transcript carries the
            control that opens it. */}
        <div className="flex shrink-0 items-center justify-end border-b border-line px-4 py-2 xl:hidden">
          <button
            type="button"
            onClick={openFiles}
            aria-label={company.chat.files.openLabel}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-bg-muted hover:text-ink"
          >
            <FolderOpen className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            {company.chat.files.label}
            {count > 0 ? (
              <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-xs font-semibold text-brand tabular-nums">
                {count}
              </span>
            ) : null}
          </button>
        </div>

        <div className="min-h-0 flex-1">
          <ChatShell
            threadId={threadId}
            messages={messages}
            reportCount={count}
            onOpenFiles={openFiles}
            onStartInterview={showInterview ? () => setInterview(true) : undefined}
          />
        </div>
      </div>

      {/* Panel column (xl and up). Always open: on a screen wide enough for it
          there is nothing it competes with. */}
      <aside className="hidden w-80 shrink-0 border-l border-line bg-bg-elevated/60 xl:block">
        <ChatFilesPanel initialReports={reports} onCountChange={setCount} />
      </aside>

      {/* Drawer (below xl). A dialog rather than a push-in column, so the
          transcript underneath keeps its layout and the mapping table gets the
          whole width. */}
      {filesOpen ? (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setFilesOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={company.chat.files.label}
            className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-line bg-bg shadow-xl"
          >
            <ChatFilesPanel
              initialReports={reports}
              onCountChange={setCount}
              onClose={() => setFilesOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}