/**
 * The ATP-0002 freeze kernel, as code.
 *
 *   D = (S0, R0)
 *   R(S, X, C, S') -> valid / invalid
 *
 * The point of writing it down is to make "push this constraint into R" a
 * literal, executable operation instead of a figure of speech, and then to look
 * for constraints that the operation cannot absorb.
 */
export type Validity = "valid" | "invalid";
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface KernelState {
  /** Names the relation in force. This is what makes semantics evolvable. */
  readonly semantics: string;
  readonly facts: Record<string, JsonValue>;
}

export interface TransitionInput {
  readonly kind: string;
  readonly payload: JsonValue;
}

export interface TransitionContext {
  readonly now: number;
  readonly references: readonly JsonValue[];
}

export type Relation = (
  state: KernelState,
  input: TransitionInput,
  context: TransitionContext,
  successor: KernelState,
) => Validity;

export interface RelationRegistry {
  resolve(name: string): Relation | undefined;
}

export class Registry implements RelationRegistry {
  #relations = new Map<string, Relation>();

  define(name: string, relation: Relation): this {
    this.#relations.set(name, relation);
    return this;
  }

  resolve(name: string): Relation | undefined {
    return this.#relations.get(name);
  }

  names(): string[] {
    return [...this.#relations.keys()].sort();
  }
}

/**
 * Which relation the kernel consults when it evaluates a transition.
 *
 * "pre-state"      - the semantics in force BEFORE the transition. A semantic
 *                    change must therefore be authorised by what it replaces.
 * "successor"      - the semantics carried by the candidate successor. A
 *                    successor can then authorise its own adoption.
 */
export type EvaluationOrder = "pre-state" | "successor";

export interface KernelOptions {
  readonly evaluationOrder?: EvaluationOrder;
}

export interface StepResult {
  readonly validity: Validity;
  /** Which relation actually decided. */
  readonly decidedBy: string;
  readonly consulted: string;
  readonly known: boolean;
}

export function step(
  registry: RelationRegistry,
  state: KernelState,
  input: TransitionInput,
  context: TransitionContext,
  successor: KernelState,
  options: KernelOptions = {},
): StepResult {
  const order = options.evaluationOrder ?? "pre-state";
  const consulted = order === "pre-state" ? state.semantics : successor.semantics;
  const relation = registry.resolve(consulted);
  if (!relation) {
    return { validity: "invalid", decidedBy: consulted, consulted, known: false };
  }
  return { validity: relation(state, input, context, successor), decidedBy: consulted, consulted, known: true };
}

/** The bare, maximally permissive relation: a legal R that rejects nothing. */
export const permissive: Relation = () => "valid";

export interface Constraint {
  readonly id: string;
  readonly statement: string;
  holds(state: KernelState, input: TransitionInput, context: TransitionContext, successor: KernelState): boolean;
}

/**
 * The reduction operation, made literal: pushing a constraint into R.
 *
 * The kernel places no restriction on the shape of R, so this always produces a
 * legal relation. That, and nothing more, is what "reducible to R" means.
 */
export function withConstraint(relation: Relation, constraint: Constraint): Relation {
  return (state, input, context, successor) => {
    if (relation(state, input, context, successor) !== "valid") return "invalid";
    return constraint.holds(state, input, context, successor) ? "valid" : "invalid";
  };
}

export interface TrailEntry {
  readonly index: number;
  readonly inputKind: string;
  readonly consulted: string;
  readonly validity: Validity;
  readonly state: KernelState;
}

export interface RunResult {
  readonly trail: readonly TrailEntry[];
  readonly final: KernelState;
  readonly rejected: number;
}

/** Applies a sequence of transitions, stopping at the first rejection. */
export function run(
  registry: RelationRegistry,
  s0: KernelState,
  steps: ReadonlyArray<{ input: TransitionInput; context: TransitionContext; successor: KernelState }>,
  options: KernelOptions = {},
): RunResult {
  const trail: TrailEntry[] = [];
  let state = s0;
  let rejected = 0;
  for (let index = 0; index < steps.length; index++) {
    const current = steps[index];
    const result = step(registry, state, current.input, current.context, current.successor, options);
    if (result.validity === "invalid") {
      rejected++;
      break;
    }
    state = current.successor;
    trail.push({ index, inputKind: current.input.kind, consulted: result.consulted, validity: result.validity, state });
  }
  return { trail, final: state, rejected };
}

export function stateOf(semantics: string, facts: Record<string, JsonValue> = {}): KernelState {
  return { semantics, facts };
}

export function inputOf(kind: string, payload: JsonValue = null): TransitionInput {
  return { kind, payload };
}

export const noContext: TransitionContext = { now: 0, references: [] };
