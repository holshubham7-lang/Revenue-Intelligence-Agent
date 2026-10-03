import assert from "node:assert/strict";
import test from "node:test";

import { chatMessage, threadTitleFrom } from "./chat";

/**
 * The two rules that shape what a saved conversation looks like in the recent
 * list: how a question becomes a title, and how much of a message is kept.
 */

test("a thread is titled from its first question, collapsed to one line", () => {
  assert.equal(threadTitleFrom("  Where\n  should I focus\tthis month?  "), "Where should I focus this month?");
});

test("a long question is truncated with an ellipsis, not cut mid-sentence", () => {
  const title = threadTitleFrom("q".repeat(500));
  assert.equal(title.length, 60);
  assert.ok(title.endsWith("…"));
});

test("message content is clamped so a runaway answer cannot grow the document", () => {
  const message = chatMessage("assistant", "a".repeat(40_000));
  assert.equal(message.content.length, 32_000);
  assert.equal(message.role, "assistant");
  assert.ok(!Number.isNaN(Date.parse(message.at)));
});
