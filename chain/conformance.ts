import { policyDocument } from "../kernel/policy.ts";
import type { ConformanceTarget, SemanticChangeRequest, Validity } from "../conformance/adapter.ts";
import { Chain, type ChainConfig } from "./chain.ts";

/**
 * The chain skeleton as an ATP-0002 conformance target.
 *
 * This closes the loop: the thing that would be shipped as a client has to pass
 * the five behavioural probes, including P2 - a semantic change must be
 * authorised by the semantics it replaces.
 */
export function chainConformanceTarget(config: Omit<ChainConfig, "semantics" | "selector"> & { selector: ChainConfig["selector"] }): ConformanceTarget {
  const STRICT = policyDocument({ id: "guard", rules: [{ type: "actor-in", params: { actors: ["admin"] } }] });
  const OPEN = policyDocument({ id: "guard", rules: [{ type: "allow-all" }] });
  let chain: Chain;
  let counter = 0;
  const build = (): Chain => {
    counter = 0;
    return new Chain({ ...config, semantics: STRICT });
  };
  chain = build();
  return {
    name: "chain/ single-writer skeleton",
    description: "the chain skeleton with its semantics in state at policy/guard and an actor-in guard",
    reset() {
      chain = build();
    },
    genesisSemantics() {
      return chain.stateRoot.length > 0 ? "policy/guard" : "unreachable";
    },
    proposeSemanticChange(request: SemanticChangeRequest): Validity {
      const result = chain.amend(request.toPermissive ? OPEN : STRICT, "amend-" + ++counter, request.actor, 1);
      return result.valid ? "valid" : "invalid";
    },
    proposeOrdinary(actor: string): Validity {
      const result = chain.submit({
        id: "ordinary-" + ++counter,
        domain: config.id,
        actor,
        intent: "an ordinary transition",
        policy: { id: "guard" },
        preconditions: [],
        effects: [{ op: "create", key: "action/A" + counter, value: { ok: true } }],
        evidence: [],
        parents: [],
        createdAt: 1,
      });
      return result.valid ? "valid" : "invalid";
    },
  };
}
