/**
 * Tests for the knowledge-base write path.
 *
 * The rule under test is the product's: the KB holds system-generated text only
 * — never a user's answers, never a row from an uploaded file. That rule is
 * enforced by the *type* and by `composeText`'s projection, and these tests exist
 * so the guarantee fails loudly if someone widens either one.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { chunkText, composeText, MAX_CHUNK_CHARS } from "../data/knowledge-text.ts";
import type { ActionPlanDoc } from "../data/types.ts";

function plan(overrides: Partial<ActionPlanDoc> = {}): ActionPlanDoc {
  return {
    _id: "plan_1",
    companyId: "co_1",
    version: 1,
    status: "final",
    questions: ["How do you set prices today?", "Who are your real buyers?"],
    answers: [
      "We guess based on what the last deal was, which is a disaster.",
      "Mostly ops directors at logistics companies.",
    ],
    dataSourceIds: ["ds_1"],
    profileSummary: "The pipeline holds 62 deals across four stages.",
    diagnosis: "Deals stall in Negotiation because pricing is set ad hoc.",
    actions: [
      {
        id: "action_1",
        title: "Write down a pricing rule",
        rationale: "Pricing is currently guessed per deal, so margin varies invisibly.",
        priority: "high",
        effort: "low",
        owner: "Founder",
        dueDays: 21,
        metric: "Deals with a documented price rationale",
        expectedImpact: "Margin stops depending on who negotiated.",
      },
    ],
    projectedImpact: { summary: "Predictable margins within a quarter." },
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("composeText excludes the user's answers", () => {
  const text = composeText({ of: "action_plan", doc: plan() });

  assert.ok(text.length > 0, "something is indexed");
  assert.ok(
    !text.includes("which is a disaster"),
    "a verbatim answer must never reach the knowledge base",
  );
  assert.ok(!text.includes("ops directors"), "an answer's content must not leak");
});

test("composeText excludes the questions as written", () => {
  const text = composeText({ of: "action_plan", doc: plan() });
  assert.ok(!text.includes("How do you set prices today?"));
  assert.ok(!text.includes("Who are your real buyers?"));
});

test("composeText includes the model's own synthesis", () => {
  const text = composeText({ of: "action_plan", doc: plan() });

  assert.ok(text.includes("Deals stall in Negotiation"), "diagnosis is system text");
  assert.ok(text.includes("Write down a pricing rule"), "action titles are system text");
  assert.ok(text.includes("Deals with a documented price rationale"), "metrics are system text");
  assert.ok(text.includes("Predictable margins within a quarter."), "projected impact is system text");
});

test("composeText stays useful when the profile and impact are absent", () => {
  const text = composeText({
    of: "action_plan",
    doc: plan({ profileSummary: undefined, projectedImpact: { summary: "" } }),
  });
  assert.ok(text.includes("Deals stall in Negotiation"));
});

test("composeText handles an action with empty optional fields", () => {
  const text = composeText({
    of: "action_plan",
    doc: plan({
      actions: [
        {
          id: "action_1",
          title: "Do the thing",
          rationale: "",
          priority: "medium",
          effort: "high",
          owner: "Founder",
          dueDays: 30,
          metric: "",
          expectedImpact: "",
        },
      ],
    }),
  });

  assert.ok(text.includes("Do the thing"));
  assert.ok(!text.includes("Success metric:"), "an empty metric must not render as a dangling label");
  assert.ok(!text.includes("undefined"), "no blank fields become 'undefined'");
});

test("chunking keeps paragraphs intact and splits over-long ones", () => {
  const long = "A".repeat(4000);
  const next = "The second paragraph is long enough to clear the minimum chunk size.";
  const chunks = chunkText(`${long}\n\n${next}`);

  assert.ok(chunks.length >= 3, "the over-long paragraph is split, and the next one survives");
  assert.ok(
    chunks.every((c) => c.length <= MAX_CHUNK_CHARS),
    "no chunk exceeds the embedding limit",
  );
  assert.ok(
    chunks.some((c) => c.includes("second paragraph")),
    "content after a split is not lost",
  );
});

test("chunking preserves short paragraphs that are packed with a long one", () => {
  // A short fragment is dropped on its own, but must not be dropped when it is
  // part of a chunk that clears the minimum — otherwise packing loses content.
  const text = `${"Long opening line that comfortably clears the minimum chunk size. ".repeat(3)}\n\nok`;
  const chunks = chunkText(text);
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0].endsWith("ok"), "the trailing fragment is packed, not discarded");
});

test("chunking drops fragments too short to be a memory", () => {
  assert.deepEqual(chunkText("ok\n\nyes"), [], "noise is not stored as context");
});

test("a plan can be indexed without any answers at all", () => {
  const text = composeText({ of: "action_plan", doc: plan({ answers: [], questions: [] }) });
  assert.ok(text.includes("Deals stall in Negotiation"));
});
