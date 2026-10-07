import { PolicyInterpreter, policyKey, registerKernelRules } from "../kernel/policy.ts";
import { PreconditionRegistry } from "../kernel/state.ts";
import type { JsonValue, PolicyDocument, StateDocument } from "../kernel/types.ts";
import { capabilityInvariant, type CapabilityValue } from "./capability.ts";
import { registerDecisionRules } from "./decision.ts";
import { registerIdentityRules } from "./identity.ts";

export * from "./capability.ts";
export * from "./reservation.ts";
export * from "./commitment.ts";
export * from "./outcome.ts";
export * from "./decision.ts";
export * from "./identity.ts";

/**
 * Genesis helper: policy documents can only enter a Domain at genesis or
 * through policy/authority (v0.2 I10), so they are seeded like any other state.
 */
export function genesisPolicy(document: PolicyDocument, by = "sha256:genesis"): StateDocument {
  return {
    key: policyKey(document.id),
    version: 1,
    value: document as unknown as JsonValue,
    createdBy: by,
    updatedBy: by,
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Extension rule: a capability effect must conserve units and stay non-negative. */
export function registerCapabilityRules(interpreter: PolicyInterpreter): void {
  interpreter.register("capability-conserved-effect", (_params, context) => {
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

/**
 * The interpreter ships with the kernel rule vocabulary. A deployment adds
 * extension rule types, but cannot add rule types at runtime through a
 * transition - only the policy DOCUMENT is state, not the vocabulary.
 */
export function standardInterpreter(): PolicyInterpreter {
  const interpreter = new PolicyInterpreter();
  registerKernelRules(interpreter);
  registerCapabilityRules(interpreter);
  registerDecisionRules(interpreter);
  registerIdentityRules(interpreter);
  return interpreter;
}

/** A standard registry of named preconditions (guards on the PRIOR state). */
export function standardPreconditions(): PreconditionRegistry {
  const registry = new PreconditionRegistry();
  registry.register("capability-conserved", (params, state) => {
    const p = (params ?? {}) as unknown as { key?: string };
    if (typeof p.key !== "string") return { ok: false, reason: "requires { key }" };
    const doc = state.documents.get(p.key);
    if (!doc) return { ok: false, reason: "missing key: " + p.key };
    return capabilityInvariant(doc.value as unknown as CapabilityValue);
  });
  return registry;
}
