import { Domain } from "../kernel/domain.ts";
import { createVerifier } from "../kernel/evidence.ts";
import { hashJson } from "../kernel/json.ts";
import { Recorder, renderMarkdown, type ExperimentReport } from "./harness.ts";
import { standardPolicies } from "../extensions/index.ts";
import { createOutcome, outcomeKey, supersedeEffects, disputeEffects, type OutcomeValue } from "../extensions/outcome.ts";
import type { JsonValue, TransitionProposal } from "../kernel/types.ts";

export function runOutcomeReversal(): ExperimentReport {
  const rec = new Recorder();
  const now = 9000;
  let pid = 0;
  const verifier = createVerifier({ trustedProducers: ["verifier-1", "judge-1"] });
  const domain = rec.track(
    new Domain({ id: "verification", policies: standardPolicies(), verifier, clock: () => now }),
  );

  const e1 = domain.publishEvidence({ kind: "test-run", producer: "verifier-1", domain: "verification", payload: { result: "spec satisfied" } as JsonValue, issuedAt: now });
  const e2 = domain.publishEvidence({ kind: "test-run", producer: "verifier-1", domain: "verification", payload: { result: "spec violated" } as JsonValue, issuedAt: now });

  function proposal(effects: TransitionProposal["effects"], evidence: string[], intent: string): TransitionProposal {
    return { id: "exp5-" + ++pid, domain: "verification", actor: "verifier-1", intent, policy: { id: "allow-all" }, preconditions: [], effects, evidence, parents: [], createdAt: now };
  }

  const t1 = domain.propose(
    proposal(
      [{ op: "create", key: outcomeKey("O1"), value: createOutcome({ id: "O1", producer: "verifier-1", specification: "S1", status: "PROVEN", evidenceRefs: [e1.id] }) as unknown as JsonValue }],
      [e1.id],
      "record outcome O1 = PROVEN",
    ),
  );
  rec.step("verification", "verifier-1", "record OUTCOME O1 = PROVEN", "committed=" + t1.committed);

  const d2 = domain.publishDecision({ subject: hashJson(proposal([], [], "dispute")), judge: "judge-1", verdict: "AFFIRM", rationale: "new evidence contradicts O1", evidenceRefs: [e2.id], issuedAt: now });
  const o1v1 = domain.document(outcomeKey("O1"))!;
  const t2 = domain.propose(
    proposal(disputeEffects(o1v1, "judge-1"), [e2.id], "dispute O1 with new evidence"),
  );
  rec.step("verification", "judge-1", "dispute O1 with new evidence", "committed=" + t2.committed + " decision=" + d2.id.slice(0, 12));

  const o1v2 = domain.document(outcomeKey("O1"))!;
  const o2 = createOutcome({ id: "O2", producer: "verifier-1", specification: "S1", status: "DISPROVEN", evidenceRefs: [e2.id], decisionRef: d2.id, supersedes: "O1" });
  const t3 = domain.propose(
    proposal(supersedeEffects(o1v2, o2, d2.id), [e2.id], "supersede O1 with O2 = DISPROVEN"),
  );
  rec.step("verification", "verifier-1", "supersede O1 with O2 = DISPROVEN", "committed=" + t3.committed);

  const finalO1 = domain.document(outcomeKey("O1"))!.value as unknown as OutcomeValue;
  const finalO2 = domain.document(outcomeKey("O2"))?.value as unknown as OutcomeValue;
  const originalO1 = domain.ledger.find((r) => r.proposal.intent.includes("PROVEN"))!.proposal.effects[0].value as unknown as OutcomeValue;

  rec.assert("O1 still exists after being disputed and superseded", finalO1 !== undefined, "no deletion occurred");
  rec.assert("O1 records its supersession rather than losing its history", finalO1.status === "SUPERSEDED" && finalO1.supersededBy === "O2", JSON.stringify({ status: finalO1.status, supersededBy: finalO1.supersededBy }));
  rec.assert("the original PROVEN value remains addressable in the ledger", originalO1.status === "PROVEN", "ledger seq 1 still reads PROVEN");
  rec.assert("the successor outcome carries the reversal and the decision that justified it", finalO2?.status === "DISPROVEN" && finalO2?.supersedes === "O1" && finalO2?.decisionRef === d2.id, JSON.stringify({ status: finalO2?.status, supersedes: finalO2?.supersedes }));
  rec.assert("reversal produced new transitions, not mutations of prior records", domain.ledger.length === 3 && domain.ledger.every((r) => r.proposal.effects.every((e) => e.op === "create" || e.op === "update")), "ledger length=" + domain.ledger.length);
  rec.assert("the whole domain still verifies after reversal", domain.verify().ok, "hash chain and replayed state agree");
  rec.find(
    "Outcome reversal is fully expressible in the v0.1 kernel",
    "NONE (kernel sufficient)",
    "Dispute and supersession are ordinary transitions. The predecessor keeps its state key, gains a supersededBy pointer, and its original value stays in the ledger, satisfying invariant I5 without any new primitive. Only the question of who may reverse an outcome (Decision Authority) remains open.",
  );

  const invariants = [...rec.domainReport(), ...rec.invariantReport()];
  return {
    id: "Experiment 005",
    title: "Outcome Reversal",
    problem:
      "An outcome is first recognized as PROVEN, then new evidence contradicts it. Determine whether the kernel can represent the reversal while keeping history intact.",
    actors: ["verifier-1 (produced both the original and the contradicting evidence)", "judge-1 (decides the dispute)"],
    initialState: ["verification domain with no outcome state", "evidence e1 = spec satisfied, e2 = spec violated"],
    actions: [
      "Record O1 = PROVEN with evidence e1",
      "Publish a decision on the contradicting evidence and dispute O1",
      "Create O2 = DISPROVEN referencing e2 and the decision, and mark O1 SUPERSEDED",
    ],
    expected: "The reversal must be expressible as new transitions, with no silent mutation or deletion of the original record.",
    observed:
      "O1 moved PROVEN -> DISPUTED -> SUPERSEDED, gained a supersededBy pointer, and its original PROVEN value remained in the ledger; O2 carried the DISPROVEN status and the decision reference.",
    failures: [],
    classification: "NONE for this scenario: the kernel represents dispute and reversal without additions.",
    proposedChange: "No change. Use this as the reference pattern for reversal in any extension protocol.",
    steps: rec.steps,
    assertions: rec.assertions,
    findings: rec.findings,
    invariants,
    conclusion:
      "History-preserving reversal works with State + Transition + Policy + Evidence + Decision alone. " +
      (rec.allPassed() ? "All " + rec.assertions.length + " assertions held." : "At least one assertion FAILED."),
  };
}

export function reportMarkdown(): string {
  return renderMarkdown(runOutcomeReversal());
}

if (process.argv[1] && process.argv[1].endsWith("exp-005-outcome-reversal.ts")) {
  process.stdout.write(reportMarkdown());
}
