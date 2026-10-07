import { canonicalize } from "./json.ts";
import { readPath } from "./state.ts";
import type {
  JsonValue,
  PolicyContext,
  PolicyDocument,
  PolicyRef,
  PolicyResult,
  PolicyRule,
  StateDocument,
  StateKey,
  StateSnapshot,
  VerificationStatus,
} from "./types.ts";

export function policyKey(id: string): StateKey {
  return "policy/" + id;
}

export function isPolicyKey(key: StateKey): boolean {
  return key.startsWith("policy/");
}

export function policyIdOf(key: StateKey): string {
  return key.slice("policy/".length);
}

/** The reserved meta-policy id that governs policy selection and creation. */
export const AUTHORITY_POLICY_ID = "authority";

export interface RuleOutcome {
  readonly ok: boolean;
  readonly reason: string;
}

export type RuleEvaluator = (
  params: JsonValue | undefined,
  context: PolicyContext,
  rule: PolicyRule,
) => RuleOutcome;

function eq(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  return canonicalize(a === undefined ? null : a) === canonicalize(b === undefined ? null : b);
}

function asObject(value: JsonValue | undefined): Record<string, JsonValue> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, JsonValue>;
}

function asStringArray(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/**
 * The policy interpreter owns the rule VOCABULARY (code); the domain owns the
 * policy DOCUMENT (state). Amending a document is an ordinary Transition, which
 * is what makes "Policy is State" true rather than decorative.
 */
export class PolicyInterpreter {
  #types = new Map<string, RuleEvaluator>();

  register(type: string, evaluator: RuleEvaluator): void {
    this.#types.set(type, evaluator);
  }

  has(type: string): boolean {
    return this.#types.has(type);
  }

  types(): string[] {
    return [...this.#types.keys()].sort();
  }

  evaluateRules(rules: readonly PolicyRule[], context: PolicyContext, prefix: string): RuleOutcome {
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (!rule || typeof rule.type !== "string") {
        return { ok: false, reason: prefix + "rule " + i + " has no type" };
      }
      const evaluator = this.#types.get(rule.type);
      if (!evaluator) {
        return { ok: false, reason: prefix + "unknown rule type: " + rule.type };
      }
      const outcome = evaluator(rule.params, context, rule);
      if (!outcome.ok) {
        return { ok: false, reason: prefix + rule.type + ": " + outcome.reason };
      }
    }
    return { ok: true, reason: prefix + rules.length + " rule(s) satisfied" };
  }

  /** Structural validation, independent of any proposal. */
  validate(document: PolicyDocument): RuleOutcome {
    if (!document || typeof document !== "object") return { ok: false, reason: "policy document must be an object" };
    if (typeof document.id !== "string" || document.id.length === 0) return { ok: false, reason: "policy.id must be a non-empty string" };
    if (!Array.isArray(document.rules)) return { ok: false, reason: "policy.rules must be an array" };
    const check = (rules: readonly PolicyRule[], depth: number): RuleOutcome => {
      if (depth > 8) return { ok: false, reason: "policy rules nested too deeply" };
      for (const rule of rules) {
        if (!rule || typeof rule.type !== "string") return { ok: false, reason: "each rule needs a type" };
        if (!this.#types.has(rule.type)) return { ok: false, reason: "unknown rule type: " + rule.type };
        const nested = asObject(rule.params).rules;
        if (Array.isArray(nested)) {
          const sub = check(nested as unknown as PolicyRule[], depth + 1);
          if (!sub.ok) return sub;
        }
      }
      return { ok: true, reason: "valid" };
    };
    return check(document.rules, 0);
  }

  evaluate(document: PolicyDocument, context: PolicyContext): PolicyResult {
    const outcome = this.evaluateRules(document.rules, context, "");
    return {
      policyId: document.id,
      policyVersion: context.snapshot.documents.get(policyKey(document.id))?.version ?? 0,
      effect: outcome.ok ? "ALLOW" : "REJECT",
      reason: outcome.reason,
    };
  }

  /**
   * Evaluates the policy used to SELECT which policy may govern a proposal.
   * Runs before the policy itself, and only if "policy/authority" is in state.
   */
  evaluateSelection(context: PolicyContext): RuleOutcome {
    const doc = context.snapshot.documents.get(policyKey(AUTHORITY_POLICY_ID));
    if (!doc) return { ok: true, reason: "no policy/authority document; policy selection is unrestricted" };
    const document = doc.value as unknown as PolicyDocument;
    const validation = this.validate(document);
    if (!validation.ok) return validation;
    return this.evaluateRules(document.rules, context, "authority/");
  }
}

export type PolicyResolution =
  | { readonly ok: true; readonly document: PolicyDocument; readonly version: number }
  | { readonly ok: false; readonly kind: "POLICY_UNKNOWN" | "POLICY" | "POLICY_SELECTION"; readonly reason: string };

/** Loads the referenced policy document from state and applies temporal + version gates. */
export function resolvePolicy(
  snapshot: StateSnapshot,
  interpreter: PolicyInterpreter,
  reference: PolicyRef,
  now: number,
): PolicyResolution {
  const doc = snapshot.documents.get(policyKey(reference.id));
  if (!doc) {
    return { ok: false, kind: "POLICY_UNKNOWN", reason: "no policy document at " + policyKey(reference.id) };
  }
  const document = doc.value as unknown as PolicyDocument;
  const validation = interpreter.validate(document);
  if (!validation.ok) {
    return { ok: false, kind: "POLICY", reason: "invalid policy document: " + validation.reason };
  }
  if (reference.expectedVersion !== undefined && reference.expectedVersion !== doc.version) {
    return {
      ok: false,
      kind: "POLICY",
      reason: "policy " + reference.id + " version mismatch (expected " + reference.expectedVersion + ", found " + doc.version + ")",
    };
  }
  if (document.validFrom !== undefined && document.validFrom !== null && now < document.validFrom) {
    return { ok: false, kind: "POLICY", reason: "policy " + reference.id + " is not yet in force (validFrom " + document.validFrom + ")" };
  }
  if (document.validUntil !== undefined && document.validUntil !== null && now >= document.validUntil) {
    return { ok: false, kind: "POLICY", reason: "policy " + reference.id + " expired (validUntil " + document.validUntil + ")" };
  }
  return { ok: true, document, version: doc.version };
}

export function policyDocument(input: {
  id: string;
  rules: readonly PolicyRule[];
  description?: string;
  validFrom?: number | null;
  validUntil?: number | null;
}): PolicyDocument {
  return {
    id: input.id,
    description: input.description,
    validFrom: input.validFrom ?? null,
    validUntil: input.validUntil ?? null,
    rules: input.rules,
  };
}

/** The kernel rule vocabulary: generic authority patterns, no domain schemas. */
export function registerKernelRules(interpreter: PolicyInterpreter): void {
  interpreter.register("allow-all", () => ({ ok: true, reason: "no restriction" }));

  interpreter.register("actor-in", (params, context) => {
    const actors = asStringArray(asObject(params).actors);
    if (actors.length === 0) return { ok: false, reason: "actor-in requires { actors: [] }" };
    return actors.includes(context.proposal.actor)
      ? { ok: true, reason: "actor " + context.proposal.actor + " is authorized" }
      : { ok: false, reason: "actor " + context.proposal.actor + " is not in [" + actors.join(", ") + "]" };
  });

  interpreter.register("evidence-required", (params, context) => {
    const options = asObject(params);
    const kind = typeof options.kind === "string" ? options.kind : null;
    const min = typeof options.min === "number" ? options.min : 1;
    const statuses = (Array.isArray(options.statuses) ? asStringArray(options.statuses) : ["VALID"]) as VerificationStatus[];
    const candidates = context.evidence.filter((e) => (kind ? e.kind === kind : true));
    if (candidates.length < min) {
      return { ok: false, reason: "requires " + min + " evidence record(s)" + (kind ? " of kind " + kind : "") + ", found " + candidates.length };
    }
    const usable = candidates.filter((e) => statuses.includes(context.verifier.verify(e))).length;
    if (usable < min) {
      return { ok: false, reason: "requires " + min + " usable evidence record(s), found " + usable + " (allowed statuses " + statuses.join("/") + ")" };
    }
    return { ok: true, reason: "evidence requirement satisfied" };
  });

  interpreter.register("evidence-threshold", (params, context) => {
    const options = asObject(params);
    if (typeof options.kind !== "string" || !Array.isArray(options.path) || typeof options.threshold !== "number") {
      return { ok: false, reason: "evidence-threshold requires { kind, path, threshold }" };
    }
    const path = asStringArray(options.path);
    const distinctPath = Array.isArray(options.distinctPath) ? asStringArray(options.distinctPath) : null;
    const seen = new Set<string>();
    let count = 0;
    let vetoes = 0;
    for (const record of context.evidence) {
      if (record.kind !== options.kind) continue;
      const key = distinctPath ? canonicalize(readPath(record.payload, distinctPath) ?? null) : record.producer;
      if (seen.has(key)) continue;
      const value = readPath(record.payload, path);
      if (options.vetoEquals !== undefined && eq(value, options.vetoEquals)) {
        vetoes++;
        seen.add(key);
        continue;
      }
      if (eq(value, options.equals)) {
        count++;
        seen.add(key);
      }
    }
    if (options.vetoEquals !== undefined && vetoes > 0) {
      return { ok: false, reason: "veto: " + vetoes + " distinct record(s) matched " + canonicalize(options.vetoEquals) };
    }
    if (count < options.threshold) {
      return { ok: false, reason: "requires " + options.threshold + " distinct matching record(s), found " + count };
    }
    return { ok: true, reason: "threshold met (" + count + "/" + options.threshold + ")" };
  });

  interpreter.register("state-equals", (params, context) => {
    const options = asObject(params);
    if (typeof options.key !== "string") return { ok: false, reason: "state-equals requires { key }" };
    const doc: StateDocument | undefined = context.snapshot.documents.get(options.key);
    if (!doc) return { ok: false, reason: "missing key: " + options.key };
    const path = Array.isArray(options.path) ? asStringArray(options.path) : [];
    const actual = readPath(doc.value, path);
    return eq(actual, options.equals)
      ? { ok: true, reason: "value at " + options.key + "#" + path.join(".") + " matched" }
      : { ok: false, reason: "value at " + options.key + "#" + path.join(".") + " is " + canonicalize(actual ?? null) + ", expected " + canonicalize(options.equals ?? null) };
  });

  interpreter.register("all-of", (params, context) => {
    const rules = asObject(params).rules;
    if (!Array.isArray(rules)) return { ok: false, reason: "all-of requires { rules: [] }" };
    return interpreter.evaluateRules(rules as unknown as PolicyRule[], context, "all-of/");
  });

  interpreter.register("any-of", (params, context) => {
    const rules = asObject(params).rules;
    if (!Array.isArray(rules)) return { ok: false, reason: "any-of requires { rules: [] }" };
    const reasons: string[] = [];
    for (const rule of rules as unknown as PolicyRule[]) {
      const outcome = interpreter.evaluateRules([rule], context, "");
      if (outcome.ok) return { ok: true, reason: "any-of: " + rule.type + " allowed" };
      reasons.push(outcome.reason);
    }
    return { ok: false, reason: "any-of: none allowed (" + reasons.join("; ") + ")" };
  });

  interpreter.register("policy-invocable", (params, context) => {
    const ids = asStringArray(asObject(params).ids);
    if (ids.length === 0) return { ok: false, reason: "policy-invocable requires { ids: [] }" };
    return ids.includes(context.proposal.policy.id)
      ? { ok: true, reason: "policy " + context.proposal.policy.id + " may be invoked" }
      : { ok: false, reason: "policy " + context.proposal.policy.id + " is not invocable in this domain" };
  });

  interpreter.register("time-window", (params, context) => {
    const options = asObject(params);
    const from = typeof options.from === "number" ? options.from : null;
    const until = typeof options.until === "number" ? options.until : null;
    if (from !== null && context.now < from) return { ok: false, reason: "not yet active (from " + from + ")" };
    if (until !== null && context.now >= until) return { ok: false, reason: "no longer active (until " + until + ")" };
    return { ok: true, reason: "within time window" };
  });
}

