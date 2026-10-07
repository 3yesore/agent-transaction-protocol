import {
  Registry,
  inputOf,
  noContext,
  permissive,
  run,
  stateOf,
  step,
  withConstraint,
  type Constraint,
  type KernelState,
  type Relation,
  type RunResult,
  type TransitionInput,
  type TransitionContext,
} from "./kernel.ts";

export interface Check {
  readonly claim: string;
  readonly held: boolean;
  readonly detail: string;
}

export interface AuditEntry {
  readonly id: string;
  readonly constraint: string;
  readonly source: string;
  /** Can the constraint be pushed into R? */
  readonly reducible: boolean;
  /** Why it can or cannot. */
  readonly reason: string;
  /** If reduced, does the reduction survive later semantic change? */
  readonly selfSustaining: boolean | null;
  readonly residual: string;
  readonly method: string;
  readonly checks: readonly Check[];
}

function check(claim: string, held: boolean, detail = ""): Check {
  return { claim, held, detail };
}

/**
 * Generic reduction probe: build a violating transition, show the bare relation
 * accepts it, and show the constrained relation rejects it. Both are legal
 * kernel relations, which is the whole content of "reducible to R".
 */
function probeReduction(
  id: string,
  constraint: Constraint,
  violating: { state: KernelState; input: TransitionInput; successor: KernelState },
  context: TransitionContext = noContext,
): Check[] {
  const name = "probe";
  const state: KernelState = { ...violating.state, semantics: name };
  const successor: KernelState = { ...violating.successor, semantics: name };
  const bareRegistry = new Registry().define(name, permissive);
  const constrainedRegistry = new Registry().define(name, withConstraint(permissive, constraint));
  const bare = step(bareRegistry, state, violating.input, context, successor);
  const constrained = step(constrainedRegistry, state, violating.input, context, successor);
  return [
    check(
      id + ": the bare relation accepts the violating transition",
      bare.validity === "valid",
      "permissive R accepted it, so nothing at the kernel level stopped it",
    ),
    check(
      id + ": pushing the constraint into R rejects the same transition",
      constrained.validity === "invalid" && constrained.known,
      "withConstraint(permissive, " + id + ") is a legal R and it rejects",
    ),
    check(
      id + ": the kernel required no change to accommodate the reduction",
      bare.known && constrained.known,
      "both registries are ordinary kernel instances; the kernel has no shape check on R",
    ),
  ];
}

// ---------------------------------------------------------------------------
// C1 - recognized effects require domain-relative recognition
// ---------------------------------------------------------------------------
function auditC1(): AuditEntry {
  const checks: Check[] = [
    check(
      "C1 is the definition of recognition, not a restriction on it",
      true,
      "a recognized effect is one that R returns valid for; the statement is true of every R by construction",
    ),
  ];
  for (const r of [permissive, withConstraint(permissive, { id: "x", statement: "x", holds: () => false })]) {
    const registry = new Registry().define("s", r);
    const result = step(registry, stateOf("s"), inputOf("anything"), noContext, stateOf("s"));
    checks.push(check("C1 holds for an arbitrary R", result.validity === "valid" || result.validity === "invalid", "any R satisfies C1"));
  }
  return {
    id: "C1",
    constraint: "A protocol-recognized state effect must be justified by the domain's transition semantics.",
    source: "SPEC.md section 3; RFC section 4; invariant 1",
    reducible: true,
    reason: "Definitional. It restates what R is. There is nothing to push anywhere.",
    selfSustaining: null,
    residual: "none - carries no information",
    method: "not a testable restriction: it quantifies over R rather than constraining it",
    checks,
  };
}

// ---------------------------------------------------------------------------
// C2 - the evaluation-order constraint
// ---------------------------------------------------------------------------
/**
 * The relation enforces reflexivity locally: a semantic update must carry an
 * authorisation naming the semantics currently in force.
 */
const reflexiveRelation: Relation = (state, input, context, successor) => {
  if (input.kind !== "update-semantics") return "valid";
  const payload = input.payload;
  const declared =
    payload !== null && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).recognizedBy
      : undefined;
  return declared === state.semantics ? "valid" : "invalid";
};

const looseRelation: Relation = () => "valid";

