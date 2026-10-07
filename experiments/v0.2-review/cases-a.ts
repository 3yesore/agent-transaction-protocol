import { hashJson } from "../../kernel/json.ts";
import { policyDocument } from "../../kernel/policy.ts";
import type { JsonValue } from "../../kernel/types.ts";
import { Recorder, finalize, seed, type ReviewCase } from "../harness.ts";
import {
  capabilityKey,
  capabilityValue,
  consume,
  release,
  reserve,
  updateCapabilityEffect,
  type CapabilityValue,
} from "../../extensions/capability.ts";
import {
  createReservation,
  reservationKey,
  resolveReservation,
  updateReservationEffect,
} from "../../extensions/reservation.ts";
import { createDecision, judgmentPolicy } from "../../extensions/decision.ts";
import { createOutcome, outcomeKey, updateOutcomeEffect, type OutcomeValue } from "../../extensions/outcome.ts";
import { allowPolicy, clock, makeDomain, proposal, transferPolicy } from "./common.ts";

// ---------------------------------------------------------------------------
// 001 - Cross-Agent Atomicity (I8)
// ---------------------------------------------------------------------------
export function case001(): ReviewCase {
  const rec = new Recorder();
  const t = clock();
  const payer = rec.track(
    makeDomain({
      id: "payer",
      clock: t.now,
      policies: [transferPolicy("transfer", ["agent-a"]), judgmentPolicy({ id: "judgment", threshold: 1, allowedJudges: ["judge-1"] })],
      state: [seed(capabilityKey("A", "credit"), capabilityValue("credit", 100) as unknown as JsonValue)],
    }),
  );
  const payee = rec.track(
    makeDomain({
      id: "payee",
      clock: t.now,
      policies: [transferPolicy("transfer", ["agent-b"])],
      state: [seed(capabilityKey("B", "gpu-hour"), capabilityValue("gpu-hour", 5) as unknown as JsonValue)],
    }),
  );

  const r1 = createReservation({ id: "R1", commitment: "C1", resource: capabilityKey("A", "credit"), holder: "agent-b", owner: "agent-a", amount: 100, unit: "credit", createdAt: 1, expiresAt: 999999 });
  const capA = payer.document(capabilityKey("A", "credit"))!;
  const reserved = reserve(capA.value as unknown as CapabilityValue, 100);
  const prepare = payer.propose(
    proposal({
      domain: "payer",
      actor: "agent-a",
      intent: "prepare: hold funds for C1",
      policy: "transfer",
      effects: [
        { op: "create", key: reservationKey("R1"), value: r1 as unknown as JsonValue },
        updateCapabilityEffect(capA, reserved.ok ? reserved.value : (capA.value as unknown as CapabilityValue)),
      ],
    }),
  );
  rec.step("payer", "agent-a", "prepare: reserve 100 credit", "committed=" + prepare.committed);

  const capB = payee.document(capabilityKey("B", "gpu-hour"))!;
  const capBValue = capB.value as unknown as CapabilityValue;
  const reservedB = reserve(capBValue, 1);
  const consumed = reservedB.ok ? consume(reservedB.value, 1) : { ok: false as const, reason: "reserve failed" };
  const deliver = payee.propose(
    proposal({
      domain: "payee",
      actor: "agent-b",
      intent: "deliver service and record the outcome",
      policy: "transfer",
      effects: [
        updateCapabilityEffect(capB, consumed.ok ? consumed.value : capBValue),
        { op: "create", key: outcomeKey("O1"), value: createOutcome({ id: "O1", producer: "agent-b", specification: "S1", status: "PROVEN" }) as unknown as JsonValue },
      ],
    }),
  );
  rec.step("payee", "agent-b", "deliver service, consume capacity, record O1=PROVEN", "committed=" + deliver.committed);
  rec.step("payer", "agent-a", "CRASH between the two commit phases", "no settlement transition");

  const aBefore = payer.document(capabilityKey("A", "credit"))!.value as unknown as CapabilityValue;
  const bAfter = payee.document(capabilityKey("B", "gpu-hour"))!.value as unknown as CapabilityValue;
  rec.assert(
    "the joint state is temporarily inconsistent after the crash",
    aBefore.reserved === 100 && aBefore.consumed === 0 && bAfter.consumed === 1,
    "payer reserved=" + aBefore.reserved + " consumed=" + aBefore.consumed + "; payee consumed=" + bAfter.consumed,
  );
  rec.assert(
    "each Domain is nonetheless internally atomic and verifies",
    payer.verify().ok && payee.verify().ok,
    "both ledgers verified",
  );
  rec.assert(
    "no transition spans two Domains",
    payer.ledger.every((r) => r.domain === "payer") && payee.ledger.every((r) => r.domain === "payee"),
    "every record is confined to its own Domain",
  );

  const settle = proposal({
    domain: "payer",
    actor: "agent-a",
    intent: "settle C1 against the judge's recognition",
    policy: "judgment",
    effects: [
      updateCapabilityEffect(payer.document(capabilityKey("A", "credit"))!, consume(aBefore, 100).ok ? consume(aBefore, 100).value : aBefore),
      updateReservationEffect(payer.document(reservationKey("R1"))!, resolveReservation(r1, "COMMITTED", "settlement")),
    ],
  });
  createDecision(payer, {
    evaluator: "judge-1",
    conclusion: "AFFIRM",
    subject: hashJson(settle),
    timestamp: 2,
    rationale: "the payee recorded outcome O1 as PROVEN",
  });
  const settlement = payer.propose(settle);
  rec.step("payer", "agent-a", "recovery: settle via an addressed judgment", "committed=" + settlement.committed + " policyVersion=" + (settlement.policyResult?.policyVersion ?? "-"));
  const aAfter = payer.document(capabilityKey("A", "credit"))!.value as unknown as CapabilityValue;
  rec.assert(
    "a judgment addressed to the proposal is gathered without being referenced",
    settlement.committed === true && settle.evidence.length === 0,
    "proposal referenced 0 evidence; the judgment was found by about === proposalHash",
  );
  rec.assert(
    "eventual consistency is restored by Evidence -> Policy -> Transition",
    aAfter.consumed === 100 && aAfter.reserved === 0,
    "payer consumed=" + aAfter.consumed + " reserved=" + aAfter.reserved,
  );

  return finalize({
    id: "001",
    name: "Cross-Agent Atomicity",
    invariant: "v0.2 I8 - Atomicity Is Domain-Scoped",
    prediction: "No transition will span two Domains, each Domain will remain internally atomic, and a crash between the two commit phases will remain observable as a joint inconsistency.",
    scenario: "Two independently governed Domains exchange credit for service. The payee commits; the payer crashes before settling.",
    observed: "Each Domain verified independently while the joint state was inconsistent (payer reserved 100, payee consumed 1). No record referenced two Domains. A judgment addressed to the proposal restored consistency through an ordinary transition.",
    classification: "SUPPORTED. Cross-domain atomicity is a coordination property, exactly as I8 states.",
    rec,
  });
}

