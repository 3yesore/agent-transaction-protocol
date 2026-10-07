import { Domain } from "../kernel/domain.ts";
import { createVerifier } from "../kernel/evidence.ts";
import { customPolicy } from "../kernel/policy.ts";
import { Recorder, renderMarkdown, seed, type ExperimentReport } from "./harness.ts";
import { standardPolicies, standardPreconditions } from "../extensions/index.ts";
import { capabilityInvariant, capabilityKey, capabilityValue, updateCapabilityEffect, type CapabilityValue } from "../extensions/capability.ts";
import type { Effect, JsonValue, TransitionProposal } from "../kernel/types.ts";

interface ClaimValue {
  readonly id: string;
  readonly capability: string;
  readonly amount: number;
  readonly certainty: number;
  readonly status: string;
  readonly claimant: string;
}

export function runOverCommitment(): ExperimentReport {
  const rec = new Recorder();
  const now = 7000;
  let pid = 0;
  const verifier = createVerifier({ trustedProducers: ["agent-a", "agent-b", "agent-c"] });
  const CAP = capabilityKey("C", "unit");

  function claim(id: string, amount: number, certainty: number, claimant: string): ClaimValue {
    return { id, capability: CAP, amount, certainty, status: "ACTIVE", claimant };
  }

  function registry(withGuard: boolean) {
    const policies = standardPolicies();
    if (withGuard) {
      policies.register("overcommit-guard", (params) => {
        const p = params as unknown as { capability: string; amount: number; certainty?: number } | undefined;
        return customPolicy("overcommit-guard", (context) => {
          if (!p) return { ok: false, reason: "requires { capability, amount }" };
          const capDoc = context.snapshot.documents.get(p.capability);
          if (!capDoc) return { ok: false, reason: "missing capability " + p.capability };
          const total = (capDoc.value as unknown as CapabilityValue).total;
          let committed = 0;
          for (const doc of context.snapshot.documents.values()) {
            if (!doc.key.startsWith("claim/")) continue;
            const value = doc.value as unknown as ClaimValue;
            if (value.capability === p.capability && value.status === "ACTIVE") committed += value.amount * value.certainty;
          }
          const projected = committed + p.amount * (p.certainty ?? 1);
          if (projected > total) {
            return { ok: false, reason: "over-commitment: projected " + projected + " > total " + total };
          }
          return { ok: true, reason: "within capacity: projected " + projected + " <= total " + total };
        });
      });
    }
    return policies;
  }

  function domain(id: string, withGuard: boolean): Domain {
    return rec.track(
      new Domain({
        id,
        policies: registry(withGuard),
        verifier,
        preconditions: standardPreconditions(),
        clock: () => now,
        initialState: [seed(CAP, capabilityValue("unit", 100))],
      }),
    );
  }

  function proposal(
    domain: string,
    actor: string,
    effects: Effect[],
    opts: { policy?: { id: string; params?: JsonValue }; intent?: string } = {},
  ): TransitionProposal {
    return {
      id: "exp4-" + ++pid,
      domain,
      actor,
      intent: opts.intent ?? "transition",
      policy: opts.policy ?? { id: "allow-all" },
      preconditions: [],
      effects,
      evidence: [],
      parents: [],
      createdAt: now,
    };
  }

  function claimProposal(domain: string, value: ClaimValue, policy: { id: string; params?: JsonValue }) {
    return {
      id: "exp4-" + ++pid,
      domain,
      actor: value.claimant,
      intent: "record claim " + value.id,
      policy,
      preconditions: [],
      effects: [{ op: "create" as const, key: "claim/" + value.id, value: value as unknown as JsonValue }],
      evidence: [],
      parents: [],
      createdAt: now,
    };
  }

  const d1 = domain("capacity-1", true);
  const c1 = claim("C1", 80, 1, "agent-a");
  const r1 = d1.propose(claimProposal("capacity-1", c1, { id: "overcommit-guard", params: { capability: CAP, amount: 80 } }));
  rec.step("capacity-1", "agent-a", "claim 80 of 100 guaranteed units", "committed=" + r1.committed);

  const c2 = claim("C2", 60, 1, "agent-b");
  const guard = { id: "overcommit-guard", params: { capability: CAP, amount: 60 } };
  const r2 = d1.propose(claimProposal("capacity-1", c2, guard));
  rec.step("capacity-1", "agent-b", "claim 60 guaranteed units (guarded)", "committed=" + r2.committed + " failure=" + String(r2.failure?.kind));
  rec.assert("a guarded policy prohibits over-commitment", r1.committed === true && r2.committed === false && r2.failure?.kind === "POLICY", String(r2.failure?.detail));

  const capAfterReject = d1.document(CAP)!.value as unknown as CapabilityValue;
  rec.assert(
    "the rejected claim leaves capability accounting conserved and untouched",
    capabilityInvariant(capAfterReject).ok && capAfterReject.total === 100 && capAfterReject.available === 100,
    JSON.stringify(capAfterReject),
  );

  // A named precondition sees the prior state; guards on the RESULT must be policies over effects.
  const capDoc1 = d1.document(CAP)!;
  const inconsistent: CapabilityValue = { unit: "unit", total: 100, available: 10, reserved: 0, consumed: 0 };
  const rInconsistent = d1.propose(
    proposal("capacity-1", "agent-a", [updateCapabilityEffect(capDoc1, inconsistent)], {
      policy: { id: "capability-conserved-effect" },
      intent: "attempt a capability write that breaks conservation",
    }),
  );
  rec.step("capacity-1", "agent-a", "attempt a capability write that breaks conservation", "committed=" + rInconsistent.committed + " failure=" + String(rInconsistent.failure?.kind));
  rec.assert(
    "a resulting-state invariant is enforced by policy over the proposed effects",
    rInconsistent.committed === false && rInconsistent.failure?.kind === "POLICY",
    String(rInconsistent.failure?.detail),
  );
  rec.find(
    "Preconditions guard the prior state; policy guards the resulting state",
    "EXTENSION (schema/policy pattern)",
    "Named preconditions are evaluated against the current snapshot, so they cannot by themselves prevent a transition from writing an inconsistent value. The capability-conserved-effect policy inspects context.proposal.effects and rejects it, which is expressible with Policy alone. No postcondition primitive is justified.",
  );

  const r2b = d1.propose(claimProposal("capacity-1", c2, { id: "allow-all" }));
  rec.step("capacity-1", "agent-b", "same claim with the guard disabled", "committed=" + r2b.committed);
  const totalGuaranteed = 80 + 60;
  rec.assert(
    "without a guard the kernel accepts the over-committed claim as ordinary state",
    r2b.committed === true && totalGuaranteed > 100,
    "guaranteed claims total " + totalGuaranteed + " against a capability of 100",
  );
  rec.find(
    "Over-commitment is a policy choice, not a kernel primitive",
    "EXTENSION / economic layer",
    "The kernel records claims and capability state consistently; whether 140 units of guaranteed claims against 100 units of capacity is allowed is an economic decision expressed by Policy. No new primitive is needed to prohibit, price, or collateralize over-commitment.",
  );

  const d2 = domain("capacity-2", true);
  const p1 = d2.propose(claimProposal("capacity-2", claim("D1", 80, 1, "agent-a"), { id: "overcommit-guard", params: { capability: CAP, amount: 80, certainty: 1 } }));
  const p2 = d2.propose(claimProposal("capacity-2", claim("D2", 20, 0.5, "agent-c"), { id: "overcommit-guard", params: { capability: CAP, amount: 20, certainty: 0.5 } }));
  rec.step("capacity-2", "agent-c", "claim 20 units at certainty 0.5 (weighted by the guard)", "committed=" + p2.committed);
  rec.assert(
    "probabilistic commitments are expressible with a certainty-weighted policy",
    p1.committed === true && p2.committed === true,
    "guaranteed 80 + expected 10 = 90 <= 100",
  );
  rec.find(
    "Guaranteed and probabilistic commitments need no new primitive",
    "EXTENSION",
    "A certainty field plus a policy that weights expected value distinguishes guaranteed from probabilistic commitments. Policy can also refuse probability altogether by only counting certainty === 1.",
  );

  const invariants = [...rec.domainReport(), ...rec.invariantReport()];
  return {
    id: "Experiment 004",
    title: "Over-Commitment",
    problem:
      "A capability of 100 units is claimed twice: C1 claims 80 and C2 claims 60. Determine whether over-commitment is prohibited by the kernel, merely a risk-bearing state, or expressible through Policy.",
    actors: ["agent-a (claimant C1)", "agent-b (claimant C2)", "agent-c (probabilistic claimant)"],
    initialState: ["capability/C/unit = { total 100, available 100, reserved 0, consumed 0 }", "no claim state"],
    actions: [
      "Record C1 = 80 guaranteed units under an over-commit guard",
      "Attempt C2 = 60 guaranteed units under the guard, then repeat with the guard disabled",
      "In a second domain, record a guaranteed claim of 80 and a probabilistic claim of 20 at certainty 0.5 under a certainty-weighted guard",
    ],
    expected:
      "Determine whether prohibiting over-commitment requires a kernel primitive, or whether Policy and an extension schema suffice.",
    observed:
      "The guard rejected the second guaranteed claim with no state change, the capability stayed conserved, the unguarded attempt committed as ordinary state, and the certainty-weighted guard admitted the probabilistic claim.",
    failures: [
      "Without a guard the domains hold 140 units of guaranteed claims against 100 units of capacity (a risk-bearing state, not an inconsistency).",
    ],
    classification: "EXTENSION / economic layer. No kernel limitation demonstrated.",
    proposedChange:
      "No kernel change. Document over-commitment as a policy concern in the extension layer, and express collateral or reservation with the same State + Transition + Policy pattern.",
    steps: rec.steps,
    assertions: rec.assertions,
    findings: rec.findings,
    invariants,
    conclusion:
      "Capability accounting needs only conservation; the decision to permit, price, or prohibit over-commitment is Policy. " +
      (rec.allPassed() ? "All " + rec.assertions.length + " assertions held." : "At least one assertion FAILED."),
  };
}

export function reportMarkdown(): string {
  return renderMarkdown(runOverCommitment());
}

if (process.argv[1] && process.argv[1].endsWith("exp-004-overcommitment.ts")) {
  process.stdout.write(reportMarkdown());
}
