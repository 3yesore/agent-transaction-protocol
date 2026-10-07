import { canonicalize } from "../../kernel/json.ts";
import type { JsonValue } from "../../kernel/types.ts";

/**
 * The ambiguity budget of an amendment specification.
 *
 * A specification is the thing two independent clients implement. If it does not
 * DECIDE an amendment, two honest readers may decide it differently, and at the
 * meta level that is not a rejected transition - it is two rule sets. So the
 * quantity to measure is not correctness but determinacy:
 *
 *   d = the fraction of amendments the specification does not decide.
 *
 * The decision function is therefore three-valued. "undetermined" is the
 * ambiguity, and it is exactly where a fork can start.
 */
export interface AmendmentContext {
  readonly currentSemantics: string;
  readonly currentValue: JsonValue;
  readonly vocabulary: readonly string[];
  readonly numericRange: readonly [number, number];
  readonly knownFields: readonly string[];
}

export interface Clause {
  readonly id: string;
  /** What the specification must state explicitly to own this decision. */
  readonly statement: string;
  rejects(amendment: Record<string, JsonValue>, raw: string, context: AmendmentContext): boolean;
}

export interface CorpusEntry {
  readonly id: string;
  /** The ambiguity class this entry represents. */
  readonly className: string;
  readonly note: string;
  readonly amendment: Record<string, JsonValue>;
  /** The exact bytes on the wire. Encoding clauses need it. */
  readonly raw: string;
}

export type Verdict = "valid" | "invalid" | "undetermined";

export interface Decision {
  readonly verdict: Verdict;
  /** Clauses that would reject this amendment, whether or not the spec states them. */
  readonly rejecting: readonly string[];
  /** Rejecting clauses the spec does not state. Non-empty means undetermined. */
  readonly unresolved: readonly string[];
}

// ---------------------------------------------------------------------------
// The clauses. Each one is a decision the specification must make explicitly.
// ---------------------------------------------------------------------------
export const CLAUSES: readonly Clause[] = [
  {
    id: "require-pre-state-authorization",
    statement:
      "a semantic update must be authorised by the semantics in force BEFORE it, named explicitly as authorizedBy",
    rejects: (amendment, _raw, context) =>
      typeof amendment.authorizedBy !== "string" || amendment.authorizedBy !== context.currentSemantics,
  },
  {
    id: "require-precondition-match",
    statement: "the amendment must state the value it replaces, and it must match the value in state",
    rejects: (amendment, _raw, context) => canonicalize(amendment.from ?? null) !== canonicalize(context.currentValue),
  },
  {
    id: "closed-target-vocabulary",
    statement: "target must name a rule in a closed vocabulary; anything else is not a no-op, it is invalid",
    rejects: (amendment, _raw, context) => !context.vocabulary.includes(String(amendment.target)),
  },
  {
    id: "check-types",
    statement: "each field has a declared type and a value of the wrong type is invalid",
    rejects: (amendment) => typeof amendment.to !== "number",
  },
  {
    id: "reject-unknown-fields",
    statement: "the field set is closed; an unrecognised field is invalid rather than ignored",
    rejects: (amendment, _raw, context) => Object.keys(amendment).some((key) => !context.knownFields.includes(key)),
  },
  {
    id: "require-value-in-range",
    statement: "numeric parameters have a declared range and a value outside it is invalid",
    rejects: (amendment, _raw, context) =>
      typeof amendment.to === "number" && (amendment.to < context.numericRange[0] || amendment.to > context.numericRange[1]),
  },
  {
    id: "require-canonical-encoding",
    statement:
      "the wire encoding is canonical: sorted keys, no duplicate keys, no insignificant whitespace",
    rejects: (amendment, raw, _context) => canonicalize(amendment) !== raw,
  },
];

export const MINIMAL_SPEC: readonly string[] = [];
export const TOTAL_SPEC: readonly string[] = CLAUSES.map((clause) => clause.id);

/**
 * The ladder is ordered so that each rung closes at least one ambiguity class.
 * The last two rungs are about the WIRE FORMAT, not about the protocol, which is
 * worth noticing: a chain can fork on encoding alone.
 */
export const LADDER: readonly string[] = [
  "require-pre-state-authorization",
  "require-precondition-match",
  "closed-target-vocabulary",
  "check-types",
  "reject-unknown-fields",
  "require-value-in-range",
  "require-canonical-encoding",
];

export function decide(spec: readonly string[], entry: CorpusEntry, context: AmendmentContext): Decision {
  if (entry.amendment.kind !== "amend-semantics") {
    return { verdict: "invalid", rejecting: ["structural"], unresolved: [] };
  }
  const rejecting: string[] = [];
  const unresolved: string[] = [];
  for (const clause of CLAUSES) {
    if (!clause.rejects(entry.amendment, entry.raw, context)) continue;
    rejecting.push(clause.id);
    if (!spec.includes(clause.id)) unresolved.push(clause.id);
  }
  if (unresolved.length > 0) return { verdict: "undetermined", rejecting, unresolved };
  return { verdict: rejecting.length > 0 ? "invalid" : "valid", rejecting, unresolved: [] };
}

export interface Budget {
  readonly total: number;
  readonly valid: number;
  readonly invalid: number;
  readonly undetermined: number;
  /** The ambiguity budget: the fraction of the corpus the specification does not decide. */
  readonly d: number;
}

