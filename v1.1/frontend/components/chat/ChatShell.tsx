"use client";

import { useCallback, useEffect, useState } from "react";

import type { ChatMessageData } from "@/components/chat/ChatMessage";
import { ChatView } from "@/components/chat/ChatView";
import { CHAT_NEW_CHAT, announceThreadChange } from "@/lib/chat-events";

type ChatShellProps = {
  /** Conversation opened on this page load, or null when it is a fresh chat. */
  threadId: string | null;
  messages: ChatMessageData[];
};

type Shown = {
  /** Bumped whenever a different transcript takes the screen. */
  key: number;
  threadId: string | null;
  messages: ChatMessageData[];
  /** The page's own array this view was built from, so a new render is visible. */
  from: ChatMessageData[];
};

/**
 * Chat view wired to the sidebar's recent-chats list.
 *
 * The list lives in `ChatHistoryNav`, one level up in the workspace sidebar, so this
 * only has to keep the two in step. A reply reports the conversation it was saved
 * under: the first one of a chat puts that id in the address bar, which makes a
 * refresh reopen the same transcript, and every one announces the change so the list
 * re-reads itself.
 *
 * The transcript is a view that is replaced, never one that is updated: the component
 * streaming tokens owns them, and writing its messages from the outside would race the
 * stream. So it is keyed, and the key moves when the page hands over another
 * conversation or the sidebar asks for a new one.
 */
export function ChatShell({ threadId, messages }: ChatShellProps) {
  const [shown, setShown] = useState<Shown>(() => ({ key: 0, threadId, messages, from: messages }));

  /* Compared by identity, not by id: the id is absent from both sides while a new
     chat is becoming a saved one, and the screens are different. */
  if (shown.from !== messages) {
    setShown((prev) => ({ key: prev.key + 1, threadId, messages, from: messages }));
  }

  useEffect(() => {
    const reset = () =>
      setShown((prev) => ({
        key: prev.key + 1,
        threadId: null,
        messages: [],
        // Left as it was: the page has not handed over anything new, and keeping the
        // reference is what stops the comparison above from replacing this view twice.
        from: prev.from,
      }));
    window.addEventListener(CHAT_NEW_CHAT, reset);
    return () => window.removeEventListener(CHAT_NEW_CHAT, reset);
  }, []);

  const handleThread = useCallback((id: string) => {
    // Compared against the address bar rather than against props, which still describe
    // the conversation the page began as — for a chat that has just acquired an id,
    // no conversation at all.
    if (new URLSearchParams(window.location.search).get("thread") !== id) {
      window.history.replaceState(null, "", `/chat?thread=${id}`);
    }
    // Announced on every reply, not only the first: the list orders itself by last
    // activity, so a follow-up question moves its conversation back to the top.
    announceThreadChange();
  }, []);

  return (
    <div className="h-full w-full">
      <ChatView key={shown.key} initialMessages={shown.messages} threadId={shown.threadId} onThread={handleThread} />
    </div>
  );
}
