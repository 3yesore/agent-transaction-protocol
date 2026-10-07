import type { Effect, StateDocument, StateKey } from "../kernel/types.ts";

/**
 * A reservation is a two-phase coordination record over a resource owned by a
 * specific domain. It is an extension schema: the kernel only sees state and
 * transitions.
 */
export type ReservationStatus = "ACTIVE" | "COMMITTED" | "RELEASED" | "EXPIRED";

export interface ReservationValue {
  readonly id: string;
  readonly commitment: string;
  /** State key of the resource being held. */
  readonly resource: string;
  /** The agent that will receive the resource if the reservation commits. */
  readonly holder: string;
  /** The agent that owns the resource. */
  readonly owner: string;
  readonly amount: number;
  readonly unit: string;
  readonly status: ReservationStatus;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly resolvedBy: string | null;
}

export interface ReservationInput {
  readonly id: string;
  readonly commitment: string;
  readonly resource: string;
  readonly holder: string;
  readonly owner: string;
  readonly amount: number;
  readonly unit: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}

export function reservationKey(id: string): StateKey {
  return "reservation/" + id;
}

export function createReservation(input: ReservationInput): ReservationValue {
  return {
    ...input,
    status: "ACTIVE",
    resolvedBy: null,
  };
}

export function resolveReservation(
  value: ReservationValue,
  status: ReservationStatus,
  resolvedBy: string,
): ReservationValue {
  return { ...value, status, resolvedBy };
}

export function isExpired(value: ReservationValue, now: number): boolean {
  return value.status === "ACTIVE" && now >= value.expiresAt;
}

export function updateReservationEffect(doc: StateDocument, value: ReservationValue): Effect {
  return { op: "update", key: doc.key, value: value as unknown as import("../kernel/types.ts").JsonValue, expectVersion: doc.version };
}
