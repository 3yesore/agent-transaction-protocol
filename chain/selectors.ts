import type { Hash } from "../kernel/types.ts";

/**
 * A candidate successor: one valid next state, produced by evaluating a
 * transition against the current state without committing it.
 *
 * ATP-0002 permits several valid successors and does not require canonical
 * selection. Selecting one is therefore an application concern, and this module
 * is where that concern lives.
 */
export interface Candidate {
  readonly proposalId: string;
  readonly proposalHash: Hash;
  readonly actor: string;
  readonly stateRoot: Hash;
  /** Arrival time at this node. NOT a protocol property. */
  readonly arrivedAt: number;
}

export interface Selection {
  readonly selected: Candidate;
  readonly rationale: string;
}

export interface Selector {
  readonly id: string;
  readonly description: string;
  /** Returns null when the selector declines to canonicalise, retaining every branch. */
  select(candidates: readonly Candidate[]): Selection | null;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** First to arrive wins. Simple, common, and order-dependent. */
export const arrivalOrder: Selector = {
  id: "arrival-order",
  description: "the first transition to reach this node is canonical",
  select(candidates) {
    if (candidates.length === 0) return null;
    const sorted = [...candidates].sort((a, b) => a.arrivedAt - b.arrivedAt || compare(a.proposalId, b.proposalId));
    return { selected: sorted[0], rationale: "earliest arrival at " + sorted[0].arrivedAt };
  },
};

/**
 * Lowest state root wins. Order-independent, so two nodes that saw the same
 * candidates in different orders agree.
 */
export const lowestStateRoot: Selector = {
  id: "lowest-state-root",
  description: "the lexicographically smallest resulting state root is canonical",
  select(candidates) {
    if (candidates.length === 0) return null;
    const sorted = [...candidates].sort((a, b) => compare(a.stateRoot, b.stateRoot));
    return { selected: sorted[0], rationale: "smallest state root " + sorted[0].stateRoot.slice(0, 18) };
  },
};

/** Prefer candidates whose actor appears earliest in a priority list. */
export function actorPriority(priority: readonly string[]): Selector {
  const rank = new Map(priority.map((actor, index) => [actor, index]));
  return {
    id: "actor-priority",
    description: "an out-of-band priority list decides, falling back to the state root",
    select(candidates) {
      if (candidates.length === 0) return null;
      const sorted = [...candidates].sort((a, b) => {
        const ra = rank.has(a.actor) ? rank.get(a.actor)! : Number.MAX_SAFE_INTEGER;
        const rb = rank.has(b.actor) ? rank.get(b.actor)! : Number.MAX_SAFE_INTEGER;
        return ra - rb || compare(a.stateRoot, b.stateRoot);
      });
      return { selected: sorted[0], rationale: "actor " + sorted[0].actor + " has priority rank " + (rank.get(sorted[0].actor) ?? "none") };
    },
  };
}

/**
 * No canonical selection. Every branch is retained, which the freeze explicitly
 * permits: "canonical selection is not required by the kernel".
 */
export const retainAll: Selector = {
  id: "retain-all",
  description: "no canonical selection; every valid successor is retained",
  select() {
    return null;
  },
};
