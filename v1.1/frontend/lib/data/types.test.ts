/**
 * Tests for the onboarding stage machine.
 *
 * The routes walk this transition table edge by edge — the skip endpoint takes
 * `awaiting_data → questions`, and the plan endpoint tries every `→ questions`
 * edge before `questions → plan_ready`. That hand-walking is only safe while
 * each edge is legal, which is what these tests pin.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canTransition,
  ONBOARDING_TRANSITIONS,
  type OnboardingStage,
} from "./types.ts";

const ALL_STAGES = Object.keys(ONBOARDING_TRANSITIONS) as OnboardingStage[];

test("the forward chain from a saved company to chat unlock is legal", () => {
  const chain: readonly OnboardingStage[] = [
    "company_saved",
    "awaiting_data",
    "analyzing",
    "questions",
    "plan_ready",
  ];

  for (let i = 0; i < chain.length - 1; i += 1) {
    assert.equal(
      canTransition(chain[i], chain[i + 1]),
      true,
      `${chain[i]} → ${chain[i + 1]} must be allowed, or onboarding dead-ends`,
    );
  }
});

test("skipping the upload is a modelled edge, not an accident", () => {
  // The skip endpoint depends on these. If they are removed from the table the
  // endpoint silently no-ops and companies stay stranded in `company_saved`.
  assert.equal(canTransition("awaiting_data", "questions"), true, "the documented skip edge");
  assert.equal(canTransition("company_saved", "questions"), true, "reaching questions without an upload");
});

test("every edge named in the table is itself a key in the table", () => {
  for (const from of ALL_STAGES) {
    for (const to of ONBOARDING_TRANSITIONS[from]) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(ONBOARDING_TRANSITIONS, to),
        `${from} → ${to} names a stage that does not exist`,
      );
    }
  }
});

test("plan_ready is terminal", () => {
  assert.deepEqual(ONBOARDING_TRANSITIONS.plan_ready, []);
  for (const stage of ALL_STAGES) {
    assert.equal(canTransition("plan_ready", stage), false, `plan_ready must not move to ${stage}`);
  }
});

test("only `questions` may transition to itself", () => {
  // The one self-edge is deliberate: it lets a user restart the interview without
  // the guarded update reporting a client bug. Everywhere else a self-edge would
  // make `advanceOnboardingStage` report success without changing anything, which
  // reads as progress in a job list.
  for (const stage of ALL_STAGES) {
    const selfEdge = ONBOARDING_TRANSITIONS[stage].includes(stage);
    assert.equal(
      selfEdge,
      stage === "questions",
      `${stage} → ${stage} should ${stage === "questions" ? "" : "not "}be allowed`,
    );
  }
});

test("a stage never jumps past plan_ready", () => {
  // `plan_ready` is terminal, so nothing may enter it except `questions`.
  const sources = ALL_STAGES.filter((from) => ONBOARDING_TRANSITIONS[from].includes("plan_ready"));
  assert.deepEqual(sources, ["questions"], "only the questions step may unlock chat");
});

test("every non-terminal stage can reach plan_ready", () => {
  // The property the hand-walking in the routes depends on: no stage is a dead
  // end. Breadth-first over the table, so the test fails if the graph changes
  // shape rather than restating the current paths.
  const reachable = new Set<OnboardingStage>(["plan_ready"]);
  const queue: OnboardingStage[] = ["plan_ready"];

  while (queue.length > 0) {
    const stage = queue.shift() as OnboardingStage;
    for (const from of ALL_STAGES) {
      if (ONBOARDING_TRANSITIONS[from].includes(stage) && !reachable.has(from)) {
        reachable.add(from);
        queue.push(from);
      }
    }
  }

  for (const stage of ALL_STAGES) {
    if (stage === "plan_ready") continue;
    assert.ok(reachable.has(stage), `${stage} can never reach plan_ready`);
  }
});
