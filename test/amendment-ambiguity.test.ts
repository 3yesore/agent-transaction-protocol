import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLAUSES,
  CONTEXT,
  CORPUS,
  MINIMAL_SPEC,
  TOTAL_SPEC,
  ambiguityBudget,
  classesCoveredBy,
  decide,
} from "../experiments/amendment-ambiguity/spec.ts";

test("a minimal specification leaves almost the whole corpus undecided", () => {
  const budget = ambiguityBudget(MINIMAL_SPEC, CORPUS, CONTEXT);
  assert.equal(budget.undetermined, CORPUS.length - 1, "only the conforming amendment should be decided");
  assert.ok(budget.d > 0.8, "d = " + budget.d);
});

test("a total specification decides every amendment without rejecting everything", () => {
  const budget = ambiguityBudget(TOTAL_SPEC, CORPUS, CONTEXT);
  assert.equal(budget.undetermined, 0);
  assert.equal(budget.d, 0);
  assert.equal(budget.valid, 1, "the conforming amendment must survive");
  assert.equal(budget.invalid, CORPUS.length - 1);
});

test("the kernel's one rule is an ambiguity class until it is stated", () => {
  const selfAuthorization = CORPUS.find((item) => item.id === "self-authorization")!;
  const before = decide(MINIMAL_SPEC, selfAuthorization, CONTEXT);
  assert.equal(before.verdict, "undetermined");
  assert.ok(before.unresolved.includes("require-pre-state-authorization"));

  const after = decide(TOTAL_SPEC, selfAuthorization, CONTEXT);
  assert.equal(after.verdict, "invalid");
});

test("absence, wrongness and self-reference share a single clause", () => {
  const covered = classesCoveredBy("require-pre-state-authorization");
  assert.equal(covered.length, 3, covered.join(", "));
});

test("each encoding variant is its own ambiguity class", () => {
  const encodingClasses = CORPUS.filter((item) => item.className.startsWith("non-canonical"));
  assert.equal(encodingClasses.length, 3);
  assert.equal(new Set(encodingClasses.map((item) => item.className)).size, 3, "the variants must be distinct classes");
  for (const item of encodingClasses) {
    assert.equal(decide(MINIMAL_SPEC, item, CONTEXT).verdict, "undetermined", item.id);
    assert.equal(decide(TOTAL_SPEC, item, CONTEXT).verdict, "invalid", item.id);
  }
});

test("every clause is load-bearing: removing it raises the ambiguity budget", () => {
  const baseline = ambiguityBudget(TOTAL_SPEC, CORPUS, CONTEXT).d;
  assert.equal(baseline, 0);
  for (const clause of CLAUSES) {
    const reduced = TOTAL_SPEC.filter((id) => id !== clause.id);
    const budget = ambiguityBudget(reduced, CORPUS, CONTEXT);
    assert.ok(budget.d > 0, "clause " + clause.id + " closes nothing and is over-specification");
    assert.ok(classesCoveredBy(clause.id).length > 0, "clause " + clause.id + " must own at least one class");
  }
});

test("a structurally broken amendment is invalid under any specification", () => {
  const broken = { id: "x", className: "structural", note: "", amendment: { kind: "not-an-amendment" }, raw: "{}" };
  assert.equal(decide(MINIMAL_SPEC, broken, CONTEXT).verdict, "invalid");
  assert.equal(decide(TOTAL_SPEC, broken, CONTEXT).verdict, "invalid");
});

test("the budget is monotone as clauses are added", () => {
  let previous = Infinity;
  let spec: string[] = [];
  for (const clause of CLAUSES) {
    spec = [...spec, clause.id];
    const budget = ambiguityBudget(spec, CORPUS, CONTEXT);
    assert.ok(budget.d < previous, "adding " + clause.id + " must strictly reduce d");
    previous = budget.d;
  }
  assert.equal(previous, 0);
});
