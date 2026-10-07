import { hashJson } from "./json.ts";
import { createDecision, decisionsForSubject, type DecisionInput } from "./decision.ts";
import { createEvidence, type EvidenceInput } from "./evidence.ts";
import { recordHash, verifyChain, type ChainCheck, type TransitionRecordBase } from "./ledger.ts";
import { PolicyRegistry } from "./policy.ts";
import {
  applyEffects,
  checkPreconditions,
  emptySnapshot,
  snapshotFrom,
  stateHash,
  type PreconditionResolver,
} from "./state.ts";
import type {
  AttemptRecord,
  DecisionRecord,
  EvidenceRecord,
  EvidenceVerifier,
  FailureKind,
  Hash,
  PolicyContext,
  PolicyResult,
  StateDocument,
  StateKey,
  StateSnapshot,
  TransitionProposal,
  TransitionRecord,
} from "./types.ts";

export interface DomainConfig {
  readonly id: string;
  readonly policies: PolicyRegistry;
  readonly verifier: EvidenceVerifier;
  readonly preconditions?: PreconditionResolver;
  /** Injected clock; experiments use it to make time deterministic. */
  readonly clock?: () => number;
  readonly initialState?: readonly StateDocument[];
}

export interface Failure {
  readonly kind: FailureKind;
  readonly detail: string;
}

export interface ProposeResult {
  readonly committed: boolean;
  readonly policyResult: PolicyResult;
  readonly record?: TransitionRecord;
  readonly failure?: Failure;
}

export interface ReplayResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly state: StateSnapshot;
}

function validateProposal(proposal: TransitionProposal): string | null {
  if (!proposal || typeof proposal !== "object") return "proposal must be an object";
  if (typeof proposal.id !== "string" || proposal.id.length === 0) return "proposal.id must be a non-empty string";
  if (typeof proposal.domain !== "string" || proposal.domain.length === 0) return "proposal.domain must be a non-empty string";
  if (typeof proposal.actor !== "string" || proposal.actor.length === 0) return "proposal.actor must be a non-empty string";
  if (typeof proposal.intent !== "string") return "proposal.intent must be a string";
  if (!proposal.policy || typeof proposal.policy.id !== "string") return "proposal.policy.id must be a string";
  if (!Array.isArray(proposal.preconditions)) return "proposal.preconditions must be an array";
  if (!Array.isArray(proposal.effects)) return "proposal.effects must be an array";
  if (!Array.isArray(proposal.evidence)) return "proposal.evidence must be an array";
  if (!Array.isArray(proposal.parents)) return "proposal.parents must be an array";
  if (!Number.isInteger(proposal.createdAt)) return "proposal.createdAt must be an integer";
  for (const effect of proposal.effects) {
    if (!effect || typeof effect.key !== "string" || effect.key.length === 0) return "each effect needs a key";
    if (effect.op !== "create" && effect.op !== "update") return "effect.op must be create or update";
    if (effect.op === "update" && !Number.isInteger(effect.expectVersion)) {
      return "update effects need an integer expectVersion";
    }
  }
  for (const precondition of proposal.preconditions) {
    if (!precondition || typeof precondition.kind !== "string") return "each precondition needs a kind";
  }
  return null;
}

/**
 * A Domain is one independently governed ATP state space with its own ledger.
 *
 * The kernel guarantees intra-domain atomicity: a proposal either commits every
 * effect and appends exactly one transition record, or it changes nothing.
 * Cross-domain atomicity is deliberately NOT provided here; see
 * experiments/exp-001.
 */
export class Domain {
  readonly id: string;
  #policies: PolicyRegistry;
  #verifier: EvidenceVerifier;
  #preconditions?: PreconditionResolver;
  #clock: () => number;
  #initial: readonly StateDocument[];
  #snapshot: StateSnapshot;
  #ledger: TransitionRecord[] = [];
  #evidence = new Map<Hash, EvidenceRecord>();
  #decisions = new Map<Hash, DecisionRecord>();
  #attempts: AttemptRecord[] = [];
  #seen = new Set<string>();

