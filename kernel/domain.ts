import { hashJson } from "./json.ts";
import { createEvidence, type EvidenceInput } from "./evidence.ts";
import { recordHash, verifyChain, type ChainCheck, type TransitionRecordBase } from "./ledger.ts";
import { AUTHORITY_POLICY_ID, PolicyInterpreter, isPolicyKey, policyIdOf, policyKey, resolvePolicy } from "./policy.ts";
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
  /** Owns the rule vocabulary; the policy documents themselves live in state. */
  readonly interpreter: PolicyInterpreter;
  readonly verifier: EvidenceVerifier;
  readonly preconditions?: PreconditionResolver;
  readonly clock?: () => number;
  /**
   * Genesis state. Policy documents MUST be seeded here: a policy can only be
   * created at genesis or by policy/authority (see I10), never by a bare
   * transition.
   */
  readonly initialState?: readonly StateDocument[];
}

export interface Failure {
  readonly kind: FailureKind;
  readonly detail: string;
}

export interface ProposeResult {
  readonly committed: boolean;
  readonly policyResult: PolicyResult | null;
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
  if (!proposal.policy || typeof proposal.policy.id !== "string" || proposal.policy.id.length === 0) {
    return "proposal.policy.id must be a non-empty string naming a policy document";
  }
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
 * A State Domain is the authority and atomicity scope of the v0.2 kernel.
 *
 * It is a DEFINED kernel term, not a primitive: I3 (domain-scoped authority),
 * I5 (local recognition), and I8 (domain-scoped atomicity) are all statements
 * about a Domain. A Domain owns one ledger and one state space, and no
 * transition spans two domains.
 */
export class Domain {
  readonly id: string;
  #interpreter: PolicyInterpreter;
  #verifier: EvidenceVerifier;
  #preconditions?: PreconditionResolver;
  #clock: () => number;
  #genesis: readonly StateDocument[];
  #snapshot: StateSnapshot;
  #ledger: TransitionRecord[] = [];
  #evidence = new Map<Hash, EvidenceRecord>();
  #attempts: AttemptRecord[] = [];
  #seen = new Set<string>();