// ---------------------------------------------------------------------------
// 002 - Multi-Hop Irreversible Execution (I9)
// ---------------------------------------------------------------------------
export function case002(): ReviewCase {
  const rec = new Recorder();
  const t = clock();
  const d = rec.track(makeDomain({ id: "exec", clock: t.now, policies: [allowPolicy()] }));
  let externalEffect = 0;

  const hop1 = d.propose(
    proposal({
      domain: "exec",
      actor: "agent-a",
      intent: "authorize irreversible execution",
      policy: "allow",
      effects: [{ op: "create", key: "execution/X1", value: { status: "AUTHORIZED" } }],
    }),
  );
  rec.step("exec", "agent-a", "authorize execution X1", "committed=" + hop1.committed);
  externalEffect = 1; // the outside world acted; the protocol cannot undo it

  const trace = d.publishEvidence({ kind: "execution-trace", producer: "agent-a", domain: "exec", payload: { result: "FAILED" } as JsonValue, issuedAt: 2 });
  const hop2 = d.propose(
    proposal({
      domain: "exec",
      actor: "agent-a",
      intent: "record the failure as new state",
      policy: "allow",
      effects: [{ op: "create", key: outcomeKey("X1"), value: createOutcome({ id: "X1", producer: "agent-a", specification: "X", status: "DISPROVEN", evidenceRefs: [trace.id] }) as unknown as JsonValue }],
      evidence: [trace.id],
    }),
  );
  rec.step("exec", "agent-a", "record failure as a new outcome", "committed=" + hop2.committed);

  const x1 = d.document("execution/X1");
  rec.assert(
    "the authorization is not rolled back by the later failure",
    hop1.committed === true && hop2.committed === true && x1?.value !== undefined && (x1.value as unknown as { status: string }).status === "AUTHORIZED",
    "execution/X1 still reads AUTHORIZED",
  );
  rec.assert(
    "failure becomes Evidence and new State rather than rollback",
    d.document(outcomeKey("X1")) !== undefined && d.ledger.length === 2,
    "ledger grew to " + d.ledger.length + " transitions",
  );
  rec.assert(
    "the kernel has no operation that could undo the external execution",
    externalEffect === 1 && d.ledger.every((r) => r.proposal.effects.every((e) => e.op !== ("delete" as never))),
    "no delete effect exists; the external effect is unrecoverable by protocol means",
  );

  return finalize({
    id: "002",
    name: "Multi-Hop Irreversible Execution",
    invariant: "v0.2 I9 - Failure Does Not Imply Rollback",
    prediction: "An authorized execution that fails externally will not roll back protocol state; the failure will be recorded as Evidence and a new Outcome.",
    scenario: "Authorize an irreversible external execution, let it fail, then record the failure.",
    observed: "The authorization remained in state, the failure was recorded as a new outcome plus evidence, and the ledger grew rather than being rewritten.",
    classification: "SUPPORTED. The kernel cannot express rollback at all, which is the strongest form of I9.",
    rec,
  });
}