  constructor(config: DomainConfig) {
    this.id = config.id;
    this.#policies = config.policies;
    this.#verifier = config.verifier;
    this.#preconditions = config.preconditions;
    this.#clock = config.clock ?? (() => Date.now());
    this.#initial = config.initialState ?? [];
    this.#snapshot = config.initialState ? snapshotFrom(this.id, config.initialState) : emptySnapshot(this.id);
  }

  get state(): StateSnapshot {
    return this.#snapshot;
  }

  get ledger(): readonly TransitionRecord[] {
    return this.#ledger;
  }

  get attempts(): readonly AttemptRecord[] {
    return this.#attempts;
  }

  get head(): TransitionRecord | null {
    return this.#ledger.length ? this.#ledger[this.#ledger.length - 1] : null;
  }

  get verifier(): EvidenceVerifier {
    return this.#verifier;
  }

  get policies(): PolicyRegistry {
    return this.#policies;
  }

  now(): number {
    return this.#clock();
  }

  document(key: StateKey): StateDocument | undefined {
    return this.#snapshot.documents.get(key);
  }

  publishEvidence(input: EvidenceInput): EvidenceRecord {
    const record = createEvidence(input);
    this.#evidence.set(record.id, record);
    return record;
  }

  publishDecision(input: DecisionInput): DecisionRecord {
    const record = createDecision(input);
    this.#decisions.set(record.id, record);
    return record;
  }