  constructor(config: DomainConfig) {
    this.id = config.id;
    this.#interpreter = config.interpreter;
    this.#verifier = config.verifier;
    this.#preconditions = config.preconditions;
    this.#clock = config.clock ?? (() => Date.now());
    this.#genesis = config.initialState ?? [];
    this.#snapshot = config.initialState ? snapshotFrom(this.id, this.#genesis) : emptySnapshot(this.id);
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
  get genesis(): readonly StateDocument[] {
    return this.#genesis;
  }
  get verifier(): EvidenceVerifier {
    return this.#verifier;
  }
  get interpreter(): PolicyInterpreter {
    return this.#interpreter;
  }
  now(): number {
    return this.#clock();
  }
  document(key: StateKey): StateDocument | undefined {
    return this.#snapshot.documents.get(key);
  }
  policyDocument(id: string): StateDocument | undefined {
    return this.#snapshot.documents.get(policyKey(id));
  }

  publishEvidence(input: EvidenceInput): EvidenceRecord {
    const record = createEvidence(input);
    this.#evidence.set(record.id, record);
    return record;
  }

  /** Evidence is the only epistemic store in v0.2; judgments are a kind of it. */
  evidenceLog(): EvidenceRecord[] {
    return [...this.#evidence.values()];
  }

  evidenceOfKind(kind: string): EvidenceRecord[] {
    return this.evidenceLog().filter((e) => e.kind === kind);
  }

  evidenceAbout(subject: Hash): EvidenceRecord[] {
    return this.evidenceLog().filter((e) => e.about === subject);
  }

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

    const referenced: EvidenceRecord[] = [];
    for (const id of proposal.evidence) {
      const record = this.#evidence.get(id);
      if (!record) return this.#fail(proposal, "EVIDENCE", "unknown evidence reference: " + id, now);
      referenced.push(record);
    }
    // A proposal cannot hide evidence addressed to it.
    const addressed = this.evidenceAbout(proposalHash);
    const byId = new Map<Hash, EvidenceRecord>();
    for (const record of [...referenced, ...addressed]) byId.set(record.id, record);
    const evidence = [...byId.values()];

    const resolution = resolvePolicy(this.#snapshot, this.#interpreter, proposal.policy, now);
    if (!resolution.ok) {
      return this.#fail(proposal, resolution.kind, resolution.reason, now);
    }

    const amendmentFailure = this.#checkPolicyAmendment(proposal);
    if (amendmentFailure) return this.#fail(proposal, "POLICY_AMENDMENT", amendmentFailure, now);

    const context: PolicyContext = {
      domain: this.id,
      snapshot: this.#snapshot,
      proposal,
      proposalHash,
      evidence,
      verifier: this.#verifier,
      now,
      policy: resolution.document,
    };

    if (proposal.policy.id !== AUTHORITY_POLICY_ID) {
      const selection = this.#interpreter.evaluateSelection(context);
      if (!selection.ok) return this.#fail(proposal, "POLICY_SELECTION", selection.reason, now);
    }

    const preconditionFailure = checkPreconditions(this.#snapshot, proposal.preconditions, this.#preconditions);
    if (preconditionFailure) {
      return this.#fail(proposal, "PRECONDITION", preconditionFailure.detail, now);
    }

    const policyResult = this.#interpreter.evaluate(resolution.document, context);
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
      policyResult,
      stateHashBefore,
      stateHashAfter,
      committedAt: now,
    };
    const record: TransitionRecord = {
      seq: base.seq,
      domain: base.domain,
      transitionId: base.transitionId,
      prev: base.prev,
      proposal: base.proposal,
      proposalHash: base.proposalHash,
      evidence: base.evidence,
      policyResult: base.policyResult,
      stateHashBefore: base.stateHashBefore,
      stateHashAfter: base.stateHashAfter,
      committedAt: base.committedAt,
      hash: recordHash(base),
    };

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

  /**
   * I10 guard. A policy document may only be amended by ITSELF (with a version
   * pin) or by policy/authority, and it can never be created by a bare
   * transition - genesis only.
   */
  #checkPolicyAmendment(proposal: TransitionProposal): string | null {
    for (const effect of proposal.effects) {
      if (!isPolicyKey(effect.key)) continue;
      const target = policyIdOf(effect.key);
      if (proposal.policy.id !== target && proposal.policy.id !== AUTHORITY_POLICY_ID) {
        return "policy/" + target + " may only be amended by policy/" + target + " or policy/" + AUTHORITY_POLICY_ID;
      }
      const exists = this.#snapshot.documents.has(effect.key);
      if (!exists && proposal.policy.id === target) {
        return "policy/" + target + " does not exist; a policy can only be created at domain genesis or by policy/" + AUTHORITY_POLICY_ID;
      }
    }
    return null;
  }

  #fail(
    proposal: TransitionProposal,
    kind: FailureKind,
    detail: string,
    at: number,
    policyResult?: PolicyResult,
  ): ProposeResult {
    this.#attempts.push({
      proposalId: typeof proposal?.id === "string" ? proposal.id : "<malformed>",
      actor: typeof proposal?.actor === "string" ? proposal.actor : "<unknown>",
      intent: typeof proposal?.intent === "string" ? proposal.intent : "<none>",
      committed: false,
      failureKind: kind,
      reason: detail,
      at,
    });
    return { committed: false, policyResult: policyResult ?? null, failure: { kind, detail } };
  }

  replay(): ReplayResult {
    let snapshot = snapshotFrom(this.id, this.#genesis);
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

  verify(): ChainCheck {
    const chain = verifyChain(this.#ledger);
    if (!chain.ok) return chain;
    for (const record of this.#ledger) {
      if (record.policyResult.effect !== "ALLOW") {
        return { ok: false, reason: "seq " + record.seq + " committed without a policy ALLOW" };
      }
      if (record.domain !== this.id) {
        return { ok: false, reason: "seq " + record.seq + " belongs to domain " + record.domain };
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
