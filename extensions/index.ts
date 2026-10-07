import { PolicyRegistry, actorIn, customPolicy, evidenceRequirement, fieldIn, judgmentThreshold } from "../kernel/policy.ts";
import { PreconditionRegistry } from "../kernel/state.ts";
import { capabilityInvariant, type CapabilityValue } from "./capability.ts";
import { isExpired, type ReservationValue } from "./reservation.ts";
import type { JsonValue } from "../kernel/types.ts";

export * from "./capability.ts";
export * from "./reservation.ts";
export * from "./commitment.ts";
export * from "./outcome.ts";

export interface CapabilityAvailableParams {
  readonly key: string;
  readonly amount: number;
}

/** Rejects a transition unless the capability at params.key has enough available units. */
export function capabilityAvailablePolicy(params: JsonValue | undefined) {
  const p = params as unknown as CapabilityAvailableParams | undefined;
  return customPolicy("capability-available", (context) => {
    if (!p || typeof p.key !== "string" || typeof p.amount !== "number") {
      return { ok: false, reason: "capability-available requires { key, amount }" };
    }
    const doc = context.snapshot.documents.get(p.key);
    if (!doc) return { ok: false, reason: "missing capability: " + p.key };
    const value = doc.value as unknown as CapabilityValue;
    if (value.available < p.amount) {
      return { ok: false, reason: "insufficient available: " + value.available + " < " + p.amount };
    }
    return { ok: true, reason: "capability available (" + value.available + " >= " + p.amount + ")" };
  });
}

export interface ReservationActiveParams {
  readonly key: string;
}

/** Rejects a transition unless the reservation at params.key is ACTIVE and unexpired. */
export function reservationActivePolicy(params: JsonValue | undefined) {
  const p = params as unknown as ReservationActiveParams | undefined;
  return customPolicy("reservation-active", (context) => {
    if (!p || typeof p.key !== "string") return { ok: false, reason: "reservation-active requires { key }" };
    const doc = context.snapshot.documents.get(p.key);
    if (!doc) return { ok: false, reason: "missing reservation: " + p.key };
    const value = doc.value as unknown as ReservationValue;
    if (value.status !== "ACTIVE") return { ok: false, reason: "reservation is " + value.status };
    if (isExpired(value, context.now)) return { ok: false, reason: "reservation expired at " + value.expiresAt };
    return { ok: true, reason: "reservation active" };
  });
}

/**
 * Enforces capability conservation on the RESULT of a transition.
 *
 * Named preconditions are evaluated against the prior snapshot, so they cannot
 * stop a transition from writing an inconsistent value. Policy receives the
 * whole proposal, including its effects, so it can. No postcondition primitive
 * is required for this.
 */
export function capabilityConservedEffectPolicy() {
  return customPolicy("capability-conserved-effect", (context) => {
    for (const effect of context.proposal.effects) {
      if (!effect.key.startsWith("capability/")) continue;
      const check = capabilityInvariant(effect.value as unknown as CapabilityValue);
      if (!check.ok) {
        return { ok: false, reason: "effect on " + effect.key + " would break conservation: " + check.reason };
      }
    }
    return { ok: true, reason: "all capability effects conserve units" };
  });
}

/** A standard registry of kernel and extension policies. */
export function standardPolicies(): PolicyRegistry {
  const registry = new PolicyRegistry();
  registry.register("allow-all", () => customPolicy("allow-all", () => ({ ok: true, reason: "no restriction" })));
  registry.register("actor-in", (params) => {
    const p = params as unknown as { actors?: string[] } | undefined;
    return actorIn("actor-in", p?.actors ?? []);
  });
  registry.register("evidence-required", (params) => {
    const p = params as unknown as { kinds?: string[]; min?: number } | undefined;
    return evidenceRequirement("evidence-required", { kinds: p?.kinds, min: p?.min ?? 1 });
  });
  registry.register("judgment", (params) => {
    const p = params as unknown as { threshold: number; allowedJudges?: string[]; vetoOnDeny?: boolean; minValidEvidence?: number } | undefined;
    if (!p || typeof p.threshold !== "number") {
      return customPolicy("judgment", () => ({ ok: false, reason: "judgment requires { threshold }" }));
    }
    return judgmentThreshold("judgment", p);
  });
  registry.register("state-equals", (params) => {
    const p = params as unknown as { key: string; path: string[]; equals: JsonValue } | undefined;
    if (!p) return customPolicy("state-equals", () => ({ ok: false, reason: "state-equals requires params" }));
    return fieldIn("state-equals", p.key, p.path ?? [], [p.equals]);
  });
  registry.register("capability-available", capabilityAvailablePolicy);
  registry.register("capability-conserved-effect", () => capabilityConservedEffectPolicy());
  registry.register("reservation-active", reservationActivePolicy);
  return registry;
}

/** A standard registry of named preconditions used by the experiments. */
export function standardPreconditions(): PreconditionRegistry {
  const registry = new PreconditionRegistry();
  registry.register("capability-conserved", (params, state) => {
    const p = params as unknown as { key: string } | undefined;
    if (!p || typeof p.key !== "string") return { ok: false, reason: "requires { key }" };
    const doc = state.documents.get(p.key);
    if (!doc) return { ok: false, reason: "missing key: " + p.key };
    return capabilityInvariant(doc.value as unknown as CapabilityValue);
  });
  registry.register("reservation-expired", (params, state) => {
    const p = params as unknown as { key: string } | undefined;
    if (!p || typeof p.key !== "string") return { ok: false, reason: "requires { key }" };
    const doc = state.documents.get(p.key);
    if (!doc) return { ok: false, reason: "missing key: " + p.key };
    const value = doc.value as unknown as ReservationValue;
    if (value.status !== "ACTIVE") return { ok: false, reason: "reservation is " + value.status };
    return { ok: true, reason: "reservation may be resolved by expiry" };
  });
  return registry;
}
