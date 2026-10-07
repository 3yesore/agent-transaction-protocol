import type { Domain } from "./domain.ts";
import { verifyChain } from "./ledger.ts";

export interface Invariant {
  readonly id: string;
  readonly title: string;
  readonly statement: string;
}

/** The eight core invariants of SPEC.md section 13. */
export const INVARIANTS: readonly Invariant[] = [
  { id: "I1", title: "No Direct State Mutation", statement: "All authoritative state changes occur through valid transitions." },
  { id: "I2", title: "State Changes Are Traceable", statement: "A state change is attributable to a transition and its inputs." },
  { id: "I3", title: "Decision Does Not Imply Authority", statement: "A judgment has authority only through Policy." },
  { id: "I4", title: "Evidence Does Not Equal Truth", statement: "Evidence is an input to epistemic processes, not truth." },
  { id: "I5", title: "History Is Not Silently Deleted", statement: "Invalidation, reversal, amendment, and dispute create new state." },
  { id: "I6", title: "Execution Is Not the Kernel", statement: "Internal execution stays outside the protocol." },
  { id: "I7", title: "Policy Defines Authority", statement: "The protocol boundary is valid transitions and their policy." },
  { id: "I8", title: "Minimality", statement: "Do not add a primitive when existing primitives express the behavior." },
];

export type InvariantStatus = "PASS" | "FAIL" | "UNCHECKED";

export interface InvariantReport {
  readonly id: string;
  readonly title: string;
  readonly status: InvariantStatus;
  readonly detail: string;
}

/**
 * Runtime-checkable invariants. I4, I6, and I8 are properties of the design and
 * of human review rather than of a single ledger, so they are reported as
 * UNCHECKED with an explanation instead of being silently marked PASS.
 */
export function checkInvariants(domain: Domain): InvariantReport[] {
  const reports: InvariantReport[] = [];

  const replayed = domain.replay();
  reports.push({
    id: "I1",
    title: "No Direct State Mutation",
    status: replayed.ok ? "PASS" : "FAIL",
    detail: replayed.ok
      ? "state is exactly reproducible from the initial snapshot and committed transitions"
      : String(replayed.reason),
  });

  const chain = verifyChain(domain.ledger);
  const traceable =
    chain.ok &&
    domain.ledger.every((r) => r.proposalHash.length > 0 && r.transitionId.length > 0 && r.evidence.length === r.proposal.evidence.length);
  reports.push({
    id: "I2",
    title: "State Changes Are Traceable",
    status: traceable ? "PASS" : "FAIL",
    detail: traceable ? "every record carries a transition id, proposal hash, and its evidence inputs" : String(chain.reason ?? "traceability check failed"),
  });

  const noUnbackedAuthority = domain.ledger.every((r) => r.policyResult.effect === "ALLOW");
  reports.push({
    id: "I3",
    title: "Decision Does Not Imply Authority",
    status: noUnbackedAuthority ? "PASS" : "FAIL",
    detail: noUnbackedAuthority
      ? "no committed transition lacks a Policy ALLOW, regardless of attached decisions"
      : "a transition committed without a Policy ALLOW",
  });

  reports.push({
    id: "I4",
    title: "Evidence Does Not Equal Truth",
    status: "UNCHECKED",
    detail:
      "structural, not ledger-checkable: the verifier API returns VALID/INVALID/UNVERIFIED and has no truth claim; reviewed by design",
  });

  const effectsAreCreateOrUpdate = domain.ledger.every((r) => r.proposal.effects.every((e) => e.op === "create" || e.op === "update"));
  const seqMonotonic = domain.ledger.every((r, i) => r.seq === i + 1);
  reports.push({
    id: "I5",
    title: "History Is Not Silently Deleted",
    status: effectsAreCreateOrUpdate && seqMonotonic && chain.ok ? "PASS" : "FAIL",
    detail:
      effectsAreCreateOrUpdate && seqMonotonic && chain.ok
        ? "no delete effect exists; the ledger is append-only and hash-linked"
        : "history was rewritten or the chain is broken",
  });

  reports.push({
    id: "I6",
    title: "Execution Is Not the Kernel",
    status: "UNCHECKED",
    detail: "structural: the kernel exposes no execution concept; only effects and evidence cross the boundary",
  });

  const policyBounded = domain.ledger.every((r) => typeof r.policyResult.policyId === "string" && r.policyResult.policyId.length > 0);
  reports.push({
    id: "I7",
    title: "Policy Defines Authority",
    status: policyBounded ? "PASS" : "FAIL",
    detail: policyBounded ? "every committed transition names the policy that allowed it" : "a transition lacks a policy identity",
  });

  reports.push({
    id: "I8",
    title: "Minimality",
    status: "UNCHECKED",
    detail: "a research judgement, not a runtime property; see proposals/ and docs/open-problems.md",
  });

  return reports;
}
