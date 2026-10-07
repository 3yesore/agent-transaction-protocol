import type { Effect, StateDocument, StateKey } from "../kernel/types.ts";

/**
 * Capability accounting is an extension schema, not a kernel primitive.
 *
 * The only invariant the kernel needs to preserve is conservation:
 *   available + reserved + consumed === total
 * Over-commitment (reserving more than is available) is a Policy choice.
 */
export interface CapabilityValue {
  readonly unit: string;
  readonly total: number;
  readonly available: number;
  readonly reserved: number;
  readonly consumed: number;
}

export function capabilityValue(unit: string, total: number): CapabilityValue {
  return { unit, total, available: total, reserved: 0, consumed: 0 };
}

export function capabilityKey(owner: string, unit: string): StateKey {
  return "capability/" + owner + "/" + unit;
}

export interface InvariantCheck {
  readonly ok: boolean;
  readonly reason: string;
}

export function capabilityInvariant(value: CapabilityValue): InvariantCheck {
  const parts = [value.total, value.available, value.reserved, value.consumed];
  if (!parts.every((n) => Number.isInteger(n))) return { ok: false, reason: "capability fields must be integers" };
  if (parts.some((n) => n < 0)) return { ok: false, reason: "capability fields must be non-negative" };
  if (value.available + value.reserved + value.consumed !== value.total) {
    return { ok: false, reason: "not conserved: available+reserved+consumed !== total" };
  }
  return { ok: true, reason: "conserved" };
}

type OpResult = { readonly ok: true; readonly value: CapabilityValue } | { readonly ok: false; readonly reason: string };

export function reserve(value: CapabilityValue, amount: number): OpResult {
  if (amount <= 0) return { ok: false, reason: "reserve amount must be positive" };
  if (value.available < amount) {
    return { ok: false, reason: "insufficient available: " + value.available + " < " + amount };
  }
  return {
    ok: true,
    value: { ...value, available: value.available - amount, reserved: value.reserved + amount },
  };
}

export function release(value: CapabilityValue, amount: number): OpResult {
  if (amount <= 0) return { ok: false, reason: "release amount must be positive" };
  if (value.reserved < amount) return { ok: false, reason: "insufficient reserved: " + value.reserved + " < " + amount };
  return {
    ok: true,
    value: { ...value, reserved: value.reserved - amount, available: value.available + amount },
  };
}

/** Moves reserved units to consumed. This is the irreversible side of a settlement. */
export function consume(value: CapabilityValue, amount: number): OpResult {
  if (amount <= 0) return { ok: false, reason: "consume amount must be positive" };
  if (value.reserved < amount) return { ok: false, reason: "insufficient reserved: " + value.reserved + " < " + amount };
  return {
    ok: true,
    value: { ...value, reserved: value.reserved - amount, consumed: value.consumed + amount },
  };
}

/** One-phase spend: moves available units straight to consumed. */
export function spend(value: CapabilityValue, amount: number): OpResult {
  if (amount <= 0) return { ok: false, reason: "spend amount must be positive" };
  if (value.available < amount) {
    return { ok: false, reason: "insufficient available: " + value.available + " < " + amount };
  }
  return {
    ok: true,
    value: { ...value, available: value.available - amount, consumed: value.consumed + amount },
  };
}

/** Compensation: returns previously consumed units to available. */
export function refund(value: CapabilityValue, amount: number): OpResult {
  if (amount <= 0) return { ok: false, reason: "refund amount must be positive" };
  if (value.consumed < amount) return { ok: false, reason: "insufficient consumed: " + value.consumed + " < " + amount };
  return {
    ok: true,
    value: { ...value, consumed: value.consumed - amount, available: value.available + amount },
  };
}

export function updateCapabilityEffect(doc: StateDocument, value: CapabilityValue): Effect {
  return { op: "update", key: doc.key, value: value as unknown as import("../kernel/types.ts").JsonValue, expectVersion: doc.version };
}