// ---------------------------------------------------------------------------
// 003 - Commitment Dependency Graph
// ---------------------------------------------------------------------------
export function case003(): ReviewCase {
  const rec = new Recorder();
  const t = clock();
  const d = rec.track(makeDomain({ id: "graph", clock: t.now, policies: [allowPolicy()] }));

  d.propose(proposal({ domain: "graph", actor: "agent-a", intent: "C1: A promises B", policy: "allow", effects: [{ op: "create", key: "commitment/C1", value: { id: "C1", from: "agent-a", to: "agent-b", status: "ACCEPTED" } }] }));
  d.propose(proposal({ domain: "graph", actor: "agent-b", intent: "C2: B promises C, depends on C1", policy: "allow", effects: [{ op: "create", key: "commitment/C2", value: { id: "C2", from: "agent-b", to: "agent-c", status: "ACCEPTED", dependsOn: "C1" } }] }));

  const c1 = d.document("commitment/C1")!;
  const fail = d.propose(
    proposal({
      domain: "graph",
      actor: "agent-a",
      intent: "C1 fails",
      policy: "allow",
      effects: [
        updateOutcomeEffectDeferred(),
        { op: "update", key: c1.key, value: { id: "C1", from: "agent-a", to: "agent-b", status: "FAILED" }, expectVersion: c1.version },
      ],
    }),
  );
  rec.step("graph", "agent-a", "C1 fails", "committed=" + fail.committed);

  const c2 = d.document("commitment/C2")!.value as unknown as { status: string; dependsOn: string };
  rec.assert(
    "a dependency failure does not roll back the dependent commitment",
    c2.status === "ACCEPTED" && c2.dependsOn === "C1",
    "C2 is still ACCEPTED and still names C1 as its dependency",
  );
  rec.assert(
    "the pre-failure value of C1 stays in history",
    (d.ledger[0].proposal.effects[0].value as unknown as { status: string }).status === "ACCEPTED",
    "ledger seq 1 still records C1 as ACCEPTED",
  );

  const c2doc = d.document("commitment/C2")!;
  const atRisk = d.propose(
    proposal({
      domain: "graph",
      actor: "agent-b",
      intent: "explicitly respond to the dependency failure",
      policy: "allow",
      effects: [{ op: "update", key: c2doc.key, value: { ...(c2doc.value as unknown as Record<string, JsonValue>), status: "AT_RISK" }, expectVersion: c2doc.version }],
    }),
  );
  rec.step("graph", "agent-b", "mark C2 AT_RISK as an explicit transition", "committed=" + atRisk.committed);
  rec.assert(
    "propagation is an explicit, authorized transition rather than automatic",
    atRisk.committed === true && (d.document("commitment/C2")!.value as unknown as { status: string }).status === "AT_RISK",
    "a third transition was needed to change C2",
  );

  return finalize({
    id: "003",
    name: "Commitment Dependency Graph",
    invariant: "v0.2 I9 - failure propagation is not rollback",
    prediction: "A failed commitment will not automatically rewrite a dependent commitment; the dependency is handled by a further transition.",
    scenario: "C2 depends on C1. C1 fails. Observe C2.",
    observed: "C2 remained ACCEPTED across the failure and only changed when an explicit transition marked it AT_RISK. C1's original value stayed in the ledger.",
    classification: "SUPPORTED.",
    rec,
  });
}