  evidenceLog(): EvidenceRecord[] {
    return [...this.#evidence.values()];
  }

  decisionLog(): DecisionRecord[] {
    return [...this.#decisions.values()];
  }

  decisionsAbout(subject: Hash): DecisionRecord[] {
    return decisionsForSubject(this.#decisions.values(), subject);
  }

  /**
   * Full pipeline: shape -> domain -> replay guard -> evidence -> decisions ->
   * policy -> effects -> ledger append.
   */
  propose(proposal: TransitionProposal): ProposeResult {
    const now = this.#clock();
    const shapeError = validateProposal(proposal);
    if (shapeError) return this.#fail(proposal, "SHAPE", shapeError, now);
    if (proposal.domain !== this.id) {
      return this.#fail(proposal, "DOMAIN", "proposal targets domain " + proposal.domain + " but this domain is " + this.id, now);
    }
    if (this.#seen.has(proposal.id)) {
      return this.#fail(proposal, "DUPLICATE", "proposal id already committed: " + proposal.id, now);
    }

    const proposalHash = hashJson(proposal);
    const evidence: EvidenceRecord[] = [];
    for (const id of proposal.evidence) {
      const record = this.#evidence.get(id);
      if (!record) return this.#fail(proposal, "EVIDENCE", "unknown evidence reference: " + id, now);
      evidence.push(record);
    }
    const decisions = decisionsForSubject(this.#decisions.values(), proposalHash);

    const policy = this.#policies.create(proposal.policy.id, proposal.policy.params);
    if (!policy) {
      return this.#fail(proposal, "POLICY_UNKNOWN", "no policy registered under id " + proposal.policy.id, now);
    }

    const preconditionFailure = checkPreconditions(this.#snapshot, proposal.preconditions, this.#preconditions);
    if (preconditionFailure) {
      return this.#fail(proposal, "PRECONDITION", preconditionFailure.detail, now);
    }

    const context: PolicyContext = {
      domain: this.id,
      snapshot: this.#snapshot,
      proposal,
      proposalHash,
      evidence,
      decisions,
      verifier: this.#verifier,
      now,
    };
    const policyResult = policy.evaluate(context);
    if (policyResult.effect !== "ALLOW") {
      return this.#fail(proposal, "POLICY", policyResult.reason, now, policyResult);
    }

    const seq = this.#ledger.length + 1;
    const prev = this.head ? this.head.hash : null;
    const transitionId = hashJson({ domain: this.id, seq, prev, proposalHash });
    const applied = applyEffects(this.#snapshot, proposal.effects, transitionId, now);
    if (!applied.ok) {
      return this.#fail(proposal, applied.kind, applied.detail, now, policyResult);
    }

    const stateHashBefore = stateHash(this.#snapshot);
    const stateHashAfter = stateHash(applied.state);
    const base: TransitionRecordBase = {
      seq,
      domain: this.id,
      transitionId,
      prev,
      proposal,
      proposalHash,
      evidence,
      decisions,
      policyResult,
      stateHashBefore,
      stateHashAfter,
      committedAt: now,
    };
    const record: TransitionRecord = { seq: base.seq, domain: base.domain, transitionId: base.transitionId, prev: base.prev, proposal: base.proposal, proposalHash: base.proposalHash, evidence: base.evidence, decisions: base.decisions, policyResult: base.policyResult, stateHashBefore: base.stateHashBefore, stateHashAfter: base.stateHashAfter, committedAt: base.committedAt, hash: recordHash(base) };

    this.#ledger.push(record);
    this.#snapshot = applied.state;
    this.#seen.add(proposal.id);
    this.#attempts.push({
      proposalId: proposal.id,
      actor: proposal.actor,
      intent: proposal.intent,
      committed: true,
      failureKind: null,
      reason: "committed",
      at: now,
    });
    return { committed: true, policyResult, record };
  }

  #fail(
    proposal: TransitionProposal,
    kind: FailureKind,
    detail: string,
    at: number,
    policyResult?: PolicyResult,
  ): ProposeResult {
    const result: PolicyResult =
      policyResult ?? { policyId: proposal?.policy?.id ?? "unknown", effect: "REJECT", reason: detail };
    this.#attempts.push({
      proposalId: typeof proposal?.id === "string" ? proposal.id : "<malformed>",
      actor: typeof proposal?.actor === "string" ? proposal.actor : "<unknown>",
      intent: typeof proposal?.intent === "string" ? proposal.intent : "<none>",
      committed: false,
      failureKind: kind,
      reason: detail,
      at,
    });
    return { committed: false, policyResult: result, failure: { kind, detail } };
  }

  /** Recomputes state from the initial snapshot and the ledger alone (I1, I2). */
  replay(): ReplayResult {
    let snapshot = snapshotFrom(this.id, this.#initial);
    for (const record of this.#ledger) {
      const before = stateHash(snapshot);
      if (before !== record.stateHashBefore) {
        return { ok: false, reason: "stateHashBefore mismatch at seq " + record.seq, state: snapshot };
      }
      const applied = applyEffects(snapshot, record.proposal.effects, record.transitionId, record.committedAt);
      if (!applied.ok) {
        return { ok: false, reason: "replay failed at seq " + record.seq + ": " + applied.detail, state: snapshot };
      }
      snapshot = applied.state;
      if (stateHash(snapshot) !== record.stateHashAfter) {
        return { ok: false, reason: "stateHashAfter mismatch at seq " + record.seq, state: snapshot };
      }
    }
    return { ok: true, state: snapshot };
  }

  /** Structural verification of the whole domain. */
  verify(): ChainCheck {
    const chain = verifyChain(this.#ledger);
    if (!chain.ok) return chain;
    for (const record of this.#ledger) {
      if (record.policyResult.effect !== "ALLOW") {
        return { ok: false, reason: "seq " + record.seq + " committed without a policy ALLOW" };
      }
    }
    const replayed = this.replay();
    if (!replayed.ok) return { ok: false, reason: replayed.reason };
    if (stateHash(replayed.state) !== stateHash(this.#snapshot)) {
      return { ok: false, reason: "live state diverges from replayed state" };
    }
    return { ok: true };
  }
}
