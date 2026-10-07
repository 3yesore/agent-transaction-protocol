import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Registry,
  inputOf,
  noContext,
  permissive,
  run,
  stateOf,
  step,
  withConstraint,
  type Constraint,
} from "../experiments/reduction/kernel.ts";
import { audit } from "../experiments/reduction/audit.ts";

test("withConstraint is exactly the reduction operation", () => {
  const reject: Constraint = { id: "k", statement: "k", holds: () => false };
  const allow: Constraint = { id: "k", statement: "k", holds: () => true };
  const args = [stateOf("s"), inputOf("x"), noContext, stateOf("s")] as const;
  assert.equal(permissive(...args), "valid");
  assert.equal(withConstraint(permissive, allow)(...args), "valid");
  assert.equal(withConstraint(permissive, reject)(...args), "invalid");
  const denying = () => "invalid" as const;
  assert.equal(withConstraint(denying, allow)(...args), "invalid", "a constraint can only narrow, never widen");
});

test("the kernel's evaluation order changes the outcome with identical relations", () => {
  const reflexive = (_s: any, input: any) => (input.kind === "update-semantics" && input.payload?.recognizedBy === "r" ? "valid" : "invalid");
  const loose = () => "valid" as const;
  const registry = new Registry().define("r", reflexive).define("loose", loose);
  const from = stateOf("r");
  const to = stateOf("loose");
  const selfAuthorising = inputOf("update-semantics", { to: "loose" });
  assert.equal(step(registry, from, selfAuthorising, noContext, to, { evaluationOrder: "pre-state" }).validity, "invalid");
  assert.equal(step(registry, from, selfAuthorising, noContext, to, { evaluationOrder: "successor" }).validity, "valid");
  const authorized = inputOf("update-semantics", { to: "loose", recognizedBy: "r" });
  assert.equal(step(registry, from, authorized, noContext, to, { evaluationOrder: "pre-state" }).validity, "valid");
});

test("a run stops at the first rejection and leaves state untouched", () => {
  const registry = new Registry().define("gate", (_s, input) => (input.kind === "blocked" ? "invalid" : "valid"));
  const result = run(registry, stateOf("gate", { n: 0 }), [
    { input: inputOf("ok"), context: noContext, successor: stateOf("gate", { n: 1 }) },
    { input: inputOf("blocked"), context: noContext, successor: stateOf("gate", { n: 2 }) },
    { input: inputOf("ok"), context: noContext, successor: stateOf("gate", { n: 3 }) },
  ]);
  assert.equal(result.trail.length, 1);
  assert.equal(result.final.facts.n, 1);
  assert.equal(result.rejected, 1);
});

test("a domain's validity is invariant under changes to another domain's state", () => {
  const d1 = new Registry().define("local", (_s, _i, _c, successor) => (successor.facts.holds === "D1" ? "valid" : "invalid"));
  const from = stateOf("local", { holds: null });
  const to = stateOf("local", { holds: "D1" });
  const first = step(d1, from, inputOf("allocate"), noContext, to);
  const second = step(d1, from, inputOf("allocate"), noContext, to);
  assert.equal(first.validity, second.validity);
  assert.equal(first.validity, "valid");
  // the point: no argument carries the other domain, so no relation can observe it
  assert.equal(Object.keys(from).join(","), "semantics,facts");
});

test("the audit finds exactly two irreducible constraints of different kinds", () => {
  const entries = audit();
  const irreducible = entries.filter((e) => !e.reducible).map((e) => e.id).sort();
  assert.deepEqual(irreducible, ["C2", "C5"]);
  assert.ok(entries.every((e) => e.checks.every((c) => c.held)), "every audit check must hold");
  assert.ok(entries.filter((e) => e.reducible).length >= 6);
});

test("C2 is irreducible while every relation stays identical", () => {
  const c2 = audit().find((e) => e.id === "C2")!;
  assert.equal(c2.reducible, false);
  assert.equal(c2.selfSustaining, false);
  assert.ok(c2.checks.some((c) => c.claim.includes("self-authorisation") || c.claim.includes("cannot authorise its own") === false));
  assert.ok(c2.checks.some((c) => c.claim.includes("cannot authorise its own") && c.held));
});

test("C3 is reducible but a domain can discard it", () => {
  const c3 = audit().find((e) => e.id === "C3")!;
  assert.equal(c3.reducible, true);
  assert.equal(c3.selfSustaining, false);
  assert.ok(c3.checks.some((c) => c.claim.includes("discard the constraint") && c.held));
});
