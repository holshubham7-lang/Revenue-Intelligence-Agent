import { chatThreads, ensureDataIndexes, getDataDb, newId } from "./store";
import type { ChatMessageDoc, ChatThreadDoc } from "./types";

/**
 * Saved assistant conversations — the "recent chats" list.
 *
 * Like `lib/data/pipeline.ts`, every function takes `companyId` first and every
 * filter includes it. That is the tenant boundary: one company reading another's
 * transcript is the failure this module exists to make impossible, so the
 * company id is never a parameter a caller can omit or a client can choose.
 */

const now = () => new Date().toISOString();

/** Turns kept in a thread; older ones fall off the front. */
export const MAX_THREAD_MESSAGES = 400;
/** Characters of the first question kept as the list entry. */
export const MAX_TITLE_LENGTH = 60;
/** Turns carried over when the client opens a thread it already had on screen. */
export const MAX_SEED_MESSAGES = 40;
/** Characters kept per message. The answer is model output, so it is capped. */
export const MAX_MESSAGE_LENGTH = 32_000;

/** What the recent list needs — the transcript itself stays on the server. */
export type ChatThreadSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};

/** One turn from user or model text, clamped to what a thread should hold. */
export function chatMessage(role: ChatMessageDoc["role"], content: string): ChatMessageDoc {
  return {
    role,
    content: content.slice(0, MAX_MESSAGE_LENGTH),
    at: now(),
  };
}

/** Collapses whitespace and truncates, so a whole paragraph fits one row. */
export function threadTitleFrom(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= MAX_TITLE_LENGTH) return flat;
  return `${flat.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
}

/** This company's conversations, newest activity first. */
export async function listChatThreads(
  companyId: string,
  limit = 30,
): Promise<ChatThreadSummary[]> {
  await ensureDataIndexes();
  const db = await getDataDb();

  const rows = await chatThreads(db)
    .aggregate<{ _id: string; title: string; updatedAt: string; messageCount: number }>([
      { $match: { companyId } },
      { $sort: { updatedAt: -1 } },
      { $limit: limit },
      { $project: { title: 1, updatedAt: 1, messageCount: { $size: "$messages" } } },
    ])
    .toArray();

  return rows.map((row) => ({
    id: row._id,
    title: row.title,
    updatedAt: row.updatedAt,
    messageCount: row.messageCount,
  }));
}

/** A whole conversation, or null when it does not exist or belongs elsewhere. */
export async function readChatThread(
  companyId: string,
  threadId: string,
): Promise<ChatThreadDoc | null> {
  const db = await getDataDb();
  return chatThreads(db).findOne({ _id: threadId, companyId });
}

/**
 * Opens a conversation with the turns already on screen.
 *
 * The first message a user sends may continue the onboarding Q&A that was
 * rendered from `companies.assessment`, so the caller passes those turns in and
 * they become part of the thread. That keeps a refresh from showing a shorter
 * transcript than the one just seen, and it means the seed is the client's own
 * displayed history rather than a server-side guess about which company record
 * to re-read.
 */
export async function startChatThread(params: {
  companyId: string;
  title: string;
  messages: ChatMessageDoc[];
}): Promise<ChatThreadDoc> {
  await ensureDataIndexes();
  const db = await getDataDb();
  const timestamp = now();

  const doc: ChatThreadDoc = {
    _id: newId(),
    companyId: params.companyId,
    title: params.title,
    messages: params.messages.slice(-MAX_THREAD_MESSAGES),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await chatThreads(db).insertOne(doc);
  return doc;
}

/** Appends turns and bumps `updatedAt`, which is what orders the recent list. */
export async function appendChatMessages(
  companyId: string,
  threadId: string,
  messages: ChatMessageDoc[],
): Promise<void> {
  if (messages.length === 0) return;
  const db = await getDataDb();
  await chatThreads(db).updateOne(
    { _id: threadId, companyId },
    {
      $set: { updatedAt: now() },
      $push: { messages: { $each: messages, $slice: -MAX_THREAD_MESSAGES } },
    },
  );
}

/** Permanently removes one conversation. Returns false if it was never there. */
export async function deleteChatThread(
  companyId: string,
  threadId: string,
): Promise<boolean> {
  const db = await getDataDb();
  const result = await chatThreads(db).deleteOne({ _id: threadId, companyId });
  return result.deletedCount > 0;
}
