/**
 * The signals the chat workspace sends around the sidebar.
 *
 * The recent-chats list lives in the navigation column while the transcript lives
 * in the route content, and the two change at moments the router does not see: a
 * conversation is created in the middle of a stream, and the Chat entry has to mean
 * "start over" when the user is already on `/chat`. Re-running the server component
 * at those moments would remount the transcript and drop the tokens arriving on
 * screen, so these events carry the intent instead.
 *
 * Lives on its own because every component that uses it is client code and
 * `lib/data/chat.ts` pulls in the database driver.
 */
export const CHAT_THREADS_CHANGED = "revops:chat-threads-changed";
export const CHAT_NEW_CHAT = "revops:chat-new-chat";

/** One row of the recent list. Deliberately no transcript. */
export type ChatThreadEntry = {
  id: string;
  title: string;
  updatedAt: string;
};

/** Tells the sidebar to re-read the rows, and to look at the address bar again. */
export function announceThreadChange(): void {
  window.dispatchEvent(new Event(CHAT_THREADS_CHANGED));
}

/**
 * Starts a new conversation from the Chat entry while the chat is already on
 * screen. The address bar is cleared first so the listeners that run below see the
 * conversation they are meant to report as open, rather than the one being dropped.
 */
export function startNewChat(path: string): void {
  if (window.location.pathname + window.location.search !== path) {
    window.history.replaceState(null, "", path);
  }
  window.dispatchEvent(new Event(CHAT_NEW_CHAT));
}

/**
 * The conversation the address bar points at, read as an external store so the
 * highlight follows `replaceState` — which the router never learns about.
 *
 * `null` on the server: the address bar is a browser thing, and a fixed value there
 * keeps the first client render in step with the HTML it replaces.
 */
export function subscribeToOpenThread(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(CHAT_THREADS_CHANGED, onChange);
  window.addEventListener(CHAT_NEW_CHAT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(CHAT_THREADS_CHANGED, onChange);
    window.removeEventListener(CHAT_NEW_CHAT, onChange);
  };
}

export function getOpenThread(): string | null {
  return new URLSearchParams(window.location.search).get("thread");
}

export function getOpenThreadOnServer(): string | null {
  return null;
}