function updateOutcomeEffectDeferred() {
  // A no-op effect placeholder keeps the failure transition's shape explicit.
  return { op: "create" as const, key: "event/C1-failed", value: { kind: "commitment-failure", commitment: "C1" } as JsonValue };
}

// ---------------------------------------------------------------------------
// 004 - Delegation and Substitution
// ---------------------------------------------------------------------------
export function case004(): ReviewCase {
  const rec = new Recorder();
  const t = clock();
  const d = rec.track(makeDomain({ id: "work", clock: t.now, policies: [allowPolicy()] }));

  d.propose(proposal({ domain: "work", actor: "agent-a", intent: "A accepts the obligation", policy: "allow", effects: [{ op: "create", key: "liability/L1", value: { id: "L1", holder: "agent-a", obligation: "deliver X" } }] }));
  d.propose(proposal({ domain: "work", actor: "agent-a", intent: "A delegates execution to B", policy: "allow", effects: [{ op: "create", key: "delegation/D1", value: { id: "D1", from: "agent-a", to: "agent-b", scope: "execute X", liabilityTransfer: false } }] }));

  rec.assert(
    "delegation of execution does not transfer liability",
    (d.document("liability/L1")!.value as unknown as { holder: string }).holder === "agent-a",
    "liability/L1 holder is still agent-a",
  );

  const l1 = d.document("liability/L1")!;
  const transfer = d.propose(proposal({ domain: "work", actor: "agent-a", intent: "explicitly transfer liability to B", policy: "allow", effects: [{ op: "update", key: l1.key, value: { id: "L1", holder: "agent-b", obligation: "deliver X" }, expectVersion: l1.version }] }));
  rec.step("work", "agent-a", "explicit liability transfer", "committed=" + transfer.committed);
  rec.assert(
    "liability moves only through an explicit transition",
    transfer.committed === true && (d.document("liability/L1")!.value as unknown as { holder: string }).holder === "agent-b",
    "liability/L1 holder is now agent-b",
  );

  return finalize({
    id: "004",
    name: "Delegation and Substitution",
    invariant: "v0.2 I1 / higher-level liability schema",
    prediction: "Execution can be delegated while liability remains with the original holder until an explicit transfer transition.",
    scenario: "A owes a deliverable, delegates execution to B, then explicitly transfers liability.",
    observed: "Liability stayed with A across the delegation and moved only when a separate transition changed it.",
    classification: "SUPPORTED. Liability is a higher-level schema; no kernel primitive is involved.",
    rec,
  });
}

