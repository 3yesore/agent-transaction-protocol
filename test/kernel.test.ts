import { test } from "node:test";
import assert from "node:assert/strict";
import { createVerifier } from "../kernel/evidence.ts";
import { hashJson } from "../kernel/json.ts";
import { policyDocument } from "../kernel/policy.ts";
import { checkInvariants } from "../kernel/invariants.ts";
import { verifyChain } from "../kernel/ledger.ts";
import type { JsonValue } from "../kernel/types.ts";
import { actorPolicy, allowPolicy, clock, makeDomain, proposal } from "../experiments/v0.2-review/common.ts";
import { createDecision, judgmentPolicy } from "../extensions/decision.ts";

test("a create transition commits and the ledger verifies", () => {
  const t = clock();
  const d = makeDomain({ id: "alpha", clock: t.now, policies: [allowPolicy()] });
  const r = d.propose(proposal({ domain: "alpha", actor: "agent-a", intent: "create", policy: "allow", effects: [{ op: "create", key: "cap/x", value: { total: 10 } }] }));
  assert.equal(r.committed, true);
  assert.equal(d.document("cap/x")?.version, 1);
  assert.deepEqual(d.verify(), { ok: true });
});

test("a policy loaded from state authorizes the transition", () => {
  const t = clock();
  const d = makeDomain({ id: "alpha", clock: t.now, policies: [actorPolicy("act", ["agent-a"])] });
  const ok = d.propose(proposal({ domain: "alpha", actor: "agent-a", intent: "act", policy: "act", effects: [{ op: "create", key: "a/1", value: 1 }] }));
  const no = d.propose(proposal({ domain: "alpha", actor: "intruder", intent: "act", policy: "act", effects: [{ op: "create", key: "a/2", value: 1 }] }));
  assert.equal(ok.committed, true);
  assert.equal(no.committed, false);
  assert.equal(no.failure?.kind, "POLICY");
  assert.equal(ok.policyResult?.policyVersion, 1, "the authorizing policy is reported with its state version");
});

test("an unknown policy document is rejected before anything else", () => {
  const t = clock();
  const d = makeDomain({ id: "alpha", clock: t.now, policies: [allowPolicy()] });
  const r = d.propose(proposal({ domain: "alpha", actor: "agent-a", intent: "act", policy: "ghost", effects: [{ op: "create", key: "a/1", value: 1 }] }));
  assert.equal(r.committed, false);
  assert.equal(r.failure?.kind, "POLICY_UNKNOWN");
});

test("a policy version pin is enforced", () => {
  const t = clock();
  const d = makeDomain({ id: "alpha", clock: t.now, policies: [allowPolicy()] });
  const r = d.propose(
    proposal({ domain: "alpha", actor: "agent-a", intent: "act", policy: "allow", expectedPolicyVersion: 7, effects: [{ op: "create", key: "a/1", value: 1 }] }),
  );
  assert.equal(r.committed, false);
  assert.equal(r.failure?.kind, "POLICY");
  assert.ok(r.failure!.detail.includes("version mismatch"));
});

test("an expired policy rejects transitions", () => {
  const t = clock(900, 100);
  const d = makeDomain({ id: "alpha", clock: t.now, policies: [policyDocument({ id: "windowed", validUntil: 1050, rules: [{ type: "allow-all" }] })] });
  const first = d.propose(proposal({ domain: "alpha", actor: "agent-a", intent: "act", policy: "windowed", effects: [{ op: "create", key: "a/1", value: 1 }] }));
  t.set(2000);
  const late = d.propose(proposal({ domain: "alpha", actor: "agent-a", intent: "act", policy: "windowed", effects: [{ op: "create", key: "a/2", value: 1 }] }));
  assert.equal(first.committed, true);
  assert.equal(late.committed, false);
  assert.equal(late.failure?.kind, "POLICY");
  assert.ok(late.failure!.detail.includes("expired"));
});

test("a rejected proposal changes nothing and never enters the ledger", () => {
  const t = clock();
  const d = makeDomain({ id: "alpha", clock: t.now, policies: [actorPolicy("act", ["agent-a"])] });
  const r = d.propose(proposal({ domain: "alpha", actor: "intruder", intent: "act", policy: "act", effects: [{ op: "create", key: "a/1", value: 1 }] }));
  assert.equal(r.committed, false);
  assert.equal(d.ledger.length, 0);
  assert.equal(d.document("a/1"), undefined);
  assert.equal(d.attempts.length, 1);
  assert.equal(d.attempts[0].failureKind, "POLICY");
});

test("version mismatch is compare-and-swap, not silent overwrite", () => {
  const t = clock();
  const d = makeDomain({ id: "alpha", clock: t.now, policies: [allowPolicy()] });
  d.propose(proposal({ domain: "alpha", actor: "agent-a", intent: "create", policy: "allow", effects: [{ op: "create", key: "a/1", value: { n: 1 } }] }));
  const stale = d.propose(proposal({ domain: "alpha", actor: "agent-a", intent: "update", policy: "allow", effects: [{ op: "update", key: "a/1", value: { n: 2 }, expectVersion: 9 }] }));
  assert.equal(stale.committed, false);
  assert.equal(stale.failure?.kind, "VERSION");
  const fresh = d.propose(proposal({ domain: "alpha", actor: "agent-a", intent: "update", policy: "allow", effects: [{ op: "update", key: "a/1", value: { n: 2 }, expectVersion: 1 }] }));
  assert.equal(fresh.committed, true);
  assert.equal(d.document("a/1")?.version, 2);
});

