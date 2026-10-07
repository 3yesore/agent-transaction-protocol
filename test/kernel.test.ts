import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Domain,
  PolicyRegistry,
  PreconditionRegistry,
  stateHash,
  hashJson,
  createVerifier,
  createIntegrityVerifier,
  unconditionallyAllowed,
  actorIn,
  allOf,
  evidenceRequirement,
  judgmentThreshold,
  verifyChain,
  checkInvariants,
} from "../kernel/index.ts";

function makeDomain(id = "alpha") {
  const policies = new PolicyRegistry();
  policies.register("allow-all", () => unconditionallyAllowed("allow-all"));
  policies.register("actor-a", () => actorIn("actor-a", ["agent-a"]));
  policies.register("verifiable", () => evidenceRequirement("verifiable", { kinds: ["trace"], min: 1 }));
  policies.register("two-judges", () => judgmentThreshold("two-judges", { threshold: 2 }));
  let tick = 1000;
  const domain = new Domain({
    id,
    policies,
    verifier: createVerifier({ trustedProducers: ["agent-a", "agent-b", "judge-1", "judge-2", "judge-3"] }),
    clock: () => (tick += 10),
  });
  return domain;
}

let counter = 0;
function proposal(domain: string, actor: string, effects: any[], extra: any = {}) {
  return {
    id: "p" + ++counter,
    domain,
    actor,
    intent: "test transition",
    policy: { id: "allow-all" },
    preconditions: [],
    effects,
    evidence: [],
    parents: [],
    createdAt: 500,
    ...extra,
  };
}

test("a create transition commits and the ledger verifies", () => {
  const d = makeDomain();
  const r = d.propose(proposal("alpha", "agent-a", [{ op: "create", key: "cap/x", value: { total: 10 } }]));
  assert.equal(r.committed, true);
  assert.equal(r.failure, undefined);
  assert.equal(d.document("cap/x")?.version, 1);
  assert.equal(d.ledger.length, 1);
  assert.deepEqual(d.verify(), { ok: true });
});

test("a rejected policy changes nothing and is not appended to the ledger", () => {
  const d = makeDomain();
  const before = stateHash(d.state);
  const r = d.propose(
    proposal("alpha", "intruder", [{ op: "create", key: "cap/x", value: { total: 10 } }], { policy: { id: "actor-a" } }),
  );
  assert.equal(r.committed, false);
  assert.equal(r.failure?.kind, "POLICY");
  assert.equal(d.ledger.length, 0);
  assert.equal(stateHash(d.state), before);
  assert.equal(d.document("cap/x"), undefined);
  assert.equal(d.attempts.length, 1);
  assert.equal(d.attempts[0].committed, false);
});

test("version mismatch is a compare-and-swap failure, not silent overwrite", () => {
  const d = makeDomain();
  d.propose(proposal("alpha", "agent-a", [{ op: "create", key: "cap/x", value: { total: 10 } }]));
  const first = d.propose(proposal("alpha", "agent-a", [{ op: "update", key: "cap/x", value: { total: 20 }, expectVersion: 2 }]));
  assert.equal(first.committed, false);
  assert.equal(first.failure?.kind, "VERSION");
  const second = d.propose(proposal("alpha", "agent-a", [{ op: "update", key: "cap/x", value: { total: 20 }, expectVersion: 1 }]));
  assert.equal(second.committed, true);
  assert.equal(d.document("cap/x")?.version, 2);
});

test("replaying the same proposal id is rejected", () => {
  const d = makeDomain();
  const p = proposal("alpha", "agent-a", [{ op: "create", key: "cap/x", value: { total: 10 } }]);
  assert.equal(d.propose(p).committed, true);
  const replay = d.propose(p);
  assert.equal(replay.committed, false);
  assert.equal(replay.failure?.kind, "DUPLICATE");
});

test("unknown evidence references are rejected before policy runs", () => {
  const d = makeDomain();
  const r = d.propose(proposal("alpha", "agent-a", [{ op: "create", key: "cap/x", value: 1 }], { evidence: ["sha256:deadbeef"] }));
  assert.equal(r.committed, false);
  assert.equal(r.failure?.kind, "EVIDENCE");
});

test("evidence is content addressed and tamper is detected", () => {
  const d = makeDomain();
  const e = d.publishEvidence({ kind: "trace", producer: "agent-a", domain: "alpha", payload: { ok: true }, issuedAt: 1 });
  assert.equal(d.verifier.verify(e), "VALID");
  const tampered = { ...e, payload: { ok: false } };
  assert.equal(d.verifier.verify(tampered), "INVALID");
});

test("an unknown producer is UNVERIFIED, not INVALID", () => {
  const verifier = createVerifier({ trustedProducers: ["agent-a"] });
  const d = new Domain({ id: "alpha", policies: new PolicyRegistry(), verifier, clock: () => 1 });
  const e = d.publishEvidence({ kind: "trace", producer: "anon", domain: "alpha", payload: 1, issuedAt: 1 });
  assert.equal(verifier.verify(e), "UNVERIFIED");
});

test("history is preserved: update keeps the prior value addressable in the ledger", () => {
  const d = makeDomain();
  d.propose(proposal("alpha", "agent-a", [{ op: "create", key: "cap/x", value: { status: "ACTIVE" } }]));
  d.propose(proposal("alpha", "agent-a", [{ op: "update", key: "cap/x", value: { status: "SETTLED" }, expectVersion: 1 }]));
  assert.equal(d.ledger.length, 2);
  assert.deepEqual(d.ledger[0].proposal.effects[0].value, { status: "ACTIVE" });
  assert.equal(d.document("cap/x")?.value.status, "SETTLED");
  assert.equal(d.ledger[1].prev, d.ledger[0].hash);
});

test("a mutated ledger record breaks chain verification", () => {
  const d = makeDomain();
  d.propose(proposal("alpha", "agent-a", [{ op: "create", key: "cap/x", value: { total: 10 } }]));
  const records: any = [...d.ledger];
  records[0] = { ...records[0], policyResult: { ...records[0].policyResult, effect: "REJECT" } };
  const check = verifyChain(records);
  assert.equal(check.ok, false);
});

test("invariant report covers I1-I8 with the checkable ones passing", () => {
  const d = makeDomain();
  d.propose(proposal("alpha", "agent-a", [{ op: "create", key: "cap/x", value: { total: 10 } }]));
  const report = checkInvariants(d);
  assert.equal(report.length, 8);
  assert.equal(report.find((r) => r.id === "I1")?.status, "PASS");
  assert.equal(report.find((r) => r.id === "I2")?.status, "PASS");
  assert.equal(report.find((r) => r.id === "I3")?.status, "PASS");
  assert.equal(report.find((r) => r.id === "I5")?.status, "PASS");
  assert.equal(report.find((r) => r.id === "I7")?.status, "PASS");
  assert.equal(report.find((r) => r.id === "I4")?.status, "UNCHECKED");
  assert.equal(report.find((r) => r.id === "I8")?.status, "UNCHECKED");
});
