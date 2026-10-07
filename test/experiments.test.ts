import { test } from "node:test";
import assert from "node:assert/strict";
import { runCrossAgentAtomicity } from "../experiments/exp-001-cross-agent-atomicity.ts";
import { runMaliciousJudge } from "../experiments/exp-003-malicious-judge.ts";
import { runOverCommitment } from "../experiments/exp-004-overcommitment.ts";
import { runOutcomeReversal } from "../experiments/exp-005-outcome-reversal.ts";

const reports = [
  runCrossAgentAtomicity(),
  runMaliciousJudge(),
  runOverCommitment(),
  runOutcomeReversal(),
];

test("every experiment assertion holds", () => {
  for (const report of reports) {
    const failed = report.assertions.filter((a) => !a.held);
    assert.equal(failed.length, 0, report.id + " failed: " + failed.map((a) => a.claim).join("; "));
    assert.ok(report.assertions.length >= 4, report.id + " should assert its findings");
  }
});

test("no experiment leaves an invariant violation behind", () => {
  for (const report of reports) {
    const violations = report.invariants.filter((line) => line.includes("FAIL"));
    assert.deepEqual(violations, [], report.id + " reported invariant failures");
  }
});

test("experiment 001 concludes an extension issue with an open kernel question", () => {
  const report = runCrossAgentAtomicity();
  assert.ok(report.classification.includes("EXTENSION"));
  assert.ok(report.findings.some((f) => f.classification.includes("KERNEL")));
  assert.ok(report.assertions.some((a) => a.claim.includes("no cross-domain transaction") && a.held));
  assert.ok(report.assertions.some((a) => a.claim.includes("eventual consistency") && a.held));
});

test("experiment 003 demonstrates collusion but enforces authority", () => {
  const report = runMaliciousJudge();
  assert.ok(report.assertions.some((a) => a.claim.includes("colluding") && a.held));
  assert.ok(report.assertions.some((a) => a.claim.includes("single malicious judge") && a.held));
  assert.ok(report.assertions.some((a) => a.claim.includes("count once") && a.held));
  assert.ok(report.findings.some((f) => f.title.includes("not distinct principals")));
});

test("experiment 004 keeps over-commitment in the policy layer", () => {
  const report = runOverCommitment();
  assert.ok(report.classification.includes("EXTENSION"));
  assert.ok(report.assertions.some((a) => a.claim.includes("guarded policy prohibits over-commitment") && a.held));
  assert.ok(report.assertions.some((a) => a.claim.includes("probabilistic") && a.held));
});

test("experiment 005 reverses an outcome while preserving history", () => {
  const report = runOutcomeReversal();
  assert.ok(report.classification.includes("NONE"));
  assert.ok(report.assertions.some((a) => a.claim.includes("original PROVEN value") && a.held));
  assert.ok(report.assertions.some((a) => a.claim.includes("new transitions") && a.held));
});