test("a proposal cannot hide evidence addressed to it", () => {
  const t = clock();
  const d = makeDomain({ id: "alpha", clock: t.now, policies: [judgmentPolicy({ id: "judge", threshold: 2, allowedJudges: ["j1", "j2", "j3"] })] });
  const p = proposal({ domain: "alpha", actor: "agent-a", intent: "act", policy: "judge", effects: [{ op: "create", key: "a/1", value: 1 }] });
  createDecision(d, { evaluator: "j1", conclusion: "DENY", subject: hashJson(p), timestamp: 1, rationale: "not satisfied" });
  createDecision(d, { evaluator: "j2", conclusion: "DENY", subject: hashJson(p), timestamp: 2, rationale: "not satisfied" });
  const r = d.propose(p);
  assert.equal(p.evidence.length, 0, "the proposer referenced nothing");
  assert.equal(r.committed, false);
  assert.ok(r.failure!.detail.includes("deny 2"), "the unfavourable judgments were still gathered: " + r.failure!.detail);
});

test("policy/authority can restrict which policies a domain accepts", () => {
  const t = clock();
  const authority = policyDocument({ id: "authority", rules: [{ type: "policy-invocable", params: { ids: ["act"] } }] });
  const d = makeDomain({ id: "alpha", clock: t.now, policies: [authority, allowPolicy(), actorPolicy("act", ["agent-a"])] });
  const restricted = d.propose(proposal({ domain: "alpha", actor: "agent-a", intent: "act", policy: "allow", effects: [{ op: "create", key: "a/1", value: 1 }] }));
  const permitted = d.propose(proposal({ domain: "alpha", actor: "agent-a", intent: "act", policy: "act", effects: [{ op: "create", key: "a/2", value: 1 }] }));
  assert.equal(restricted.committed, false);
  assert.equal(restricted.failure?.kind, "POLICY_SELECTION");
  assert.equal(permitted.committed, true);
});

test("evidence is content addressed and tampering is detectable", () => {
  const t = clock();
  const d = makeDomain({ id: "alpha", clock: t.now, policies: [allowPolicy()] });
  const e = d.publishEvidence({ kind: "trace", producer: "agent-a", domain: "alpha", payload: { ok: true } as JsonValue, issuedAt: 1 });
  const verifier = createVerifier({ trustedProducers: ["agent-a"] });
  assert.equal(verifier.verify(e), "VALID");
  assert.equal(verifier.verify({ ...e, payload: { ok: false } }), "INVALID", "content address mismatch");
  const unknown = d.publishEvidence({ kind: "trace", producer: "anon", domain: "alpha", payload: 1 as JsonValue, issuedAt: 1 });
  assert.equal(verifier.verify(unknown), "UNVERIFIED", "unknown provenance is not the same as false");
});

test("history is preserved and the chain detects tampering", () => {
  const t = clock();
  const d = makeDomain({ id: "alpha", clock: t.now, policies: [allowPolicy()] });
  d.propose(proposal({ domain: "alpha", actor: "agent-a", intent: "create", policy: "allow", effects: [{ op: "create", key: "a/1", value: { status: "ACTIVE" } }] }));
  d.propose(proposal({ domain: "alpha", actor: "agent-a", intent: "update", policy: "allow", effects: [{ op: "update", key: "a/1", value: { status: "SETTLED" }, expectVersion: 1 }] }));
  assert.equal((d.ledger[0].proposal.effects[0].value as unknown as { status: string }).status, "ACTIVE");
  assert.equal(d.ledger[1].prev, d.ledger[0].hash);
  const records: any = [...d.ledger];
  records[0] = { ...records[0], policyResult: { ...records[0].policyResult, effect: "REJECT" } };
  assert.equal(verifyChain(records).ok, false);
});

test("the invariant report covers the ten v0.2 invariants", () => {
  const t = clock();
  const d = makeDomain({ id: "alpha", clock: t.now, policies: [allowPolicy()] });
  d.propose(proposal({ domain: "alpha", actor: "agent-a", intent: "create", policy: "allow", effects: [{ op: "create", key: "a/1", value: 1 }] }));
  const report = checkInvariants(d);
  assert.equal(report.length, 10);
  for (const id of ["I1", "I3", "I4", "I6", "I8", "I10"]) {
    assert.equal(report.find((r) => r.id === id)?.status, "PASS", id + " should be mechanically checkable");
  }
  for (const id of ["I2", "I5", "I7", "I9"]) {
    assert.equal(report.find((r) => r.id === id)?.status, "UNCHECKED", id + " should be honest about being unchecked");
  }
});
