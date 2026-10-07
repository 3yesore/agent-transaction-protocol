import type { Effect, Hash, JsonValue, StateDocument, StateKey } from "../kernel/types.ts";

/**
 * An Outcome is protocol-recognized state about a result, not metaphysical
 * truth. A later transition may supersede or dispute it; the original record is
 * retained (invariant I5).
 */
export type OutcomeStatus =
  | "PROVEN"
  | "DISPROVEN"
  | "UNPROVEN"
  | "CONFLICTED"
  | "UNKNOWN"
  | "DISPUTED"
  | "SUPERSEDED";

export interface OutcomeValue {
  readonly id: string;
  readonly producer: string;
  readonly specification: string;
  readonly status: OutcomeStatus;
  readonly evidenceRefs: readonly Hash[];
  readonly decisionRef: Hash | null;
  readonly supersedes: string | null;
  readonly supersededBy: string | null;
  readonly disputedBy: readonly string[];
}

export function outcomeKey(id: string): StateKey {
  return "outcome/" + id;
}

export interface OutcomeInput {
  readonly id: string;
  readonly producer: string;
  readonly specification: string;
  readonly status: OutcomeStatus;
  readonly evidenceRefs?: readonly Hash[];
  readonly decisionRef?: Hash | null;
  readonly supersedes?: string | null;
}

export function createOutcome(input: OutcomeInput): OutcomeValue {
  return {
    id: input.id,
    producer: input.producer,
    specification: input.specification,
    status: input.status,
    evidenceRefs: [...(input.evidenceRefs ?? [])],
    decisionRef: input.decisionRef ?? null,
    supersedes: input.supersedes ?? null,
    supersededBy: null,
    disputedBy: [],
  };
}

export function updateOutcomeEffect(doc: StateDocument, value: OutcomeValue): Effect {
  return { op: "update", key: doc.key, value: value as unknown as JsonValue, expectVersion: doc.version };
}

/** Marks an outcome DISPUTED without touching its recorded history. */
export function disputeEffects(previous: StateDocument, disputer: string): Effect[] {
  const prior = previous.value as unknown as OutcomeValue;
  const updated: OutcomeValue = {
    ...prior,
    status: "DISPUTED",
    disputedBy: [...prior.disputedBy, disputer],
  };
  return [updateOutcomeEffect(previous, updated)];
}

/**
 * Creates a successor outcome and marks the predecessor SUPERSEDED. The
 * predecessor's original value remains in the ledger.
 */
export function supersedeEffects(
  predecessor: StateDocument,
  successor: OutcomeValue,
  decisionRef: Hash | null,
): Effect[] {
  const prior = predecessor.value as unknown as OutcomeValue;
  const sup: OutcomeValue = { ...successor, supersedes: successor.supersedes ?? prior.id, decisionRef };
  const updatedPredecessor: OutcomeValue = { ...prior, status: "SUPERSEDED", supersededBy: sup.id };
  return [
    { op: "create", key: outcomeKey(sup.id), value: sup as unknown as JsonValue },
    updateOutcomeEffect(predecessor, updatedPredecessor),
  ];
}