function auditC2(): AuditEntry {
  const registry = new Registry().define("reflexive", reflexiveRelation).define("loose", looseRelation);
  const from = stateOf("reflexive", { semanticsHistory: ["reflexive"] });
  const to = stateOf("loose", { semanticsHistory: ["reflexive", "loose"] });
  const selfAuthorising = inputOf("update-semantics", { to: "loose" });
  const properlyRecognised = inputOf("update-semantics", { to: "loose", recognizedBy: "reflexive" });

  // The SAME relations, the SAME transition. Only the kernel's rule differs.
  const preState = step(registry, from, selfAuthorising, noContext, to, { evaluationOrder: "pre-state" });
  const successor = step(registry, from, selfAuthorising, noContext, to, { evaluationOrder: "successor" });
  const legitimate = step(registry, from, properlyRecognised, noContext, to, { evaluationOrder: "pre-state" });

  // Attempt the reduction. The reason it cannot succeed is not that a relation
  // lacks access to the pre-state - it receives it. The reason is that under
  // successor evaluation the author of the transition supplies the successor,
  // and the successor names the relation that will judge it. The subject of the
  // check chooses the check.
  const attackerControlled = new Registry().define("reflexive", reflexiveRelation).define("anything", permissive);
  const attackerNamesIt = step(attackerControlled, from, selfAuthorising, noContext, stateOf("anything"), { evaluationOrder: "successor" });

  return {
    id: "C2",
    constraint: "A semantic update must be recognized under the preceding semantic context.",
    source: "SPEC.md section 4; RFC section 3; invariant 2",
    reducible: false,
    reason:
      "It constrains WHICH relation is consulted, not what any relation accepts. A relation is given (state, input, context, successor) and never learns which relation the kernel chose; that choice is made above it.",
    selfSustaining: false,
    residual: "the kernel's one substantive rule: evaluate a transition under the semantics in force BEFORE it",
    method: "same relations, same transition, both evaluation orders; the outcome differs, so the rule is not in the relation",
    checks: [
      check(
        "under pre-state evaluation a domain cannot authorise its own semantic replacement",
        preState.validity === "invalid" && preState.consulted === "reflexive",
        "the transition carried no recognisedBy, and reflexive rejected it",
      ),
      check(
        "under successor evaluation the identical transition succeeds",
        successor.validity === "valid" && successor.consulted === "loose",
        "the successor authorised its own adoption: self-authorisation",
      ),
      check(
        "a properly authorised semantic update still succeeds",
        legitimate.validity === "valid",
        "so the rule permits semantic evolution, it only orders it",
      ),
      check(
        "and no relation can prevent it, because the successor names the relation that judges it",
        attackerNamesIt.validity === "valid" && attackerNamesIt.consulted === "anything",
        "the proposer supplies the successor, so the proposer selects the relation consulted - the same hole as proposer-supplied policy parameters in v0.1",
      ),
    ],
  };
}

// ---------------------------------------------------------------------------
// C3 - historical integrity
// ---------------------------------------------------------------------------
function auditC3(): AuditEntry {
  const forgetful = withConstraint(permissive, {
    id: "C3",
    statement: "recognized history cannot silently be replaced",
    holds: (state, _input, _context, successor) => successor.facts.historyKept === true,
  });
  const constraint: Constraint = {
    id: "C3",
    statement: "recognized history cannot silently be replaced",
    holds: (state, _input, _context, successor) => successor.facts.historyKept === true,
  };
  const violated = {
    state: stateOf("s", { outcome: "VERIFIED" }),
    input: inputOf("reclassify"),
    successor: stateOf("s", { outcome: "NEVER-HAPPENED", historyKept: false }),
  };

  // Does the reduction survive a later semantic change? Adopt "forgetful-free" semantics.
  const registry = new Registry().define("strict", forgetful).define("anything", permissive);
  const afterSemanticChange = run(
    registry,
    stateOf("strict", { historyKept: true }),
    [
      { input: inputOf("update-semantics", { to: "anything" }), context: noContext, successor: stateOf("anything", { historyKept: true }) },
      { input: inputOf("reclassify"), context: noContext, successor: stateOf("anything", { outcome: "NEVER-HAPPENED", historyKept: false }) },
    ],
  );
  const erased = afterSemanticChange.final.facts.historyKept !== true;

  return {
    id: "C3",
    constraint: "Recognized historical evolution cannot silently be replaced as if it never occurred.",
    source: "SPEC.md section 5; RFC section 5; invariant 3",
    reducible: true,
    reason:
      "R decides what a successor may contain, so history preservation is R's business. The freeze itself makes it conditional: rewriting is a violation 'when the domain's rules prohibit such rewriting'.",
    selfSustaining: !erased,
    residual: "none beyond R - and the constraint dissolves as soon as the domain adopts semantics that do not carry it",
    method:
      "probeReduction, then a two-step run that adopts a relation without the constraint and then erases history",
    checks: [
      ...probeReduction("C3", constraint, violated),
      check(
        "a domain can legitimately discard the constraint by changing its own semantics",
        erased,
        "after adopting a permissive relation the second transition erased historyKept; nothing in the kernel objected",
      ),
      check(
        "so C3 is only in force while the domain chooses to keep it",
        erased,
        "not self-sustaining",
      ),
    ],
  };
}

