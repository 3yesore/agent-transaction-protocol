import { test } from "node:test";
import assert from "node:assert/strict";
import { policyDocument } from "../kernel/policy.ts";
import { checkInvariants } from "../kernel/invariants.ts";
import type { JsonValue } from "../kernel/types.ts";
import { allowPolicy, clock, makeDomain, proposal } from "../experiments/v0.2-review/common.ts";

function evolveDomain() {
  const t = clock();
  const v1 = policyDocument({ id: "transfer", rules: [{ type: "actor-in", params: { actors: ["agent-a"] } }] });
  const d = makeDomain({ id: "evolve", clock: t.now, policies: [v1, allowPolicy()] });
  return { d, v1 };
}

const i10 = (d: ReturnType<typeof evolveDomain>["d"]) => checkInvariants(d).find((r) => r.id === "I10");

test("I10 passes on a domain whose policies originate in genesis", () => {
  const { d } = evolveDomain();
  const report = i10(d);
  assert.equal(report?.status, "PASS");
  assert.ok(report!.detail.includes("genesis"));
});

test("a policy may amend itself under a version pin, advancing its state version", () => {
  const { d } = evolveDomain();
  const v2 = policyDocument({ id: "transfer", rules: [{ type: "evidence-required", params: { kind: "approval", min: 1 } }] });
  const r = d.propose(
    proposal({ domain: "evolve", actor: "agent-a", intent: "self-amend", policy: "transfer", expectedPolicyVersion: 1, effects: [{ op: "update", key: "policy/transfer", value: v2 as unknown as JsonValue, expectVersion: 1 }] }),
  );
  assert.equal(r.committed, true);
  assert.equal(d.policyDocument("transfer")?.version, 2);
  assert.equal(i10(d)?.status, "PASS");
});

test("a policy cannot be amended by an unrelated policy", () => {
  const { d, v1 } = evolveDomain();
  const r = d.propose(
    proposal({ domain: "evolve", actor: "agent-a", intent: "amendment", policy: "allow", effects: [{ op: "update", key: "policy/transfer", value: v1 as unknown as JsonValue, expectVersion: 1 }] }),
  );
  assert.equal(r.committed, false);
  assert.equal(r.failure?.kind, "POLICY_AMENDMENT");
  assert.equal(d.policyDocument("transfer")?.version, 1);
});

test("a policy cannot be fabricated outside genesis", () => {
  const { d } = evolveDomain();
  const r = d.propose(
    proposal({ domain: "evolve", actor: "agent-a", intent: "backdoor", policy: "allow", effects: [{ op: "create", key: "policy/backdoor", value: policyDocument({ id: "backdoor", rules: [{ type: "allow-all" }] }) as unknown as JsonValue }] }),
  );
  assert.equal(r.committed, false);
  assert.equal(r.failure?.kind, "POLICY_AMENDMENT");
  assert.equal(d.policyDocument("backdoor"), undefined);
});

test("policy/authority is the explicit bootstrap path for a new policy", () => {
  const t = clock();
  const d = makeDomain({
    id: "evolve",
    clock: t.now,
    policies: [policyDocument({ id: "authority", rules: [{ type: "allow-all" }] }), allowPolicy()],
  });
  const r = d.propose(
    proposal({ domain: "evolve", actor: "agent-a", intent: "seed a new policy", policy: "authority", effects: [{ op: "create", key: "policy/new", value: policyDocument({ id: "new", rules: [{ type: "allow-all" }] }) as unknown as JsonValue }] }),
  );
  assert.equal(r.committed, true);
  assert.equal(d.policyDocument("new")?.version, 1);
  assert.equal(i10(d)?.status, "PASS");
});

test("I10 fails when the recorded policy version does not match the pre-state version", () => {
  const { d } = evolveDomain();
  const v2 = policyDocument({ id: "transfer", rules: [{ type: "allow-all" }] });
  d.propose(
    proposal({ domain: "evolve", actor: "agent-a", intent: "self-amend", policy: "transfer", expectedPolicyVersion: 1, effects: [{ op: "update", key: "policy/transfer", value: v2 as unknown as JsonValue, expectVersion: 1 }] }),
  );
  // forges the recorded policy version on the committed record
  (d.ledger[0] as { policyResult: { policyVersion: number } }).policyResult = { ...d.ledger[0].policyResult, policyVersion: 99 };
  const report = i10(d);
  assert.equal(report?.status, "FAIL");
  assert.ok(report!.detail.includes("99"), report!.detail);
});

test("all mechanically checkable invariants hold on an ordinary domain", () => {
  const t = clock();
  const d = makeDomain({ id: "plain", clock: t.now, policies: [allowPolicy()] });
  d.propose(proposal({ domain: "plain", actor: "agent-a", intent: "create", policy: "allow", effects: [{ op: "create", key: "r/1", value: { ok: true } }] }));
  const failures = checkInvariants(d).filter((r) => r.status === "FAIL");
  assert.deepEqual(failures, []);
});