export function ambiguityBudget(spec: readonly string[], corpus: readonly CorpusEntry[], context: AmendmentContext): Budget {
  let valid = 0;
  let invalid = 0;
  let undetermined = 0;
  for (const entry of corpus) {
    const verdict = decide(spec, entry, context).verdict;
    if (verdict === "valid") valid++;
    else if (verdict === "invalid") invalid++;
    else undetermined++;
  }
  return { total: corpus.length, valid, invalid, undetermined, d: corpus.length === 0 ? 0 : undetermined / corpus.length };
}

// ---------------------------------------------------------------------------
// The context
// ---------------------------------------------------------------------------
export const CONTEXT: AmendmentContext = {
  currentSemantics: "guard-v1",
  currentValue: 2,
  vocabulary: ["rule/guard.quorum", "rule/guard.actors"],
  numericRange: [1, 32],
  knownFields: ["kind", "target", "from", "to", "authorizedBy"],
};

function raw(value: Record<string, JsonValue>): string {
  return canonicalize(value);
}

function entry(
  id: string,
  className: string,
  note: string,
  amendment: Record<string, JsonValue>,
  rawOverride?: string,
): CorpusEntry {
  return { id, className, note, amendment, raw: rawOverride ?? raw(amendment) };
}

// ---------------------------------------------------------------------------
// The corpus. Every entry is a decision the specification has to make.
// ---------------------------------------------------------------------------
export const CORPUS: readonly CorpusEntry[] = [
  entry("conforming", "conforming", "a fully stated, in-range amendment", {
    kind: "amend-semantics",
    target: "rule/guard.quorum",
    from: 2,
    to: 3,
    authorizedBy: "guard-v1",
  }),
  entry("missing-authorization", "authorization absent", "no authorizedBy field at all", {
    kind: "amend-semantics",
    target: "rule/guard.quorum",
    from: 2,
    to: 3,
  }),
  entry("self-authorization", "self-authorization", "the amendment names the SUCCESSOR semantics as its authoriser", {
    kind: "amend-semantics",
    target: "rule/guard.quorum",
    from: 2,
    to: 3,
    authorizedBy: "guard-v2",
  }),
  entry("wrong-authorizer", "wrong authoriser", "a well-formed but unrelated authoriser", {
    kind: "amend-semantics",
    target: "rule/guard.quorum",
    from: 2,
    to: 3,
    authorizedBy: "some-other-domain",
  }),
  entry("stale-precondition", "stale precondition", "from says 5 but state holds 2", {
    kind: "amend-semantics",
    target: "rule/guard.quorum",
    from: 5,
    to: 3,
    authorizedBy: "guard-v1",
  }),
  entry("unknown-target", "unknown target", "targets a rule that does not exist", {
    kind: "amend-semantics",
    target: "rule/guard.nonexistent",
    from: 2,
    to: 3,
    authorizedBy: "guard-v1",
  }),
  entry("extra-field", "unknown field", "carries an unrecognised field", {
    kind: "amend-semantics",
    target: "rule/guard.quorum",
    from: 2,
    to: 3,
    authorizedBy: "guard-v1",
    note: "ignore me",
  }),
  entry("type-confusion", "wrong type", "to is a string where a number is required", {
    kind: "amend-semantics",
    target: "rule/guard.quorum",
    from: 2,
    to: "3",
    authorizedBy: "guard-v1",
  }),
  entry("out-of-range", "out of range", "to exceeds the declared range", {
    kind: "amend-semantics",
    target: "rule/guard.quorum",
    from: 2,
    to: 999,
    authorizedBy: "guard-v1",
  }),
  entry(
    "non-canonical-key-order",
    "non-canonical: key order",
    "identical content, keys in a different order",
    { kind: "amend-semantics", target: "rule/guard.quorum", from: 2, to: 3, authorizedBy: "guard-v1" },
    '{"to":3,"from":2,"target":"rule/guard.quorum","authorizedBy":"guard-v1","kind":"amend-semantics"}',
  ),
  entry(
    "duplicate-keys",
    "non-canonical: duplicate keys",
    "the same key appears twice on the wire",
    { kind: "amend-semantics", target: "rule/guard.quorum", from: 2, to: 3, authorizedBy: "guard-v1" },
    '{"kind":"amend-semantics","kind":"amend-semantics","target":"rule/guard.quorum","from":2,"to":3,"authorizedBy":"guard-v1"}',
  ),
  entry(
    "insignificant-whitespace",
    "non-canonical: whitespace",
    "canonical field order but padded with whitespace",
    { kind: "amend-semantics", target: "rule/guard.quorum", from: 2, to: 3, authorizedBy: "guard-v1" },
    '{ "kind": "amend-semantics", "target": "rule/guard.quorum", "from": 2, "to": 3, "authorizedBy": "guard-v1" }',
  ),
];

export function classesCoveredBy(clauseId: string): string[] {
  const classes = new Set<string>();
  for (const item of CORPUS) {
    const decision = decide(MINIMAL_SPEC, item, CONTEXT);
    if (decision.unresolved.includes(clauseId)) classes.add(item.className);
  }
  return [...classes].sort();
}