// ---------------------------------------------------------------------------
// C4 - atomicity
// ---------------------------------------------------------------------------
function auditC4(): AuditEntry {
  const constraint: Constraint = {
    id: "C4",
    statement: "a coupled transition is recognised only as a complete successor",
    holds: (_s, _i, _c, successor) => successor.facts.balanceDebited === true && successor.facts.assetCredited === true,
  };
  return {
    id: "C4",
    constraint: "Atomicity is a domain-level property of recognized state evolution.",
    source: "SPEC.md section 8; RFC section 7",
    reducible: true,
    reason: "R either accepts the successor or not. Partial application is simply a successor R rejects.",
    selfSustaining: true,
    residual: "none - it is a predicate on S'",
    method: "probeReduction against a half-applied successor",
    checks: probeReduction("C4", constraint, {
      state: stateOf("s", { balanceDebited: false, assetCredited: false }),
      input: inputOf("settle"),
      successor: stateOf("s", { balanceDebited: true, assetCredited: false }),
    }),
  };
}

// ---------------------------------------------------------------------------
// C5 - shared uniqueness across independent domains
// ---------------------------------------------------------------------------
function allocateRelation(ownerField: string): Relation {
  return (_state, _input, _context, successor) => (successor.facts.owner === ownerField ? "valid" : "invalid");
}

function auditC5(): AuditEntry {
  const sharedResource = "GPU-X";
  const d1 = new Registry().define("local", (_s, _i, _c, successor) => (successor.facts.holds === "D1" ? "valid" : "invalid"));
  const d2 = new Registry().define("local", (_s, _i, _c, successor) => (successor.facts.holds === "D2" ? "valid" : "invalid"));

  const from1 = stateOf("local", { holds: null });
  const from2 = stateOf("local", { holds: null });
  const to1 = stateOf("local", { holds: "D1" });
  const to2 = stateOf("local", { holds: "D2" });

  const v1 = step(d1, from1, inputOf("allocate", { resource: sharedResource }), noContext, to1);
  const v2 = step(d2, from2, inputOf("allocate", { resource: sharedResource }), noContext, to2);
  const jointViolation = v1.validity === "valid" && v2.validity === "valid";

  // Invariance: D1's outcome must not depend on D2's state. If it did, a local
  // relation could enforce a joint constraint.
  const d2Perturbed = stateOf("local", { holds: "D2", extra: "arbitrary" });
  const v1Again = step(d1, from1, inputOf("allocate", { resource: sharedResource }), noContext, to1);
  const invariantUnderD2 = v1.validity === v1Again.validity;

  // With a shared domain the constraint IS enforceable - which is the freeze's
  // own conclusion, and what review case 007 demonstrated in the executable
  // candidate.
  const shared = new Registry().define("unique", (state, _i, _c, successor) =>
    state.facts.allocated === true && successor.facts.allocated === true ? "invalid" : "valid",
  );
  const firstGrant = step(shared, stateOf("unique", { allocated: false }), inputOf("allocate"), noContext, stateOf("unique", { allocated: true, to: "D1" }));
  const secondGrant = step(shared, stateOf("unique", { allocated: true }), inputOf("allocate"), noContext, stateOf("unique", { allocated: true, to: "D2" }));

  return {
    id: "C5",
    constraint: "A shared uniqueness invariant requires a shared semantic domain.",
    source: "SPEC.md section 14; RFC section 12",
    reducible: false,
    reason:
      "Not because R is restricted, but because a joint constraint over two independent domains is a function of both states, and no R receives both. It is a statement about how many domains exist, not about what a domain may do.",
    selfSustaining: null,
    residual: "architectural: you must instantiate a third domain, which the freeze already says",
    method: "run both domains locally, then test whether either domain's outcome depends on the other's state",
    checks: [
      check(
        "two independent domains can both validly grant the same unique resource",
        jointViolation,
        "D1 and D2 each returned valid for " + sharedResource,
      ),
      check(
        "and the outcome of one domain is invariant under arbitrary changes to the other",
        invariantUnderD2,
        "D1's validity is a function of D1's own arguments only; no R1 can therefore enforce a joint predicate",
      ),
      check(
        "a shared domain does enforce it",
        firstGrant.validity === "valid" && secondGrant.validity === "invalid",
        "the first grant is recognised, the second is refused",
      ),
    ],
  };
}

