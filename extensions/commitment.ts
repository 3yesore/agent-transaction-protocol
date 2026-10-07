import type { Effect, JsonValue, StateDocument, StateKey } from "../kernel/types.ts";

/**
 * A Commitment is a higher-level state schema describing an obligation about
 * future behavior. Accepted commitments are never edited in place: amendment
 * creates a successor record and marks the predecessor AMENDED, which keeps the
 * full amendment chain addressable (invariant I5).
 */
export type CommitmentStatus =
  | "PROPOSED"
  | "ACCEPTED"
  | "FULFILLED"
  | "AMENDED"
  | "CANCELED"
  | "DISPUTED"
  | "SETTLED";

export interface CommitmentValue {
  readonly id: string;
  readonly revision: number;
  readonly from: string;
  readonly to: string;
  readonly deliverable: string;
  readonly deadline: number;
  readonly status: CommitmentStatus;
  readonly amendmentOf: string | null;
  readonly supersededBy: string | null;
  readonly history: readonly string[];
}

export function commitmentKey(id: string): StateKey {
  return "commitment/" + id;
}

export interface CommitmentInput {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly deliverable: string;
  readonly deadline: number;
  readonly status?: CommitmentStatus;
  readonly amendmentOf?: string | null;
  readonly history?: readonly string[];
}

export function createCommitment(input: CommitmentInput): CommitmentValue {
  return {
    id: input.id,
    revision: 1,
    from: input.from,
    to: input.to,
    deliverable: input.deliverable,
    deadline: input.deadline,
    status: input.status ?? "ACCEPTED",
    amendmentOf: input.amendmentOf ?? null,
    supersededBy: null,
    history: [...(input.history ?? [])],
  };
}

export function withStatus(value: CommitmentValue, status: CommitmentStatus): CommitmentValue {
  return { ...value, status };
}

export function updateCommitmentEffect(doc: StateDocument, value: CommitmentValue): Effect {
  return { op: "update", key: doc.key, value: value as unknown as JsonValue, expectVersion: doc.version };
}

/**
 * Builds the two effects of an amendment: create the successor and mark the
 * predecessor AMENDED. Both land in one transition or neither does.
 */
export function amendmentEffects(
  predecessor: StateDocument,
  successor: CommitmentValue,
  preconditionKey?: StateKey,
): Effect[] {
  const prior = predecessor.value as unknown as CommitmentValue;
  const updatedPredecessor: CommitmentValue = {
    ...prior,
    status: "AMENDED",
    supersededBy: successor.id,
    history: [...prior.history, successor.id],
  };
  return [
    { op: "create", key: commitmentKey(successor.id), value: successor as unknown as JsonValue },
    updateCommitmentEffect(predecessor, updatedPredecessor),
  ];
}
