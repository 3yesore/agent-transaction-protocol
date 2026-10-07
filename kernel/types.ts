import type { Hash, JsonValue } from "./json.ts";

export type { Hash, JsonValue };

export type AgentId = string;
/** A state key, conventionally "<collection>/<local-id>". */
export type StateKey = string;

export interface StateDocument {
  readonly key: StateKey;
  readonly version: number;
  readonly value: JsonValue;
  readonly createdBy: Hash;
  readonly updatedBy: Hash;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface StateSnapshot {
  readonly domain: string;
  readonly documents: ReadonlyMap<StateKey, StateDocument>;
}

/**
 * A transition either creates a key or updates it with an expected version
 * (compare-and-swap). There is deliberately no delete operation: rewriting
 * history is not expressible (invariant I5).
 */
export type Effect =
  | { readonly op: "create"; readonly key: StateKey; readonly value: JsonValue }
  | {
      readonly op: "update";
      readonly key: StateKey;
      readonly value: JsonValue;
      readonly expectVersion: number;
    };

export type Precondition =
  | { readonly kind: "exists"; readonly key: StateKey }
  | { readonly kind: "notExists"; readonly key: StateKey }
  | { readonly kind: "version"; readonly key: StateKey; readonly expectVersion: number }
  | {
      readonly kind: "valueEquals";
      readonly key: StateKey;
      readonly path: readonly string[];
      readonly equals: JsonValue;
    }
  | { readonly kind: "named"; readonly id: string; readonly params?: JsonValue };

export interface PolicyRef {
  readonly id: string;
  readonly params?: JsonValue;
}

export interface TransitionProposal {
  /** Client-chosen unique id; replay of the same id is rejected. */
  readonly id: string;
  readonly domain: string;
  readonly actor: AgentId;
  readonly intent: string;
  readonly policy: PolicyRef;
  readonly preconditions: readonly Precondition[];
  readonly effects: readonly Effect[];
  /** Content addresses of evidence records already published to this domain. */
  readonly evidence: readonly Hash[];
  /** Content addresses of prior transitions this one causally depends on. */
  readonly parents: readonly Hash[];
  readonly createdAt: number;
  readonly meta?: JsonValue;
}

export type VerificationStatus = "VALID" | "INVALID" | "UNVERIFIED";

export interface EvidenceSignature {
  readonly scheme: string;
  readonly signer: AgentId;
  readonly value: string;
}

export interface EvidenceRecord {
  readonly id: Hash;
  readonly kind: string;
  readonly producer: AgentId;
  readonly domain: string;
  readonly payload: JsonValue;
  readonly refs: readonly Hash[];
  readonly about: Hash | null;
  readonly issuedAt: number;
  readonly signature: EvidenceSignature | null;
}

export type Verdict = "AFFIRM" | "DENY" | "ABSTAIN";

export interface DecisionRecord {
  readonly id: Hash;
  /** Content address of whatever is being judged (usually a proposal hash). */
  readonly subject: Hash;
  readonly judge: AgentId;
  readonly verdict: Verdict;
  readonly confidence: number | null;
  readonly rationale: string;
  readonly evidenceRefs: readonly Hash[];
  readonly issuedAt: number;
  readonly signature: EvidenceSignature | null;
}

export interface PolicyResult {
  readonly policyId: string;
  readonly effect: "ALLOW" | "REJECT";
  readonly reason: string;
  readonly details?: JsonValue;
}

export interface PolicyContext {
  readonly domain: string;
  readonly snapshot: StateSnapshot;
  readonly proposal: TransitionProposal;
  readonly proposalHash: Hash;
  /** Evidence records referenced by the proposal, in proposal order. */
  readonly evidence: readonly EvidenceRecord[];
  /** Decisions whose subject equals the proposal hash. */
  readonly decisions: readonly DecisionRecord[];
  readonly verifier: EvidenceVerifier;
  readonly now: number;
}

export interface Policy {
  readonly id: string;
  evaluate(context: PolicyContext): PolicyResult;
}

export interface EvidenceVerifier {
  readonly id: string;
  verify(evidence: EvidenceRecord): VerificationStatus;
}

export interface TransitionRecord {
  readonly seq: number;
  readonly domain: string;
  /** The transition's own identity, computable before state is recomputed. */
  readonly transitionId: Hash;
  readonly prev: Hash | null;
  readonly proposal: TransitionProposal;
  readonly proposalHash: Hash;
  readonly evidence: readonly EvidenceRecord[];
  readonly decisions: readonly DecisionRecord[];
  readonly policyResult: PolicyResult;
  readonly stateHashBefore: Hash;
  readonly stateHashAfter: Hash;
  readonly committedAt: number;
  readonly hash: Hash;
}

export type FailureKind =
  | "DOMAIN"
  | "SHAPE"
  | "DUPLICATE"
  | "EVIDENCE"
  | "PRECONDITION"
  | "POLICY_UNKNOWN"
  | "POLICY"
  | "VERSION";

/** A rejected or committed proposal attempt, retained for audit. */
export interface AttemptRecord {
  readonly proposalId: string;
  readonly actor: AgentId;
  readonly intent: string;
  readonly committed: boolean;
  readonly failureKind: FailureKind | null;
  readonly reason: string;
  readonly at: number;
}
