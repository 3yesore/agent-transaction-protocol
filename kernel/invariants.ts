import { applyEffects, snapshotFrom } from "./state.ts";
import { verifyChain } from "./ledger.ts";
import { AUTHORITY_POLICY_ID, isPolicyKey, policyIdOf, policyKey } from "./policy.ts";
import type { Domain } from "./domain.ts";

export interface Invariant {
  readonly id: string;
  readonly title: string;
  readonly statement: string;
}

/** The ten invariants of the v0.2 candidate (SPEC-v0.2 section 4). */
export const INVARIANTS: readonly Invariant[] = [
  { id: "I1", title: "State Transition Authority", statement: "No protocol-relevant state change without authorization under applicable Policy." },
  { id: "I2", title: "Evidence Non-Authority", statement: "Evidence does not possess authority by itself; Policy determines its effect." },
  { id: "I3", title: "Domain-Scoped Authority", statement: "Authority recognized by one State Domain does not automatically extend to another." },
  { id: "I4", title: "Historical Integrity", statement: "Past state and transition history must not be silently rewritten." },
  { id: "I5", title: "Local Recognition", statement: "Claims from one Domain acquire effect in another only through destination Policy." },
  { id: "I6", title: "Judgment Is Not Authority", statement: "A Decision is Evidence and cannot authorize a Transition independently of Policy." },
  { id: "I7", title: "Conflict Is Not Automatically a Block", statement: "Conflict does not by itself determine whether further transitions are allowed." },
  { id: "I8", title: "Atomicity Is Domain-Scoped", statement: "Atomicity applies only within a State Domain; cross-domain atomicity is coordination." },
  { id: "I9", title: "Failure Does Not Imply Rollback", statement: "External failure does not require rollback; it may become Evidence." },
  { id: "I10", title: "Policy Is State", statement: "Policy is protocol State and can evolve only through an authorized Transition." },
];

export type InvariantStatus = "PASS" | "FAIL" | "UNCHECKED";

export interface InvariantReport {
  readonly id: string;
  readonly title: string;
  readonly status: InvariantStatus;
  readonly detail: string;
}

interface I10Check {
  readonly status: InvariantStatus;
  readonly detail: string;
}

/**
 * I10 is mechanically checkable, and this is the check: for every committed
 * transition that touches a policy document, the authorizing policy must be
 * that same document (self-amendment) or policy/authority, and the recorded
 * policy version must equal the PRE-STATE version of the document.
 */
function checkPolicyIsState(domain: Domain): I10Check {
  let snapshot = snapshotFrom(domain.id, domain.genesis);
  let amendments = 0;
  for (const record of domain.ledger) {
    const targets = record.proposal.effects.filter((e) => isPolicyKey(e.key)).map((e) => policyIdOf(e.key));
    for (const target of targets) {
      amendments++;
      const authorizer = record.policyResult.policyId;
      if (authorizer !== target && authorizer !== AUTHORITY_POLICY_ID) {
        return { status: "FAIL", detail: "seq " + record.seq + " amended policy/" + target + " authorized by " + authorizer };
      }
      if (authorizer === target) {
        const existing = snapshot.documents.get(policyKey(target));
        if (!existing) {
          return { status: "FAIL", detail: "seq " + record.seq + " self-amended a policy that did not exist in the pre-state" };
        }
        if (existing.version !== record.policyResult.policyVersion) {
          return {
            status: "FAIL",
            detail: "seq " + record.seq + " recorded policy version " + record.policyResult.policyVersion + " but the pre-state version was " + existing.version,
          };
        }
      }
    }
    const applied = applyEffects(snapshot, record.proposal.effects, record.transitionId, record.committedAt);
    if (!applied.ok) return { status: "FAIL", detail: "replay failed at seq " + record.seq + ": " + applied.detail };
    snapshot = applied.state;
  }
  return {
    status: "PASS",
    detail: amendments === 0
      ? "no policy amendment occurred; every policy document in force originates in domain genesis"
      : amendments + " policy amendment(s) were authorized by the policy itself or by policy/" + AUTHORITY_POLICY_ID + " with a matching pre-state version",
  };
}

export function checkInvariants(domain: Domain): InvariantReport[] {
  const chain = verifyChain(domain.ledger);
  const replayed = domain.replay();
  const reports: InvariantReport[] = [];

  const authorized = domain.ledger.every(
    (r) => r.policyResult.effect === "ALLOW" && typeof r.policyResult.policyId === "string" && r.policyResult.policyId.length > 0,
  );
  reports.push({
    id: "I1",
    title: "State Transition Authority",
    status: authorized ? "PASS" : "FAIL",
    detail: authorized
      ? "every committed transition names the policy document that authorized it"
      : "a transition committed without a named Policy ALLOW",
  });

  reports.push({
    id: "I2",
    title: "Evidence Non-Authority",
    status: "UNCHECKED",
    detail: "structural: the kernel exposes no API by which Evidence can change state except as input to Policy",
  });

  const confined = domain.ledger.every((r) => r.domain === domain.id) && chain.ok;
  reports.push({
    id: "I3",
    title: "Domain-Scoped Authority",
    status: confined ? "PASS" : "FAIL",
    detail: confined
      ? "every record in this ledger belongs to this Domain; the pipeline rejects proposals naming another Domain"
      : String(chain.reason ?? "cross-domain record found"),
  });

  const noDelete = domain.ledger.every((r) => r.proposal.effects.every((e) => e.op === "create" || e.op === "update"));
  const seqMonotonic = domain.ledger.every((r, i) => r.seq === i + 1);
  reports.push({
    id: "I4",
    title: "Historical Integrity",
    status: noDelete && seqMonotonic && chain.ok ? "PASS" : "FAIL",
    detail: noDelete && seqMonotonic && chain.ok
      ? "no delete effect exists; the ledger is append-only and hash-linked"
      : "history was rewritten or the chain is broken",
  });

  reports.push({
    id: "I5",
    title: "Local Recognition",
    status: "UNCHECKED",
    detail: "cross-Domain recognition is a property of a pair of Domains; it is exercised by the review experiments, not by one ledger",
  });

  reports.push({
    id: "I6",
    title: "Judgment Is Not Authority",
    status: authorized ? "PASS" : "FAIL",
    detail: authorized
      ? "judgments are Evidence (kind \"decision\") and reach state only through Policy"
      : "a judgment reached state without Policy",
  });

  reports.push({
    id: "I7",
    title: "Conflict Is Not Automatically a Block",
    status: "UNCHECKED",
    detail: "a counterfactual about what a Domain may do next; exercised by review case 009",
  });

  reports.push({
    id: "I8",
    title: "Atomicity Is Domain-Scoped",
    status: replayed.ok && confined ? "PASS" : "FAIL",
    detail: replayed.ok && confined
      ? "state is exactly reproducible from genesis plus single-domain transitions; no transition spans two Domains"
      : String(replayed.reason ?? "domain confinement failed"),
  });

  reports.push({
    id: "I9",
    title: "Failure Does Not Imply Rollback",
    status: "UNCHECKED",
    detail: "semantic: the kernel has no rollback operation at all, so failure can only become Evidence; exercised by review cases 002 and 003",
  });

  const policyState = checkPolicyIsState(domain);
  reports.push({ id: "I10", title: "Policy Is State", status: policyState.status, detail: policyState.detail });

  return reports;
}