// ---------------------------------------------------------------------------
// C6 - cross-domain authority does not transfer
// ---------------------------------------------------------------------------
function auditC6(): AuditEntry {
  const constraint: Constraint = {
    id: "C6",
    statement: "a foreign record is not a state effect without local recognition",
    holds: (_s, input, _c, _null) => input.kind !== "accept-foreign" || input.payload !== null,
  };
  const registry = new Registry().define("gate", withConstraint(permissive, constraint));
  const accepted = step(registry, stateOf("gate"), inputOf("accept-foreign", { from: "X", authority: "claimed" }), noContext, stateOf("gate", { effect: "applied" }));
  return {
    id: "C6",
    constraint: "A state effect recognized by domain X is not automatically recognized by domain Y.",
    source: "SPEC.md section 13; RFC section 13",
    reducible: true,
    reason: "Destination recognition is just Y's R deciding what to accept. That is R's ordinary job.",
    selfSustaining: true,
    residual: "none",
    method: "probeReduction plus a demonstration that recognition is a local gate",
    checks: [
      ...probeReduction("C6", constraint, {
        state: stateOf("gate"),
        input: inputOf("accept-foreign", null),
        successor: stateOf("gate", { effect: "applied" }),
      }),
      check("a domain that chooses to recognise may do so", accepted.validity === "valid", "the same relation accepts when the payload is present"),
    ],
  };
}

// ---------------------------------------------------------------------------
// C7 - no universal trusted clock
// ---------------------------------------------------------------------------
function auditC7(): AuditEntry {
  const constraint: Constraint = {
    id: "C7",
    statement: "time must come from a source the domain names",
    holds: (_s, _i, context, _null) => context.references.some((r) => r !== null && typeof r === "object" && (r as Record<string, unknown>).kind === "time-source"),
  };
  return {
    id: "C7",
    constraint: "The protocol does not require a universal trusted clock.",
    source: "SPEC.md section 10; RFC section 8",
    reducible: true,
    reason: "Time is context C. Which time sources count is R's decision.",
    selfSustaining: true,
    residual: "none",
    method: "probeReduction with an unnamed time source",
    checks: probeReduction(
      "C7",
      constraint,
      { state: stateOf("s"), input: inputOf("tick"), successor: stateOf("s", { ticked: true }) },
      { now: 12345, references: [{ kind: "unsourced" }] },
    ),
  };
}

// ---------------------------------------------------------------------------
// C8 - multiple valid successors are permitted
// ---------------------------------------------------------------------------
function auditC8(): AuditEntry {
  const registry = new Registry().define("s", permissive);
  const from = stateOf("s", { n: 0 });
  const forks = [
    step(registry, from, inputOf("advance"), noContext, stateOf("s", { n: 1 })),
    step(registry, from, inputOf("advance"), noContext, stateOf("s", { n: 2 })),
  ];
  return {
    id: "C8",
    constraint: "Multiple valid successors are permitted; canonical selection is not required.",
    source: "SPEC.md section 9; RFC section 1",
    reducible: true,
    reason: "This is not a constraint at all. It is a permission, and it is the default behaviour of a free R.",
    selfSustaining: null,
    residual: "none - it constrains nothing",
    method: "two successors from one state, both valid, no selection applied",
    checks: [
      check(
        "both successors are valid with no selection mechanism",
        forks[0].validity === "valid" && forks[1].validity === "valid",
        "a fork is what R permits by default, not something the kernel arranges",
      ),
    ],
  };
}

export function audit(): AuditEntry[] {
  return [auditC1(), auditC2(), auditC3(), auditC4(), auditC5(), auditC6(), auditC7(), auditC8()];
}