// ---------------------------------------------------------------------------
// 005 - Temporal Finality
// ---------------------------------------------------------------------------
export function case005(): ReviewCase {
  const rec = new Recorder();
  const t = clock(1000, 100);
  const d = rec.track(
    makeDomain({
      id: "final",
      clock: t.now,
      policies: [
        policyDocument({ id: "final", description: "settlement window closes at 1300", validUntil: 1300, rules: [{ type: "allow-all" }] }),
        policyDocument({ id: "authority", description: "bootstrap path for policy replacement", rules: [{ type: "allow-all" }] }),
      ],
    }),
  );

  const inWindow = d.propose(proposal({ domain: "final", actor: "agent-a", intent: "settle inside the finality window", policy: "final", effects: [{ op: "create", key: "settlement/S1", value: { status: "FINAL" } }] }));
  rec.step("final", "agent-a", "settle while the policy is in force", "committed=" + inWindow.committed);

  t.set(1400);
  const late = d.propose(proposal({ domain: "final", actor: "agent-a", intent: "settle after the window closed", policy: "final", effects: [{ op: "create", key: "settlement/S2", value: { status: "FINAL" } }] }));
  rec.step("final", "agent-a", "attempt settlement after the window", "committed=" + late.committed + " failure=" + String(late.failure?.kind));

  rec.assert(
    "the finality window is a Policy property and closes the path it governs",
    inWindow.committed === true && late.committed === false && late.failure?.kind === "POLICY",
    String(late.failure?.detail),
  );
  rec.assert(
    "later evidence does not by itself reopen final state",
    (d.document("settlement/S1")!.value as unknown as { status: string }).status === "FINAL" && d.ledger.length === 1,
    "S1 remains FINAL; the rejected attempt did not enter the ledger",
  );

  const selfAmend = d.propose(
    proposal({
      domain: "final",
      actor: "agent-a",
      intent: "try to amend the expired policy with itself",
      policy: "final",
      expectedPolicyVersion: 1,
      effects: [{ op: "update", key: "policy/final", value: policyDocument({ id: "final", validUntil: 99999, rules: [{ type: "allow-all" }] }) as unknown as JsonValue, expectVersion: 1 }],
    }),
  );
  rec.step("final", "agent-a", "attempt self-amendment after expiry", "committed=" + selfAmend.committed + " failure=" + String(selfAmend.failure?.kind));
  rec.assert(
    "an expired policy cannot authorize its own replacement",
    selfAmend.committed === false && selfAmend.failure?.kind === "POLICY",
    String(selfAmend.failure?.detail),
  );

  const byAuthority = d.propose(
    proposal({
      domain: "final",
      actor: "agent-a",
      intent: "amend the expired policy under policy/authority",
      policy: "authority",
      effects: [{ op: "update", key: "policy/final", value: policyDocument({ id: "final", validUntil: 99999, rules: [{ type: "allow-all" }] }) as unknown as JsonValue, expectVersion: 1 }],
    }),
  );
  rec.step("final", "agent-a", "amend under policy/authority", "committed=" + byAuthority.committed);
  rec.assert(
    "policy/authority is the explicit bootstrap path for policy replacement",
    byAuthority.committed === true,
    byAuthority.policyResult?.reason ?? "",
  );

  return finalize({
    id: "005",
    name: "Temporal Finality",
    invariant: "v0.2 I10 + Policy temporal scope",
    prediction: "Once a Policy's window closes, it will reject further transitions even in the presence of new evidence, and it will also reject its own replacement; only policy/authority can reopen it.",
    scenario: "A settlement policy carries validUntil. Settle inside the window, attempt to settle after it, attempt self-amendment, then amend under policy/authority.",
    observed: "The in-window settlement committed; the late settlement and the self-amendment were both rejected as POLICY with final state unchanged; the amendment succeeded only under policy/authority.",
    classification: "SUPPORTED. Temporal scope is expressible as Policy state with no new primitive.",
    rec,
  });
}

