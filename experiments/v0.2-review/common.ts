import { Domain } from "../../kernel/domain.ts";
import { createIntegrityVerifier } from "../../kernel/evidence.ts";
import { policyDocument } from "../../kernel/policy.ts";
import type {
  Effect,
  PolicyDocument,
  Precondition,
  StateDocument,
  TransitionProposal,
} from "../../kernel/types.ts";
import { genesisPolicy, standardInterpreter, standardPreconditions } from "../../extensions/index.ts";

export function clock(start = 1000, step = 10): { now: () => number; set: (value: number) => void; peek: () => number } {
  let t = start;
  return {
    now: () => (t += step),
    set: (value: number) => {
      t = value;
    },
    peek: () => t,
  };
}

export function makeDomain(input: {
  readonly id: string;
  readonly clock: () => number;
  readonly policies?: readonly PolicyDocument[];
  readonly state?: readonly StateDocument[];
}): Domain {
  return new Domain({
    id: input.id,
    interpreter: standardInterpreter(),
    verifier: createIntegrityVerifier(),
    preconditions: standardPreconditions(),
    clock: input.clock,
    initialState: [...(input.policies ?? []).map((policy) => genesisPolicy(policy)), ...(input.state ?? [])],
  });
}

let counter = 0;
export function nextId(prefix = "t"): string {
  return prefix + "-" + ++counter;
}

export function proposal(input: {
  readonly domain: string;
  readonly actor: string;
  readonly intent: string;
  readonly policy: string;
  readonly effects: readonly Effect[];
  readonly evidence?: readonly string[];
  readonly preconditions?: readonly Precondition[];
  readonly expectedPolicyVersion?: number;
  readonly createdAt?: number;
  readonly id?: string;
}): TransitionProposal {
  const ref: { id: string; expectedVersion?: number } = { id: input.policy };
  if (input.expectedPolicyVersion !== undefined) ref.expectedVersion = input.expectedPolicyVersion;
  return {
    id: input.id ?? nextId(),
    domain: input.domain,
    actor: input.actor,
    intent: input.intent,
    policy: ref,
    preconditions: input.preconditions ?? [],
    effects: input.effects,
    evidence: input.evidence ?? [],
    parents: [],
    createdAt: input.createdAt ?? 1,
  };
}

export const allowPolicy = (id = "allow"): PolicyDocument =>
  policyDocument({ id, rules: [{ type: "allow-all" }] });

export const actorPolicy = (id: string, actors: readonly string[]): PolicyDocument =>
  policyDocument({ id, rules: [{ type: "actor-in", params: { actors: [...actors] } }] });

/** Actor gate plus capability conservation: the standard settlement policy. */
export const transferPolicy = (id: string, actors: readonly string[]): PolicyDocument =>
  policyDocument({
    id,
    rules: [{ type: "actor-in", params: { actors: [...actors] } }, { type: "capability-conserved-effect" }],
  });
