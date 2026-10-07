import { Domain } from "../kernel/domain.ts";
import { createVerifier } from "../kernel/evidence.ts";
import { hashJson } from "../kernel/json.ts";
import { judgmentThreshold } from "../kernel/policy.ts";
import { Recorder, renderMarkdown, type ExperimentReport } from "./harness.ts";
import { standardPolicies } from "../extensions/index.ts";
import { createOutcome, outcomeKey } from "../extensions/outcome.ts";
import type { Hash, JsonValue, TransitionProposal } from "../kernel/types.ts";

export function runMaliciousJudge(): ExperimentReport {
  const rec = new Recorder();
  const now = 5000;
  let pid = 0;
  const verifier = createVerifier({
    trustedProducers: ["judge-1", "judge-2", "judge-3", "judge-x", "judge-y", "agent-b"],
  });

  function court(id: string): Domain {
    const policies = standardPolicies();
    policies.register("judgment-with-evidence", () =>
      judgmentThreshold("judgment-with-evidence", { threshold: 1, minValidEvidence: 1 }),
    );
    return rec.track(new Domain({ id, policies, verifier, clock: () => now }));
  }

  function outcomeProposal(
    domain: string,
    actor: string,
    policy: { id: string; params?: JsonValue },
    evidence: Hash[],
  ): TransitionProposal {
    return {
      id: "exp3-" + ++pid,
      domain,
      actor,
      intent: "recognize outcome O1",
      policy,
      preconditions: [],
      effects: [
        {
          op: "create",
          key: outcomeKey("O1"),
          value: createOutcome({ id: "O1", producer: "agent-b", specification: "S1", status: "PROVEN" }) as unknown as JsonValue,
        },
      ],
      evidence,
      parents: [],
      createdAt: now,
    };
  }

  // A: one malicious judge against a 2-of-3 threshold.
  const dA = court("court-a");
  const pA = outcomeProposal("court-a", "agent-b", { id: "judgment", params: { threshold: 2, allowedJudges: ["judge-1", "judge-2", "judge-3"] } }, []);
  dA.publishDecision({ subject: hashJson(pA), judge: "judge-1", verdict: "AFFIRM", rationale: "looks fine to me", issuedAt: now });
  const rA = dA.propose(pA);
  rec.step("court-a", "judge-1", "single judge affirms against a 2-of-3 threshold", "committed=" + rA.committed + " failure=" + String(rA.failure?.kind));
  rec.assert("a single malicious judge cannot reach a 2-of-3 threshold", rA.committed === false && rA.failure?.kind === "POLICY", String(rA.failure?.detail));

  // B: two colluding judge identities.
  const dB = court("court-b");
  const pB = outcomeProposal("court-b", "agent-b", { id: "judgment", params: { threshold: 2, allowedJudges: ["judge-x", "judge-y", "judge-1"] } }, []);
  dB.publishDecision({ subject: hashJson(pB), judge: "judge-x", verdict: "AFFIRM", rationale: "colluding", issuedAt: now });
  dB.publishDecision({ subject: hashJson(pB), judge: "judge-y", verdict: "AFFIRM", rationale: "colluding", issuedAt: now });
  const rB = dB.propose(pB);
  rec.step("court-b", "judge-x, judge-y", "two colluding identities affirm", "committed=" + rB.committed);
  rec.assert("two colluding judge identities satisfy a 2-of-N threshold", rB.committed === true, rB.policyResult.reason);
  rec.find(
    "Distinct judge identities are not distinct principals",
    "AGENT + EXTENSION (identity, judge selection)",
    "A threshold policy counts distinct judge ids, so an attacker holding several ids reaches any threshold. Policy can constrain who may judge and how many, but cannot establish that two ids are two independent principals. Sybil resistance and judge selection belong in an extension protocol (and are listed as open problems).",
  );

  // C: structurally valid but false evidence, plus tamper detection.
  const dC = court("court-c");
  const falseEvidence = dC.publishEvidence({
    kind: "trace",
    producer: "judge-x",
    domain: "court-c",
    payload: { claim: "deliverable satisfies the specification" } as JsonValue,
    issuedAt: now,
  });
  rec.assert(
    "a false but well-formed evidence record verifies as VALID",
    dC.verifier.verify(falseEvidence) === "VALID",
    "verification checks provenance and integrity, never truth (invariant I4)",
  );
  const pC = outcomeProposal("court-c", "agent-b", { id: "judgment-with-evidence", params: {} }, [falseEvidence.id]);
  dC.publishDecision({ subject: hashJson(pC), judge: "judge-x", verdict: "AFFIRM", rationale: "trust the trace", evidenceRefs: [falseEvidence.id], issuedAt: now });
  const rC = dC.propose(pC);
  rec.step("court-c", "judge-x", "affirm using well-formed false evidence", "committed=" + rC.committed);
  rec.assert("policy admits well-formed false evidence", rC.committed === true, rC.policyResult.reason);
  const tampered = { ...falseEvidence, payload: { claim: "tampered" } as JsonValue };
  rec.assert("tampering is detectable even though truth is not", dC.verifier.verify(tampered) === "INVALID", "content address mismatch -> INVALID");
  rec.find(
    "Verification bounds tampering, not lying",
    "KERNEL boundary (I4) / open problem: Evidence Authenticity",
    "Evidence supports a decision only up to the credibility of its source. The protocol can detect that a record was altered after publication, but it cannot decide that a truthful-looking record is false. Any system built on ATP must state who is trusted for which evidence kinds.",
  );

  // D: ballot stuffing with one judge identity.
  const dD = court("court-d");
  const pD = outcomeProposal("court-d", "agent-b", { id: "judgment", params: { threshold: 2, allowedJudges: ["judge-1"] } }, []);
  for (let i = 0; i < 5; i++) {
    dD.publishDecision({ subject: hashJson(pD), judge: "judge-1", verdict: "AFFIRM", rationale: "vote " + i, issuedAt: now });
  }
  const rD = dD.propose(pD);
  rec.step("court-d", "judge-1", "publishes five AFFIRM decisions", "committed=" + rD.committed + " failure=" + String(rD.failure?.kind));
  rec.assert("repeated ballots from one judge identity count once", rD.committed === false, String(rD.failure?.detail));

  rec.find(
    "Policy is the authority boundary even under adversarial decisions",
    "EXTENSION",
    "Decisions are inert inputs. A malicious judge cannot change state directly; it must still pass Policy, which can require a threshold, restrict judges, and demand valid evidence. This is the intended effect of Decision != Authority.",
  );

  const invariants = [...rec.domainReport(), ...rec.invariantReport()];
  return {
    id: "Experiment 003",
    title: "Malicious Judge",
    problem:
      "An agent or group of agents attempts to manipulate judgment: one malicious judge, colluding judges, false evidence, contradictory evidence, and repeated ballots.",
    actors: ["agent-b (seeks recognition of outcome O1)", "judge-1..3 (authorized judges)", "judge-x, judge-y (colluding identities held by one operator)"],
    initialState: [
      "court domains with no outcome state",
      "policy judgment(threshold 2) over an allowed judge set, and judgment-with-evidence(threshold 1, minValidEvidence 1)",
      "a content-addressed verifier that reports VALID / INVALID / UNVERIFIED",
    ],
    actions: [
      "A: one judge affirms a 2-of-3 threshold",
      "B: two colluding identities affirm",
      "C: a well-formed but false evidence record supports an affirmation, then the record is tampered with",
      "D: one judge publishes five AFFIRM decisions",
    ],
    expected:
      "Separate protocol correctness (authority is enforced) from semantic correctness (whether the judged claim is true).",
    observed:
      "A single judge and repeated ballots were rejected; two colluding identities succeeded; well-formed false evidence was accepted while tampering was detected as INVALID.",
    failures: [
      "A 2-of-N threshold was satisfied by two ids controlled by one operator (Sybil / collusion).",
      "Policy admitted false evidence because provenance was valid; truth is out of scope for the kernel.",
    ],
    classification:
      "AGENT and EXTENSION issues, not kernel issues. Authority is enforced correctly; the residual problems are identity, judge selection, and evidence authenticity.",
    proposedChange:
      "No kernel change. Add extension guidance on judge eligibility, per-evidence-kind trust, and stake/identity requirements; track Sybil Resistance, Evidence Authenticity, and Decision Authority as open problems.",
    steps: rec.steps,
    assertions: rec.assertions,
    findings: rec.findings,
    invariants,
    conclusion:
      "The kernel keeps Decision separate from Authority and the policy boundary held in every scenario. What it cannot do is decide who is a real principal or whether evidence is true; those stay outside the kernel as extension and open research problems. " +
      (rec.allPassed() ? "All " + rec.assertions.length + " assertions held." : "At least one assertion FAILED."),
  };
}

export function reportMarkdown(): string {
  return renderMarkdown(runMaliciousJudge());
}

if (process.argv[1] && process.argv[1].endsWith("exp-003-malicious-judge.ts")) {
  process.stdout.write(reportMarkdown());
}