// ---------------------------------------------------------------------------
// 006 - Concurrent Conflicting Transitions
// ---------------------------------------------------------------------------
export function case006(): ReviewCase {
  const rec = new Recorder();
  const t = clock();
  const d = rec.track(makeDomain({ id: "conc", clock: t.now, policies: [allowPolicy()], state: [seed("slot/S", { owner: "none" } as JsonValue)] }));

  const s1 = d.document("slot/S")!;
  const t1 = d.propose(proposal({ domain: "conc", actor: "agent-a", intent: "claim slot S", policy: "allow", effects: [{ op: "update", key: "slot/S", value: { owner: "agent-a" }, expectVersion: s1.version }] }));
  const t2 = d.propose(proposal({ domain: "conc", actor: "agent-b", intent: "claim slot S", policy: "allow", effects: [{ op: "update", key: "slot/S", value: { owner: "agent-b" }, expectVersion: s1.version }] }));
  const t3 = d.propose(proposal({ domain: "conc", actor: "agent-b", intent: "create an independent slot T", policy: "allow", effects: [{ op: "create", key: "slot/T", value: { owner: "agent-b" } }] }));
  rec.step("conc", "agent-a", "update slot S with CAS v1", "committed=" + t1.committed);
  rec.step("conc", "agent-b", "update slot S with CAS v1 (mutually incompatible)", "committed=" + t2.committed + " failure=" + String(t2.failure?.kind));
  rec.step("conc", "agent-b", "create independent slot T", "committed=" + t3.committed);

  rec.assert(
    "two individually valid transitions can be mutually incompatible",
    t1.committed === true && t2.committed === false && t2.failure?.kind === "VERSION",
    String(t2.failure?.detail),
  );
  rec.assert(
    "independent transitions still commute without a global order",
    t3.committed === true && (d.document("slot/T")!.value as unknown as { owner: string }).owner === "agent-b",
    "slot/T was created while slot/S was contended",
  );
  rec.assert(
    "validity, compatibility and applicability are separable without a kernel ordering primitive",
    d.ledger.length === 2,
    "only the applicable transitions entered the ledger",
  );

  return finalize({
    id: "006",
    name: "Concurrent Conflicting Transitions",
    invariant: "v0.2 I8 + concurrency semantics",
    prediction: "Two transitions that are each valid against the same state may be mutually incompatible; the kernel will not impose a global order, and independent transitions will still commit.",
    scenario: "Two agents claim the same slot against the same observed version; a third transition touches an independent slot.",
    observed: "The first claim committed, the conflicting claim failed compare-and-swap, and the independent transition committed normally.",
    classification: "SUPPORTED.",
    rec,
  });
}

// ---------------------------------------------------------------------------
// 007 - Cross-Domain Resource Over-Commitment
// ---------------------------------------------------------------------------
export function case007(): ReviewCase {
  const rec = new Recorder();
  const t = clock();
  const unique = (id: string) => policyDocument({ id, rules: [{ type: "allow-all" }] });
  const d1 = rec.track(makeDomain({ id: "seller-1", clock: t.now, policies: [unique("grant")] }));
  const d2 = rec.track(makeDomain({ id: "seller-2", clock: t.now, policies: [unique("grant")] }));
  const shared = rec.track(makeDomain({ id: "registry", clock: t.now, policies: [unique("grant")] }));

  const grant = (domain: string, owner: string, key: string, policy: string) => ({ op: "create" as const, key, value: { resource: "gpu-cluster-7", owner } as JsonValue });

  const g1 = d1.propose(proposal({ domain: "seller-1", actor: "seller-1", intent: "grant gpu-cluster-7", policy: "grant", effects: [grant("seller-1", "agent-a", "grant/G7", "grant")] }));
  const g2 = d2.propose(proposal({ domain: "seller-2", actor: "seller-2", intent: "grant gpu-cluster-7", policy: "grant", effects: [grant("seller-2", "agent-b", "grant/G7", "grant")] }));
  rec.step("seller-1", "seller-1", "grant the same physical resource", "committed=" + g1.committed);
  rec.step("seller-2", "seller-2", "grant the same physical resource", "committed=" + g2.committed);
  rec.assert(
    "without shared state the same resource can be granted twice (over-commitment)",
    g1.committed === true && g2.committed === true,
    "two independent Domains each recorded a grant of gpu-cluster-7",
  );

  const s1 = shared.propose(proposal({ domain: "registry", actor: "registry", intent: "grant gpu-cluster-7 once", policy: "grant", effects: [grant("registry", "agent-a", "grant/G7", "grant")] }));
  const s2 = shared.propose(proposal({ domain: "registry", actor: "registry", intent: "grant gpu-cluster-7 again", policy: "grant", effects: [grant("registry", "agent-b", "grant/G7", "grant")] }));
  rec.step("registry", "registry", "second grant against shared state", "committed=" + s2.committed + " failure=" + String(s2.failure?.kind));
  rec.assert(
    "shared state is required exactly where a uniqueness invariant applies",
    s1.committed === true && s2.committed === false && s2.failure?.kind === "PRECONDITION",
    String(s2.failure?.detail),
  );

  return finalize({
    id: "007",
    name: "Cross-Domain Resource Over-Commitment",
    invariant: "v0.2 I3 - authority and uniqueness are Domain-scoped",
    prediction: "Independent Domains will each be able to grant the same resource; only a Domain that holds state over the resource can enforce uniqueness.",
    scenario: "Two seller Domains grant the same physical resource; a registry Domain holds the grant key and is asked twice.",
    observed: "Both sellers committed their grant. The registry rejected the second grant on create-precondition. No new primitive was needed.",
    classification: "SUPPORTED. Uniqueness is an extension-level requirement satisfied by shared Domain state.",
    rec,
  });
}

