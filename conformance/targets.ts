import { Domain } from "../kernel/domain.ts";
import { createIntegrityVerifier } from "../kernel/evidence.ts";
import { policyDocument } from "../kernel/policy.ts";
import type { JsonValue } from "../kernel/types.ts";
import { genesisPolicy, standardInterpreter, standardPreconditions } from "../extensions/index.ts";
import {
  Registry,
  inputOf,
  noContext,
  permissive,
  stateOf,
  step,
  type EvaluationOrder,
  type Relation,
} from "../experiments/reduction/kernel.ts";
import type { ConformanceTarget, SemanticChangeRequest, Validity } from "./adapter.ts";

const GUARD = policyDocument({ id: "guard", rules: [{ type: "actor-in", params: { actors: ["admin"] } }] });
const OPEN = policyDocument({ id: "guard", rules: [{ type: "allow-all" }] });

/**
 * The real implementation in kernel/, driven end to end.
 *
 * Its semantic context is @@policy/guard@@ held in state, and a semantic change
 * is an ordinary transition that amends that document. This is the only target
 * here that is an implementation rather than a model of one.
 */
export function referenceTarget(): ConformanceTarget {
  let domain: Domain;
  let counter = 0;
  const build = (): Domain => {
    counter = 0;
    return new Domain({
      id: "conformance",
      interpreter: standardInterpreter(),
      verifier: createIntegrityVerifier(),
      preconditions: standardPreconditions(),
      clock: () => 1,
      initialState: [genesisPolicy(GUARD)],
    });
  };
  domain = build();
  return {
    name: "kernel/ reference implementation",
    description:
      "the four-primitive candidate in kernel/; the semantic context is policy/guard in state, and a semantic change is a transition that amends it",
    reset() {
      domain = build();
    },
    genesisSemantics() {
      return "policy/guard";
    },
    proposeSemanticChange(request: SemanticChangeRequest): Validity {
      const doc = domain.policyDocument("guard");
      if (!doc) return "invalid";
      const next = request.toPermissive ? OPEN : GUARD;
      const result = domain.propose({
        id: "conf-" + ++counter,
        domain: "conformance",
        actor: request.actor,
        intent: "amend the guard policy",
        policy: { id: "guard" },
        preconditions: [],
        effects: [{ op: "update", key: "policy/guard", value: next as unknown as JsonValue, expectVersion: doc.version }],
        evidence: [],
        parents: [],
        createdAt: 1,
      });
      return result.committed ? "valid" : "invalid";
    },
    proposeOrdinary(actor: string): Validity {
      const result = domain.propose({
        id: "conf-" + ++counter,
        domain: "conformance",
        actor,
        intent: "an ordinary transition",
        policy: { id: "guard" },
        preconditions: [],
        effects: [{ op: "create", key: "action/A" + counter, value: { ok: true } as JsonValue }],
        evidence: [],
        parents: [],
        createdAt: 1,
      });
      return result.committed ? "valid" : "invalid";
    },
  };
}

function payloadOf(input: { payload: JsonValue }): Record<string, unknown> {
  const value = input.payload;
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/** A relation that requires a semantic change to name the semantics in force. */
const strictRelation: Relation = (state, input) => {
  if (input.kind !== "update-semantics") return "valid";
  return payloadOf(input).recognizedBy === state.semantics ? "valid" : "invalid";
};

/** A relation that refuses everything. */
const refusingRelation: Relation = () => "invalid";

/** A relation whose verdict depends on how many times it has been asked. */
let flips = 0;
const flippyRelation: Relation = (_state, input) => {
  if (input.kind !== "update-semantics") return "valid";
  flips += 1;
  return flips % 2 === 0 ? "valid" : "invalid";
};

export function resetFlippy(): void {
  flips = 0;
}

/**
 * A target backed by the abstract freeze kernel, so that the probes can be
 * pointed at pure relations as well as at a real implementation.
 */
export function kernelTarget(config: {
  readonly name: string;
  readonly description: string;
  readonly evaluationOrder: EvaluationOrder;
  readonly guard: Relation;
}): ConformanceTarget {
  let registry: Registry;
  const build = (): Registry => new Registry().define("guard", config.guard).define("open", permissive);
  registry = build();
  return {
    name: config.name,
    description: config.description,
    reset() {
      registry = build();
    },
    genesisSemantics() {
      return "guard";
    },
    proposeSemanticChange(request: SemanticChangeRequest) {
      const to = stateOf(request.toPermissive ? "open" : "guard", {});
      const payload = request.authorised ? { to: to.semantics, recognizedBy: "guard" } : { to: to.semantics };
      const result = step(registry, stateOf("guard", {}), inputOf("update-semantics", payload as unknown as JsonValue), noContext, to, {
        evaluationOrder: config.evaluationOrder,
      });
      return result.validity;
    },
    proposeOrdinary() {
      const result = step(registry, stateOf("guard", {}), inputOf("ordinary"), noContext, stateOf("guard", { done: true }), {
        evaluationOrder: config.evaluationOrder,
      });
      return result.validity;
    },
  };
}

export interface RegisteredTarget {
  readonly target: ConformanceTarget;
  /** "conforms", or the exact probe ids this target is expected to fail. */
  readonly expect: "conforms" | readonly string[];
}

export function registeredTargets(): RegisteredTarget[] {
  resetFlippy();
  return [
    { target: referenceTarget(), expect: "conforms" },
    {
      target: kernelTarget({
        name: "abstract kernel, pre-state evaluation",
        description: "the freeze kernel with the rule under test and a strict semantic relation: the control",
        evaluationOrder: "pre-state",
        guard: strictRelation,
      }),
      expect: "conforms",
    },
    {
      target: kernelTarget({
        name: "mutant: successor evaluation",
        description: "identical relations, but the kernel consults the successor's semantics; this is the rule removed",
        evaluationOrder: "successor",
        guard: strictRelation,
      }),
      expect: ["P2-pre-state-evaluation"],
    },
    {
      target: kernelTarget({
        name: "mutant: permissive semantics",
        description: "the semantics in force accepts everything, so nothing constrains its own replacement",
        evaluationOrder: "pre-state",
        guard: permissive,
      }),
      expect: ["P2-pre-state-evaluation"],
    },
    {
      target: kernelTarget({
        name: "mutant: refusing semantics",
        description: "rejects everything, which passes the safety probe by being useless",
        evaluationOrder: "pre-state",
        guard: refusingRelation,
      }),
      expect: ["P3-permitted-evolution", "P4-ordinary-transition"],
    },
    {
      target: kernelTarget({
        name: "mutant: non-deterministic semantics",
        description: "the verdict depends on how many times the relation has been asked",
        evaluationOrder: "pre-state",
        guard: flippyRelation,
      }),
      expect: ["P5-determinism"],
    },
  ];
}
