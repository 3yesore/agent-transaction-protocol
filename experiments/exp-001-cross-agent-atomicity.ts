import { Domain } from "../kernel/domain.ts";
import { createVerifier } from "../kernel/evidence.ts";
import { hashJson } from "../kernel/json.ts";
import { Recorder, renderMarkdown, seed, type ExperimentReport } from "./harness.ts";
import { standardPolicies, standardPreconditions } from "../extensions/index.ts";
import {
  capabilityKey,
  capabilityValue,
  consume,
  release,
  reserve,
  spend,
  updateCapabilityEffect,
  type CapabilityValue,
} from "../extensions/capability.ts";
import {
  createReservation,
  reservationKey,
  resolveReservation,
  updateReservationEffect,
  type ReservationValue,
} from "../extensions/reservation.ts";
import { createOutcome, outcomeKey, type OutcomeValue } from "../extensions/outcome.ts";
import type { Effect, Hash, JsonValue, Precondition, TransitionProposal } from "../kernel/types.ts";

const V = createVerifier({ trustedProducers: ["agent-a", "agent-b", "judge-1"] });

export function runCrossAgentAtomicity(): ExperimentReport {
  const rec = new Recorder();
  let now = 1000;
  const clock = () => now;
  let pid = 0;

  function prop(
    domain: string,
    actor: string,
    effects: Effect[],
    opts: {
      policy?: { id: string; params?: JsonValue };
      evidence?: Hash[];
      preconditions?: Precondition[];
      intent?: string;
    } = {},
  ): TransitionProposal {
    return {
      id: "exp1-" + ++pid,
      domain,
      actor,
      intent: opts.intent ?? "transition",
      policy: opts.policy ?? { id: "allow-all" },
      preconditions: opts.preconditions ?? [],
      effects,
      evidence: opts.evidence ?? [],
      parents: [],
      createdAt: now,
    };
  }

  function makeDomain(id: string, initialState: ReturnType<typeof seed>[]): Domain {
    return rec.track(
      new Domain({
        id,
        policies: standardPolicies(),
        verifier: V,
        preconditions: standardPreconditions(),
        clock,
        initialState,
      }),
    );
  }

  function cap(domain: Domain, owner: string, unit: string): { doc: NonNullable<ReturnType<Domain["document"]>>; value: CapabilityValue } {
    const doc = domain.document(capabilityKey(owner, unit));
    if (!doc) throw new Error("missing capability " + capabilityKey(owner, unit));
    return { doc, value: doc.value as unknown as CapabilityValue };
  }

  function reserveEffects(domain: Domain, owner: string, unit: string, amount: number): Effect[] {
    const { doc, value } = cap(domain, owner, unit);
    const result = reserve(value, amount);
    if (!result.ok) throw new Error("reserve failed: " + result.reason);
    return [updateCapabilityEffect(doc, result.value)];
  }

  function releaseEffects(domain: Domain, owner: string, unit: string, amount: number): Effect[] {
    const { doc, value } = cap(domain, owner, unit);
    const result = release(value, amount);
    if (!result.ok) throw new Error("release failed: " + result.reason);
    return [updateCapabilityEffect(doc, result.value)];
  }

  function spendEffects(domain: Domain, owner: string, unit: string, amount: number): Effect[] {
    const { doc, value } = cap(domain, owner, unit);
    const result = spend(value, amount);
    if (!result.ok) throw new Error("spend failed: " + result.reason);
    return [updateCapabilityEffect(doc, result.value)];
  }

  function consumeEffects(domain: Domain, owner: string, unit: string, amount: number): Effect[] {
    const { doc, value } = cap(domain, owner, unit);
    const result = consume(value, amount);
    if (!result.ok) throw new Error("consume failed: " + result.reason);
    return [updateCapabilityEffect(doc, result.value)];
  }

  // ---------------------------------------------------------------- Scenario 1
  // Naive one-phase exchange: A pays, then B is supposed to deliver.
  const payer1 = makeDomain("payer-1", [seed(capabilityKey("A", "credit"), capabilityValue("credit", 100))]);
  const payee1 = makeDomain("payee-1", [seed(capabilityKey("B", "gpu-hour"), capabilityValue("gpu-hour", 5))]);

  rec.step("payer-1", "agent-a", "one-phase: pay 100 credit", String(payer1.propose(prop("payer-1", "agent-a", spendEffects(payer1, "A", "credit", 100), { intent: "pay B" })).committed));
  // The payee crashes: it proposes no transition at all.
  rec.step("payee-1", "agent-b", "agent-b crashes before delivering", "no transition proposed (payee ledger is empty)");
  rec.assert("naive one-phase: the crashed payee recorded nothing", payee1.ledger.length === 0, "payee-1 ledger length=" + payee1.ledger.length);

  const a1 = cap(payer1, "A", "credit").value;
  rec.assert(
    "naive one-phase: both domains are internally consistent",
    payer1.verify().ok && payee1.verify().ok,
    "per-domain ledgers verify",
  );
  rec.assert(
    "naive one-phase: the joint state is inconsistent (A consumed 100, no delivery record)",
    a1.consumed === 100 && payee1.document(outcomeKey("O1")) === undefined,
    "A.consumed=" + a1.consumed + ", delivery outcome present=" + String(payee1.document(outcomeKey("O1")) !== undefined),
  );

  // ---------------------------------------------------------------- Scenario 2
  // Two-phase prepare; the payee never prepares; the payer's hold expires.
  const payer2 = makeDomain("payer-2", [seed(capabilityKey("A", "credit"), capabilityValue("credit", 100))]);
  const payee2 = makeDomain("payee-2", [seed(capabilityKey("B", "gpu-hour"), capabilityValue("gpu-hour", 5))]);
  const r1 = createReservation({ id: "R1", commitment: "C1", resource: capabilityKey("A", "credit"), holder: "agent-b", owner: "agent-a", amount: 100, unit: "credit", createdAt: now, expiresAt: now + 500 });
  const prepare1 = payer2.propose(
    prop(
      "payer-2",
      "agent-a",
      [
        { op: "create", key: reservationKey("R1"), value: r1 as unknown as JsonValue },
        ...reserveEffects(payer2, "A", "credit", 100),
      ],
      { intent: "prepare: reserve funds for C1" },
    ),
  );
  rec.step("payer-2", "agent-a", "prepare: reserve 100 credit for C1", "committed=" + prepare1.committed);

  // A buggy or malicious payee builds the over-reservation value directly,
  // bypassing the client-side helper. Policy is the authority boundary.
  const bDoc2 = payee2.document(capabilityKey("B", "gpu-hour"))!;
  const bVal2 = bDoc2.value as unknown as CapabilityValue;
  const overReserved: CapabilityValue = {
    ...bVal2,
    available: bVal2.available - 99,
    reserved: bVal2.reserved + 99,
  };
  const payeePrepare = payee2.propose(
    prop("payee-2", "agent-b", [updateCapabilityEffect(bDoc2, overReserved)], {
      policy: { id: "capability-available", params: { key: capabilityKey("B", "gpu-hour"), amount: 99 } },
      intent: "prepare: reserve 99 service units against a 5 unit capability",
    }),
  );
  rec.step("payee-2", "agent-b", "prepare: reserve 99 gpu-hour against a 5 unit capability", "committed=" + payeePrepare.committed + " failure=" + String(payeePrepare.failure?.kind));

  now = 2000; // past R1.expiresAt = 1500
  const held2 = cap(payer2, "A", "credit").value;
  const expiry = payer2.propose(
    prop(
      "payer-2",
      "agent-a",
      [
        updateReservationEffect(payer2.document(reservationKey("R1"))!, resolveReservation(r1, "EXPIRED", "expiry")),
        ...releaseEffects(payer2, "A", "credit", 100),
      ],
      { intent: "expire and release the unused hold" },
    ),
  );
  rec.step("payer-2", "agent-a", "after expiry: release the unused hold", "committed=" + expiry.committed);
  const a2 = cap(payer2, "A", "credit").value;
  rec.assert(
    "two-phase prepare failure is safe: an expired hold returns all funds",
    payeePrepare.committed === false && a2.available === 100 && a2.reserved === 0 && a2.consumed === 0,
    "during hold available=" + held2.available + " reserved=" + held2.reserved + " -> after release available=" + a2.available,
  );
  rec.assert(
    "insufficient-capability prepare is rejected by policy, not silently accepted",
    payeePrepare.failure?.kind === "POLICY",
    String(payeePrepare.failure?.detail),
  );

  // ---------------------------------------------------------------- Scenario 3
  // Both sides prepared, the payee delivers first, then the payer crashes.
  const payer3 = makeDomain("payer-3", [seed(capabilityKey("A", "credit"), capabilityValue("credit", 100))]);
  const payee3 = makeDomain("payee-3", [seed(capabilityKey("B", "gpu-hour"), capabilityValue("gpu-hour", 5))]);
  const r1b = createReservation({ id: "R1", commitment: "C1", resource: capabilityKey("A", "credit"), holder: "agent-b", owner: "agent-a", amount: 100, unit: "credit", createdAt: now, expiresAt: now + 100000 });
  const r2b = createReservation({ id: "R2", commitment: "C1", resource: capabilityKey("B", "gpu-hour"), holder: "agent-a", owner: "agent-b", amount: 1, unit: "gpu-hour", createdAt: now, expiresAt: now + 100000 });
  payer3.propose(prop("payer-3", "agent-a", [{ op: "create", key: reservationKey("R1"), value: r1b as unknown as JsonValue }, ...reserveEffects(payer3, "A", "credit", 100)], { intent: "prepare payment hold" }));
  payee3.propose(prop("payee-3", "agent-b", [{ op: "create", key: reservationKey("R2"), value: r2b as unknown as JsonValue }, ...reserveEffects(payee3, "B", "gpu-hour", 1)], { intent: "prepare capacity hold" }));

  const receiptInput = { kind: "delivery-receipt", producer: "agent-b", domain: "payee-3", payload: { commitment: "C1", outcome: "O1" } as JsonValue, issuedAt: now } as const;
  const receipt = payee3.publishEvidence(receiptInput);
  payer3.publishEvidence(receiptInput); // content addressed: same id in an independent domain
  const deliver = payee3.propose(
    prop(
      "payee-3",
      "agent-b",
      [
        ...consumeEffects(payee3, "B", "gpu-hour", 1),
        updateReservationEffect(payee3.document(reservationKey("R2"))!, resolveReservation(r2b, "COMMITTED", "exp1")),
        { op: "create", key: outcomeKey("O1"), value: createOutcome({ id: "O1", producer: "agent-b", specification: "S1", status: "PROVEN", evidenceRefs: [receipt.id] }) as unknown as JsonValue },
      ],
      { intent: "deliver service and record the outcome" },
    ),
  );
  rec.step("payee-3", "agent-b", "deliver service, consume capacity, record OUTCOME O1=PROVEN", "committed=" + deliver.committed + " evidence=" + receipt.id.slice(0, 14));

  const b3 = cap(payee3, "B", "gpu-hour").value;
  const a3 = cap(payer3, "A", "credit").value;
  rec.step("payer-3", "agent-a", "CRASH between the two commit phases", "no settlement transition");
  rec.assert(
    "commit-ordering crash leaves the joint state temporarily inconsistent",
    b3.consumed === 1 && a3.reserved === 100 && a3.consumed === 0,
    "payee consumed=" + b3.consumed + ", payer reserved=" + a3.reserved + ", payer consumed=" + a3.consumed,
  );
  rec.assert(
    "the v0.1 kernel offers no cross-domain transaction that would have made both commits atomic",
    payer3.ledger.every((r) => r.domain === "payer-3") && payee3.ledger.every((r) => r.domain === "payee-3") && !rec.domains.some((d) => d.id === "coordinator"),
    "each transition is confined to exactly one domain; there is no joint commit",
  );

  // Recovery: evidence -> decision -> policy -> transition (a normal settlement).
  const settle = prop(
    "payer-3",
    "agent-a",
    [
      ...consumeEffects(payer3, "A", "credit", 100),
      updateReservationEffect(payer3.document(reservationKey("R1"))!, resolveReservation(r1b, "COMMITTED", "settlement")),
    ],
    { policy: { id: "judgment", params: { threshold: 1, allowedJudges: ["judge-1"] } }, evidence: [receipt.id], intent: "settle C1 against the delivery receipt" },
  );
  payer3.publishDecision({
    subject: hashJson(settle),
    judge: "judge-1",
    verdict: "AFFIRM",
    rationale: "delivery receipt matches the commitment specification",
    evidenceRefs: [receipt.id],
    issuedAt: now,
  });
  const settlement = payer3.propose(settle);
  rec.step("payer-3", "agent-a", "recovery: settle against a judge-affirmed delivery receipt", "committed=" + settlement.committed);
  const a3after = cap(payer3, "A", "credit").value;
  rec.assert(
    "evidence + decision + policy restores eventual consistency after the crash",
    settlement.committed === true && a3after.consumed === 100 && b3.consumed === 1 && payee3.document(outcomeKey("O1")) !== undefined,
    "payer consumed=" + a3after.consumed + " (reserved " + a3after.reserved + ")",
  );
  rec.assert(
    "the pre-crash hold is preserved in history rather than edited away",
    payer3.ledger[0].proposal.effects.some((e) => e.key === reservationKey("R1")) && (payer3.ledger[0].proposal.effects[0].value as unknown as ReservationValue).status === "ACTIVE",
    "ledger seq 1 still records reservation R1 as ACTIVE",
  );

  // ---------------------------------------------------------------- Scenario 4
  // The payee never delivers. Compensation must be possible for the payer.
  const payer4 = makeDomain("payer-4", [seed(capabilityKey("A", "credit"), capabilityValue("credit", 100))]);
  const payee4 = makeDomain("payee-4", [seed(capabilityKey("B", "gpu-hour"), capabilityValue("gpu-hour", 5))]);
  const r1c = createReservation({ id: "R1", commitment: "C1", resource: capabilityKey("A", "credit"), holder: "agent-b", owner: "agent-a", amount: 100, unit: "credit", createdAt: now, expiresAt: now + 100000 });
  payer4.propose(prop("payer-4", "agent-a", [{ op: "create", key: reservationKey("R1"), value: r1c as unknown as JsonValue }, ...reserveEffects(payer4, "A", "credit", 100)], { intent: "prepare payment hold" }));
  const nonDelivery = payer4.publishEvidence({ kind: "non-delivery-observation", producer: "agent-a", domain: "payer-4", payload: { commitment: "C1", observed: "no outcome by deadline" } as JsonValue, issuedAt: now });
  const compensate = prop(
    "payer-4",
    "agent-a",
    [
      ...releaseEffects(payer4, "A", "credit", 100),
      updateReservationEffect(payer4.document(reservationKey("R1"))!, resolveReservation(r1c, "RELEASED", "compensation")),
    ],
    { policy: { id: "judgment", params: { threshold: 1, allowedJudges: ["judge-1"] } }, evidence: [nonDelivery.id], intent: "compensate: release the hold after non-delivery" },
  );
  payer4.publishDecision({
    subject: hashJson(compensate),
    judge: "judge-1",
    verdict: "AFFIRM",
    rationale: "non-delivery observation consistent with the commitment deadline",
    evidenceRefs: [nonDelivery.id],
    issuedAt: now,
  });
  const compensation = payer4.propose(compensate);
  const a4 = cap(payer4, "A", "credit").value;
  rec.step("payer-4", "agent-a", "recovery: release the hold after non-delivery", "committed=" + compensation.committed);
  rec.assert(
    "non-delivery compensation returns the payer to a consistent state",
    compensation.committed === true && a4.available === 100 && a4.reserved === 0 && a4.consumed === 0,
    "available=" + a4.available + " reserved=" + a4.reserved + " consumed=" + a4.consumed,
  );

  rec.find(
    "The kernel cannot make two independent domains commit atomically",
    "KERNEL / open problem (do not add a primitive yet)",
    "Every transition is confined to one domain, so a crash between the payee commit and the payer commit is observable as a joint inconsistency. The kernel's guarantee is intra-domain atomicity only. Instantaneous cross-domain atomicity is not expressible with State + Transition + Policy + Evidence + Decision, so it remains an open research problem (cross-state transactions).",
  );
  rec.find(
    "Two-phase reservation plus evidence-driven settlement achieves eventual consistency",
    "EXTENSION",
    "A prepare phase (reserve, with expiry) followed by a commit phase, and a compensation path driven by Evidence -> Decision -> Policy -> Transition, restores a consistent joint state without any new kernel primitive. This belongs in an extension RFC for cross-agent coordination.",
  );
  rec.find(
    "Expiry release is a liveness dependency on some actor proposing it",
    "AGENT",
    "A hold left ACTIVE is not released by the kernel on a timer; some agent or reaper must propose the release transition. This is an agent/environment liveness obligation, not a kernel correctness gap, and should be stated as such in any extension protocol.",
  );

  const invariants = [...rec.domainReport(), ...rec.invariantReport()];

  return {
    id: "Experiment 001",
    title: "Cross-Agent Atomicity",
    problem:
      "Two independently governed agents exchange value: A holds credit, B holds service capacity. A must pay and B must deliver, and a failure must not leave one side committed while the other is not.",
    actors: [
      "agent-a (payer, sole authority over domain payer)",
      "agent-b (payee, sole authority over domain payee)",
      "judge-1 (decides whether a delivery receipt or a non-delivery observation supports settlement)",
    ],
    initialState: [
      "payer: capability/A/credit = { total 100, available 100, reserved 0, consumed 0 }",
      "payee: capability/B/gpu-hour = { total 5, available 5, reserved 0, consumed 0 }",
      "no shared ledger, no shared clock, no cross-domain transaction",
    ],
    actions: [
      "Scenario 1: one-phase payment with a crash before delivery",
      "Scenario 2: two-phase prepare where the payee cannot prepare and the payer's hold expires",
      "Scenario 3: both sides prepared, the payee delivers, the payer crashes before settling, then recovery settles via a judge-affirmed receipt",
      "Scenario 4: the payee never delivers and the payer compensates via a judge-affirmed non-delivery observation",
    ],
    expected:
      "Determine whether the current kernel can represent an atomic exchange, and if not, whether an extension protocol using the five primitives restores a consistent state.",
    observed:
      "One-phase exchange produced a locally valid but jointly inconsistent state (A consumed 100, no delivery). Two-phase preparation with expiry made prepare-phase failure safe. A crash between the two commit phases remained observable as a joint inconsistency, confirming the absence of cross-domain atomicity. Evidence -> Decision -> Policy -> Transition then settled the correct case and compensated the failed case, returning both domains to a consistent state with all history intact.",
    failures: [
      "One-phase: A's 100 credit consumed with no delivery outcome and no protocol record linking the two domains.",
      "Commit-ordering crash: the payee consumed capacity while the payer's funds were still reserved, with no joint commit point.",
      "The kernel does not release an expired hold on its own; without a proposing actor the hold persists.",
    ],
    classification:
      "EXTENSION (cross-agent coordination protocol) with one open KERNEL question. No precise impossibility was found for eventual consistency, so no new primitive is justified. Instantaneous cross-domain atomicity is a genuine semantic gap and stays an open problem.",
    proposedChange:
      "Do not add a kernel primitive. Write an extension RFC for a two-phase reservation protocol (prepare with expiry, commit, release, compensate) driven by Evidence and Decision, and record 'cross-state transactions / instantaneous cross-domain atomicity' in docs/open-problems.md.",
    steps: rec.steps,
    assertions: rec.assertions,
    findings: rec.findings,
    invariants,
    conclusion:
      "The v0.1 kernel supports safe cross-agent interaction, but only as eventual consistency through reservation and compensation; it does not provide atomic cross-domain commit. " +
      (rec.allPassed() ? "All " + rec.assertions.length + " assertions held." : "At least one assertion FAILED - the model above is wrong."),
  };
}

export function reportMarkdown(): string {
  return renderMarkdown(runCrossAgentAtomicity());
}

if (process.argv[1] && process.argv[1].endsWith("exp-001-cross-agent-atomicity.ts")) {
  process.stdout.write(reportMarkdown());
}
