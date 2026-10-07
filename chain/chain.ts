import { Domain } from "../kernel/domain.ts";
import { createIntegrityVerifier } from "../kernel/evidence.ts";
import { hashJson } from "../kernel/json.ts";
import { policyDocument, type PolicyInterpreter } from "../kernel/policy.ts";
import type { Hash, JsonValue, PolicyDocument, StateDocument, TransitionProposal } from "../kernel/types.ts";
import { genesisPolicy, standardInterpreter, standardPreconditions } from "../extensions/index.ts";
import type { Candidate, Selector } from "./selectors.ts";

/**
 * A single-writer chain skeleton.
 *
 * It is deliberately thin, because the reduction work says the protocol content
 * is not here. What it adds over a bare Domain is exactly two things the freeze
 * declares optional: a canonical state root and a selection rule.
 *
 * There is no consensus. One writer submits; candidates are evaluated against the
 * current state WITHOUT mutating it, and the selector picks one. Everything a real
 * chain would add - networking, ordering, quorum, finality - is absent on purpose.
 */
export interface Block {
  readonly index: number;
  readonly parentRoot: Hash;
  readonly proposalId: string;
  readonly proposalHash: Hash;
  readonly actor: string;
  readonly stateRoot: Hash;
  readonly selector: string;
  readonly rationale: string;
}

export interface ChainConfig {
  readonly id: string;
  /** The semantics in force at genesis. Held in state as policy/guard. */
  readonly semantics: PolicyDocument;
  readonly selector: Selector;
  readonly interpreter?: PolicyInterpreter;
  readonly initialState?: readonly StateDocument[];
  readonly clock?: () => number;
}

export interface SubmitResult {
  readonly valid: boolean;
  readonly stateRoot?: Hash;
  readonly reason: string;
}

export class Chain {
  readonly id: string;
  #selector: Selector;
  #interpreter: PolicyInterpreter;
  #initialState: readonly StateDocument[];
  #clock: () => number;
  #committed: TransitionProposal[] = [];
  #submitted = new Map<string, TransitionProposal>();
  #pending: Candidate[] = [];
  #blocks: Block[] = [];
  #arrivalCounter = 0;

  constructor(config: ChainConfig) {
    this.id = config.id;
    this.#selector = config.selector;
    this.#interpreter = config.interpreter ?? standardInterpreter();
    this.#clock = config.clock ?? (() => 1);
    this.#initialState = [genesisPolicy(config.semantics), ...(config.initialState ?? [])];
  }

  get selector(): Selector {
    return this.#selector;
  }
  get blocks(): readonly Block[] {
    return this.#blocks;
  }
  get pending(): readonly Candidate[] {
    return this.#pending;
  }
  /** The root of the canonical chain, or the genesis root before any block. */
  get stateRoot(): Hash {
    return this.#blocks.length > 0 ? this.#blocks[this.#blocks.length - 1].stateRoot : this.#genesisRoot();
  }

  #genesisRoot(): Hash {
    const domain = this.#fresh();
    const documents = [...domain.state.documents.entries()]
      .map(([key, doc]) => ({ key, version: doc.version, value: doc.value }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return hashJson({ chain: this.id, documents });
  }

  /** A domain replayed to the current committed state, for non-mutating evaluation. */
  #fresh(): Domain {
    const domain = new Domain({
      id: this.id,
      interpreter: this.#interpreter,
      verifier: createIntegrityVerifier(),
      preconditions: standardPreconditions(),
      clock: this.#clock,
      initialState: this.#initialState,
    });
    for (const proposal of this.#committed) {
      const result = domain.propose(proposal);
      if (!result.committed) throw new Error("replay failed at " + proposal.id + ": " + result.failure?.detail);
    }
    return domain;
  }

  /**
   * Evaluates a transition against the current state WITHOUT committing it.
   *
   * Arrival time is NODE-LOCAL metadata and defaults to the order in which this
   * node saw the transition. It is deliberately not taken from the proposal: a
   * proposal's own timestamp is part of its content and therefore part of its
   * hash, so deriving arrival from it would make "the same candidates in a
   * different order" a different candidate set.
   */
  submit(proposal: TransitionProposal, arrivedAt?: number): SubmitResult {
    const domain = this.#fresh();
    const result = domain.propose(proposal);
    if (!result.committed || !result.record) {
      return { valid: false, reason: (result.failure?.kind ?? "INVALID") + ": " + (result.failure?.detail ?? "rejected") };
    }
    this.#submitted.set(proposal.id, proposal);
    this.#pending.push({
      proposalId: proposal.id,
      proposalHash: result.record.proposalHash,
      actor: proposal.actor,
      stateRoot: result.record.stateHashAfter,
      arrivedAt: arrivedAt ?? ++this.#arrivalCounter,
    });
    return { valid: true, stateRoot: result.record.stateHashAfter, reason: "valid successor" };
  }

  /** Runs the selector over the pending candidates and commits one, if any. */
  commit(): Block | null {
    const selection = this.#selector.select(this.#pending);
    if (selection === null) return null;
    const proposal = this.#submitted.get(selection.selected.proposalId);
    if (!proposal) return null;
    const parentRoot = this.stateRoot;
    this.#committed.push(proposal);
    const block: Block = {
      index: this.#blocks.length + 1,
      parentRoot,
      proposalId: selection.selected.proposalId,
      proposalHash: selection.selected.proposalHash,
      actor: selection.selected.actor,
      stateRoot: selection.selected.stateRoot,
      selector: this.#selector.id,
      rationale: selection.rationale,
    };
    this.#blocks.push(block);
    this.#pending = [];
    return block;
  }

  /** Convenience: submit an amendment that replaces the semantics in force. */
  amend(next: PolicyDocument, proposalId: string, actor: string, createdAt = 1): SubmitResult {
    const domain = this.#fresh();
    const current = domain.policyDocument("guard");
    if (!current) return { valid: false, reason: "no semantics in force" };
    return this.submit({
      id: proposalId,
      domain: this.id,
      actor,
      intent: "amend the semantics",
      policy: { id: "guard" },
      preconditions: [],
      effects: [{ op: "update", key: "policy/guard", value: next as unknown as JsonValue, expectVersion: current.version }],
      evidence: [],
      parents: [],
      createdAt,
    });
  }
}

export const OPEN_SEMANTICS = policyDocument({ id: "guard", rules: [{ type: "allow-all" }] });
