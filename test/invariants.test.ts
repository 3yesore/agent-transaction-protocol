import { test } from "node:test";
import assert from "node:assert/strict";
import { Domain } from "../kernel/domain.ts";
import { createIntegrityVerifier } from "../kernel/evidence.ts";
import { hashJson } from "../kernel/json.ts";
import { checkInvariants } from "../kernel/invariants.ts";
import { seed } from "../experiments/harness.ts";
import {
  capabilityKey,
  capabilityValue,
  updateCapabilityEffect,
  type CapabilityValue,
} from "../extensions/capability.ts";
import { createCommitment, commitmentKey, amendmentEffects, type CommitmentValue } from "../extensions/commitment.ts";
import { createOutcome, outcomeKey, supersedeEffects, type OutcomeValue } from "../extensions/outcome.ts";
import { standardPolicies, standardPreconditions } from "../extensions/index.ts";
import type { Effect, JsonValue, Precondition, TransitionProposal } from "../kernel/types.ts";

const CAP = capabilityKey("A", "unit");

function baseDomain(id = "base") {
  return new Domain({
    id,
    policies: standardPolicies(),
    verifier: createIntegrityVerifier(),
    preconditions: standardPreconditions(),
    clock: () => 42,
    initialState: [seed(CAP, capabilityValue("unit", 100))],
  });
}

let n = 0;
function proposal(domain: string, actor: string, effects: Effect[], extra: Partial<TransitionProposal> = {}): TransitionProposal {
  return {
    id: "inv-" + ++n,
    domain,
    actor,
    intent: "test",
    policy: { id: "allow-all" },
    preconditions: [],
    effects,
    evidence: [],
    parents: [],
    createdAt: 1,
    ...extra,
  };
}

test("a commitment amendment creates a successor and marks the predecessor AMENDED", () => {
  const d = baseDomain();
  const c1 = createCommitment({ id: "C1", from: "agent-a", to: "agent-b", deliverable: "X", deadline: 100 });
  assert.equal(d.propose(proposal("base", "agent-a", [{ op: "create", key: commitmentKey("C1"), value: c1 as unknown as JsonValue }])).committed, true);

  const doc = d.document(commitmentKey("C1"))!;
  const c11 = createCommitment({ id: "C1.1", from: "agent-a", to: "agent-b", deliverable: "X2", deadline: 200, amendmentOf: "C1" });
  const amend = d.propose(proposal("base", "agent-a", amendmentEffects(doc, c11)));
  assert.equal(amend.committed, true);

  const predecessor = d.document(commitmentKey("C1"))!.value as unknown as CommitmentValue;
  const successor = d.document(commitmentKey("C1.1"))!.value as unknown as CommitmentValue;
  assert.equal(predecessor.status, "AMENDED");
  assert.equal(predecessor.supersededBy, "C1.1");
  assert.deepEqual(predecessor.history, ["C1.1"]);
  assert.equal(successor.amendmentOf, "C1");
  assert.equal(d.ledger.length, 2);
  assert.equal(checkInvariants(d).find((r) => r.id === "I5")?.status, "PASS");
});

test("a named precondition guards the prior state", () => {
  const brokenSeed: CapabilityValue = { unit: "unit", total: 100, available: 50, reserved: 0, consumed: 0 };
  const d = new Domain({
    id: "broken",
    policies: standardPolicies(),
    verifier: createIntegrityVerifier(),
    preconditions: standardPreconditions(),
    clock: () => 42,
    initialState: [seed(CAP, brokenSeed as unknown as JsonValue)],
  });
  const preconditions: Precondition[] = [{ kind: "named", id: "capability-conserved", params: { key: CAP } }];
  const r = d.propose(proposal("broken", "agent-a", [{ op: "create", key: "x", value: 1 }], { preconditions }));
  assert.equal(r.committed, false);
  assert.equal(r.failure?.kind, "PRECONDITION");
  assert.equal(d.ledger.length, 0);
});

test("a resulting-state invariant is enforced by a policy over the proposed effects", () => {
  const d = baseDomain();
  const doc = d.document(CAP)!;
  const broken: CapabilityValue = { unit: "unit", total: 100, available: 50, reserved: 0, consumed: 0 };
  const r = d.propose(
    proposal("base", "agent-a", [updateCapabilityEffect(doc, broken)], {
      policy: { id: "capability-conserved-effect" },
    }),
  );
  assert.equal(r.committed, false);
  assert.equal(r.failure?.kind, "POLICY");
  assert.equal((d.document(CAP)!.value as unknown as CapabilityValue).available, 100);
});

test("a malicious over-reservation is refused by policy before any effect applies", () => {
  const d = baseDomain();
  const doc = d.document(CAP)!;
  const over: CapabilityValue = { unit: "unit", total: 100, available: -100, reserved: 200, consumed: 0 };
  const r = d.propose(
    proposal("base", "agent-a", [updateCapabilityEffect(doc, over)], {
      policy: { id: "capability-available", params: { key: CAP, amount: 200 } },
    }),
  );
  assert.equal(r.committed, false);
  assert.equal(r.failure?.kind, "POLICY");
  assert.equal((d.document(CAP)!.value as unknown as CapabilityValue).available, 100);
});

test("a decision alone never authorizes a transition", () => {
  const d = baseDomain();
  const p = proposal("base", "agent-b", [{ op: "create", key: "outcome/O1", value: { status: "PROVEN" } }], {
    policy: { id: "actor-in", params: { actors: ["agent-a"] } },
  });
  d.publishDecision({ subject: hashJson(p), judge: "judge-1", verdict: "AFFIRM", rationale: "looks good", issuedAt: 1 });
  const r = d.propose(p);
  assert.equal(r.committed, false);
  assert.equal(r.failure?.kind, "POLICY");
  assert.equal(d.decisionsAbout(hashJson(p)).length, 1);
});

test("outcome supersession keeps the original record addressable", () => {
  const d = baseDomain();
  const o1 = createOutcome({ id: "O1", producer: "agent-a", specification: "S", status: "PROVEN" });
  d.propose(proposal("base", "agent-a", [{ op: "create", key: outcomeKey("O1"), value: o1 as unknown as JsonValue }]));
  const doc = d.document(outcomeKey("O1"))!;
  const o2 = createOutcome({ id: "O2", producer: "agent-a", specification: "S", status: "DISPROVEN", supersedes: "O1" });
  d.propose(proposal("base", "agent-a", supersedeEffects(doc, o2, null)));

  const finalO1 = d.document(outcomeKey("O1"))!.value as unknown as OutcomeValue;
  assert.equal(finalO1.status, "SUPERSEDED");
  assert.equal(finalO1.supersededBy, "O2");
  assert.equal((d.ledger[0].proposal.effects[0].value as unknown as OutcomeValue).status, "PROVEN");
  assert.equal(d.verify().ok, true);
});

test("evidence is portable between domains because it is content addressed", () => {
  const a = baseDomain("dom-a");
  const b = baseDomain("dom-b");
  const input = { kind: "trace", producer: "agent-a", domain: "shared", payload: { ok: true } as JsonValue, issuedAt: 7 };
  const ea = a.publishEvidence(input);
  const eb = b.publishEvidence(input);
  assert.equal(ea.id, eb.id, "identical content yields one address in both domains");
  const other = b.publishEvidence({ ...input, domain: "dom-b" });
  assert.notEqual(other.id, ea.id, "a different domain field is different content");
});
