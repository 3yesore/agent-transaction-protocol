import { hashJson } from "./json.ts";
import { readPath } from "./state.ts";
import type {
  DecisionRecord,
  JsonValue,
  Policy,
  PolicyContext,
  PolicyResult,
  VerificationStatus,
} from "./types.ts";

export function allow(policyId: string, reason = "policy satisfied"): PolicyResult {
  return { policyId, effect: "ALLOW", reason };
}

export function reject(policyId: string, reason: string): PolicyResult {
  return { policyId, effect: "REJECT", reason };
}

export function namedPolicy(
  id: string,
  evaluate: (context: PolicyContext) => PolicyResult,
): Policy {
  return { id, evaluate: (context) => evaluate(context) };
}

export function allOf(id: string, ...policies: Policy[]): Policy {
  return namedPolicy(id, (context) => {
    for (const policy of policies) {
      const result = policy.evaluate(context);
      if (result.effect !== "ALLOW") {
        return reject(id, "allOf: " + policy.id + " -> " + result.reason);
      }
    }
    return allow(id, "allOf: " + policies.length + " policies allowed");
  });
}

export function anyOf(id: string, ...policies: Policy[]): Policy {
  return namedPolicy(id, (context) => {
    const reasons: string[] = [];
    for (const policy of policies) {
      const result = policy.evaluate(context);
      if (result.effect === "ALLOW") return allow(id, "anyOf: " + policy.id + " allowed");
      reasons.push(policy.id + " -> " + result.reason);
    }
    return reject(id, "anyOf: none allowed (" + reasons.join("; ") + ")");
  });
}

export function actorIn(id: string, actors: readonly string[]): Policy {
  const allowed = new Set(actors);
  return namedPolicy(id, (context) => {
    if (allowed.has(context.proposal.actor)) {
      return allow(id, "actor " + context.proposal.actor + " is authorized");
    }
    return reject(id, "actor " + context.proposal.actor + " is not in the authorized set");
  });
}

export interface EvidenceRequirement {
  readonly kinds?: readonly string[];
  readonly min?: number;
  readonly requireValid?: boolean;
  readonly allowedStatuses?: readonly VerificationStatus[];
}

export function evidenceRequirement(id: string, requirement: EvidenceRequirement): Policy {
  const allowedStatuses = new Set<VerificationStatus>(requirement.allowedStatuses ?? ["VALID"]);
  return namedPolicy(id, (context) => {
    let candidates = [...context.evidence];
    if (requirement.kinds) {
      const kinds = new Set(requirement.kinds);
      candidates = candidates.filter((e) => kinds.has(e.kind));
    }
    const min = requirement.min ?? 1;
    if (candidates.length < min) {
      return reject(id, "requires at least " + min + " evidence record(s), found " + candidates.length);
    }
    if (requirement.requireValid !== false) {
      const statuses = candidates.map((e) => context.verifier.verify(e));
      const usable = statuses.filter((s) => allowedStatuses.has(s)).length;
      if (usable < min) {
        return reject(
          id,
          "requires " + min + " evidence record(s) with status in [" + [...allowedStatuses].join(", ") + "], found " + usable,
        );
      }
    }
    return allow(id, "evidence requirement satisfied");
  });
}

export interface JudgmentOptions {
  readonly threshold: number;
  readonly allowedJudges?: readonly string[];
  readonly vetoOnDeny?: boolean;
  readonly minValidEvidence?: number;
}

export function judgmentThreshold(id: string, options: JudgmentOptions): Policy {
  return namedPolicy(id, (context) => {
    const allowed = options.allowedJudges ? new Set(options.allowedJudges) : null;
    const seen = new Set<string>();
    let affirm = 0;
    let deny = 0;
    let abstain = 0;
    for (const decision of context.decisions) {
      if (allowed && !allowed.has(decision.judge)) continue;
      if (seen.has(decision.judge)) continue;
      seen.add(decision.judge);
      if (decision.verdict === "AFFIRM") affirm++;
      else if (decision.verdict === "DENY") deny++;
      else abstain++;
    }
    if (options.minValidEvidence && options.minValidEvidence > 0) {
      const valid = context.evidence.filter((e) => context.verifier.verify(e) === "VALID").length;
      if (valid < options.minValidEvidence) {
        return reject(id, "requires " + options.minValidEvidence + " valid evidence record(s), found " + valid);
      }
    }
    if (options.vetoOnDeny && deny > 0) {
      return reject(id, "veto: " + deny + " distinct judge(s) denied");
    }
    if (affirm < options.threshold) {
      return reject(
        id,
        "judgment requires " + options.threshold + " affirm(s), found " + affirm + " (deny " + deny + ", abstain " + abstain + ")",
      );
    }
    return allow(id, "judgment threshold met (" + affirm + "/" + options.threshold + ")");
  });
}

export function fieldIn(
  id: string,
  key: string,
  path: readonly string[],
  allowedValues: readonly JsonValue[],
): Policy {
  return namedPolicy(id, (context) => {
    const doc = context.snapshot.documents.get(key);
    if (!doc) return reject(id, "missing key: " + key);
    const actual = readPath(doc.value, path);
    const ok = allowedValues.some((v) => JSON.stringify(v) === JSON.stringify(actual));
    if (!ok) return reject(id, "value at " + key + "#" + path.join(".") + " is not allowed");
    return allow(id, "value at " + key + "#" + path.join(".") + " is allowed");
  });
}

export function customPolicy(
  id: string,
  check: (context: PolicyContext) => { ok: boolean; reason: string },
): Policy {
  return namedPolicy(id, (context) => {
    const result = check(context);
    return result.ok ? allow(id, result.reason) : reject(id, result.reason);
  });
}

/** A policy that always allows. Useful as an explicit, audited no-op. */
export function unconditionallyAllowed(id = "allow-all"): Policy {
  return namedPolicy(id, () => allow(id, "no restriction"));
}

/**
 * Policies are declared in a proposal as { id, params } so the proposal stays
 * serializable and hashable. The registry rehydrates code from that reference.
 */
export class PolicyRegistry {
  #factories = new Map<string, (params: JsonValue | undefined) => Policy>();

  register(id: string, factory: (params: JsonValue | undefined) => Policy): void {
    this.#factories.set(id, factory);
  }

  has(id: string): boolean {
    return this.#factories.has(id);
  }

  create(id: string, params: JsonValue | undefined): Policy | null {
    const factory = this.#factories.get(id);
    if (!factory) return null;
    return factory(params);
  }

  ids(): string[] {
    return [...this.#factories.keys()].sort();
  }
}

/** Convenience: the hash of a proposal is its protocol identity. */
export function proposalHashOf(proposal: unknown): string {
  return hashJson(proposal);
}

export function summarizeDecisions(decisions: readonly DecisionRecord[]): string {
  if (decisions.length === 0) return "none";
  return decisions.map((d) => d.judge + ":" + d.verdict).join(", ");
}