// ---------------------------------------------------------------------------
// 008 - Consensus Scope
// ---------------------------------------------------------------------------
export function case008(): ReviewCase {
  const rec = new Recorder();
  const t = clock();
  const quorum = policyDocument({
    id: "quorum",
    rules: [{ type: "decision-threshold", params: { threshold: 2, allowedJudges: ["judge-1", "judge-2", "judge-3"] } }],
  });
  const dDecides = rec.track(makeDomain({ id: "decides", clock: t.now, policies: [quorum] }));
  const dAgrees = rec.track(makeDomain({ id: "agrees", clock: t.now, policies: [allowPolicy()] }));

  const target = proposal({ domain: "decides", actor: "agent-a", intent: "act on a quorum", policy: "quorum", effects: [{ op: "create", key: "action/A1", value: { status: "TAKEN" } }] });

  // The other Domain records agreement. That is its own State, not authority here.
  const agreement = dAgrees.propose(proposal({ domain: "agrees", actor: "judge-1", intent: "record agreement elsewhere", policy: "allow", effects: [{ op: "create", key: "agreement/G1", value: { approved: true } }] }));
  rec.step("agrees", "judge-1", "record agreement in another Domain", "committed=" + agreement.committed);

  createDecision(dDecides, { evaluator: "judge-1", conclusion: "AFFIRM", subject: hashJson(target), timestamp: 1, rationale: "in favour" });
  const oneOnly = dDecides.propose(target);
  rec.step("decides", "agent-a", "act with one judgment", "committed=" + oneOnly.committed + " failure=" + String(oneOnly.failure?.kind));
  rec.assert(
    "agreement recorded in another Domain confers no authority",
    agreement.committed === true && oneOnly.committed === false && oneOnly.failure?.kind === "POLICY",
    String(oneOnly.failure?.detail),
  );

  createDecision(dDecides, { evaluator: "judge-2", conclusion: "AFFIRM", subject: hashJson(target), timestamp: 2, rationale: "in favour" });
  const two = dDecides.propose(target);
  rec.step("decides", "agent-a", "act with a local quorum of two judgments", "committed=" + two.committed);
  rec.assert(
    "only a quorum recognized by the acting Domain authorizes the transition",
    two.committed === true,
    two.policyResult?.reason ?? "",
  );

  return finalize({
    id: "008",
    name: "Consensus Scope",
    invariant: "v0.2 I3 / I5 - authority is Domain-scoped and locally recognized",
    prediction: "Agreement reached elsewhere will not authorize a transition; the acting Domain's own Policy must recognize the quorum.",
    scenario: "One Domain records agreement; a second Domain requires a two-judge quorum for the same action.",
    observed: "The foreign agreement had no effect. The action committed only after the acting Domain gathered two judgments of its own.",
    classification: "SUPPORTED. Consensus is a coordination mechanism used by Policy, not a kernel primitive.",
    rec,
  });
}
