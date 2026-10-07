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
 * history is not expressible (v0.2 I4).
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

/**
 * A policy reference names a policy DOCUMENT held in protocol state
 * (key "policy/<id>"). The proposal does not carry policy parameters: those
 * live in the policy document, which only the domain can amend. See I10.
 */
export interface PolicyRef {
  readonly id: string;
  /** Optional pin to the state version of the policy document. */
  readonly expectedVersion?: number;
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
  /** Content addresses of evidence the proposer wishes to rely on. */
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

/**
 * Evidence is the ONLY epistemic primitive in v0.2.
 *
 * A judgment ("Decision") is not a kernel primitive; it is an Evidence schema
 * with kind "decision". Evidence has no authority by itself (I2).
 */
export interface EvidenceRecord {
  readonly id: Hash;
  /** Schema discriminator, e.g. "decision", "delivery-receipt", "trace". */
  readonly kind: string;
  readonly producer: AgentId;
  readonly domain: string;
  readonly payload: JsonValue;
  readonly refs: readonly Hash[];
  /** Content address of whatever this evidence is about (often a proposal hash). */
  readonly about: Hash | null;
  readonly issuedAt: number;
  readonly signature: EvidenceSignature | null;
}

/** One declarative authorization rule. The rule vocabulary is interpreter code. */
export interface PolicyRule {
  readonly type: string;
  readonly params?: JsonValue;
}

/**
 * Policy is State (I10). The document is stored at "policy/<id>"; its STATE
 * VERSION is the authoritative policy version, because it advances only
 * through an authorized Transition.
 */
export interface PolicyDocument {
  readonly id: string;
  readonly description?: string;
  readonly validFrom?: number | null;
  readonly validUntil?: number | null;
  readonly rules: readonly PolicyRule[];
}

export interface PolicyResult {
  readonly policyId: string;
  /** State version of the policy document that produced this result. */
  readonly policyVersion: number;
  readonly effect: "ALLOW" | "REJECT";
  readonly reason: string;
  readonly details?: JsonValue;
}

export interface PolicyContext {
  readonly domain: string;
  readonly snapshot: StateSnapshot;
  readonly proposal: TransitionProposal;
  readonly proposalHash: Hash;
  /**
   * Referenced evidence PLUS every evidence record addressed to this proposal
   * (about === proposalHash). A proposal cannot hide evidence aimed at it.
   */
  readonly evidence: readonly EvidenceRecord[];
  readonly verifier: EvidenceVerifier;
  readonly now: number;
  readonly policy: PolicyDocument;
}

export interface EvidenceVerifier {
  readonly id: string;
  verify(evidence: EvidenceRecord): VerificationStatus;
}

export interface TransitionRecord {
  readonly seq: number;
  readonly domain: string;
  readonly transitionId: Hash;
  readonly prev: Hash | null;
  readonly proposal: TransitionProposal;
  readonly proposalHash: Hash;
  readonly evidence: readonly EvidenceRecord[];
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
  | "POLICY_AMENDMENT"
  | "POLICY_SELECTION"
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
