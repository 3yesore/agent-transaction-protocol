import type { PolicyInterpreter } from "../kernel/policy.ts";
import type { JsonValue, StateKey } from "../kernel/types.ts";
import { decisionPayloadOf } from "./decision.ts";

/**
 * Minimal identity and cost model.
 *
 * ATP deliberately does not define identity, so this is an extension: an
 * identity is State, and recognition is Policy. The only thing the model adds
 * is a cost - a stake that must be locked for an identity to be eligible.
 *
 * It does NOT establish that two identifiers are two principals. That is the
 * point: this module exists so the resulting attack economics can be measured
 * rather than asserted.
 */
export type IdentityStatus = "ACTIVE" | "SLASHED" | "RETIRED";

export interface IdentityValue {
  readonly id: string;
  readonly controller: string;
  /** Units locked behind this identity. Zero means the identity is free. */
  readonly stake: number;
  readonly unit: string;
  readonly status: IdentityStatus;
  readonly registeredAt: number;
  readonly slashReasons: readonly string[];
}

export function identityKey(id: string): StateKey {
  return "identity/" + id;
}

export interface IdentityInput {
  readonly id: string;
  readonly controller: string;
  readonly stake: number;
  readonly unit: string;
  readonly registeredAt: number;
}

export function createIdentity(input: IdentityInput): IdentityValue {
  return { ...input, status: "ACTIVE", slashReasons: [] };
}

/** Eligibility is a pure predicate over State, so it is checkable by Policy. */
export function isEligible(value: IdentityValue | undefined, minStake: number): boolean {
  return value !== undefined && value.status === "ACTIVE" && value.stake >= minStake;
}

export function slashIdentity(value: IdentityValue, reason: string): IdentityValue {
  return { ...value, status: "SLASHED", stake: 0, slashReasons: [...value.slashReasons, reason] };
}

export function identityOf(snapshot: { documents: ReadonlyMap<StateKey, { value: JsonValue }> }, id: string): IdentityValue | undefined {
  const doc = snapshot.documents.get(identityKey(id));
  return doc ? (doc.value as unknown as IdentityValue) : undefined;
}

function asObject(value: JsonValue | undefined): Record<string, JsonValue> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, JsonValue>;
}

/**
 * A judgment threshold that only counts judges whose identity is ACTIVE with at
 * least the required stake, and reports how much stake stands behind the result.
 */
export function registerIdentityRules(interpreter: PolicyInterpreter): void {
  interpreter.register("staked-decision-threshold", (params, context) => {
    const options = asObject(params);
    const threshold = typeof options.threshold === "number" ? options.threshold : 1;
    const minStake = typeof options.minStake === "number" ? options.minStake : 0;
    const vetoOnDeny = options.vetoOnDeny === true;
    const requireValid = options.requireValid === true;
    const seen = new Set<string>();
    let affirm = 0;
    let deny = 0;
    let abstain = 0;
    let ineligible = 0;
    let unverified = 0;
    let stakeBehindAffirm = 0;
    for (const record of context.evidence) {
      const payload = decisionPayloadOf(record);
      if (!payload) continue;
      if (seen.has(payload.evaluator)) continue;
      if (requireValid && context.verifier.verify(record) !== "VALID") {
        unverified++;
        continue;
      }
      const identity = identityOf(context.snapshot, payload.evaluator);
      if (!isEligible(identity, minStake)) {
        ineligible++;
        continue;
      }
      const stake = identity === undefined ? 0 : identity.stake;
      if (payload.conclusion === "AFFIRM") {
        affirm++;
        stakeBehindAffirm += stake;
      } else if (payload.conclusion === "DENY") {
        deny++;
      } else {
        abstain++;
      }
    }
    if (vetoOnDeny && deny > 0) {
      return { ok: false, reason: "veto: " + deny + " eligible judge(s) denied" };
    }
    if (affirm < threshold) {
      return {
        ok: false,
        reason:
          "requires " + threshold + " eligible affirm(s) at stake >= " + minStake + ", found " + affirm +
          " (deny " + deny + ", abstain " + abstain + ", " + ineligible + " ineligible, " + unverified + " unverified)",
      };
    }
    return { ok: true, reason: "threshold met (" + affirm + "/" + threshold + ") with " + stakeBehindAffirm + " stake at risk" };
  });

  interpreter.register("identity-staked", (params, context) => {
    const options = asObject(params);
    if (typeof options.id !== "string") return { ok: false, reason: "identity-staked requires { id }" };
    const minStake = typeof options.minStake === "number" ? options.minStake : 0;
    const identity = identityOf(context.snapshot, options.id);
    if (!identity) return { ok: false, reason: "no identity: " + options.id };
    if (!isEligible(identity, minStake)) {
      return { ok: false, reason: "identity " + options.id + " is " + identity.status + " with stake " + identity.stake + " < " + minStake };
    }
    return { ok: true, reason: "identity " + options.id + " eligible with stake " + identity.stake };
  });
}
