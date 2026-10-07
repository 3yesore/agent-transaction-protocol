import type { ConformanceTarget, Probe } from "./adapter.ts";
import { probeResult } from "./adapter.ts";

/**
 * The ATP-0002 conformance probes.
 *
 * They are deliberately few and behavioural. The kernel claims exactly one
 * substantive rule, so a conformance suite for it should be small enough that a
 * failure points at that rule.
 */

export const P1_GENESIS: Probe = {
  id: "P1-genesis",
  requirement: "SPEC 2: D = (S0, R0), an initial semantic state.",
  expectation: "the implementation exposes a semantic context at genesis",
  run(target) {
    target.reset();
    const semantics = target.genesisSemantics();
    return probeResult(this, typeof semantics === "string" && semantics.length > 0, "genesis semantics = " + JSON.stringify(semantics));
  },
};

export const P2_PRE_STATE: Probe = {
  id: "P2-pre-state-evaluation",
  requirement: "SPEC 4: the transition that introduces R1 must be recognized under the preceding semantic context R0.",
  expectation: "a semantic change that the PRE-state semantics does not authorise is rejected, even when the successor semantics would accept it",
  run(target) {
    target.reset();
    const verdict = target.proposeSemanticChange({ actor: "intruder", toPermissive: true, authorised: false });
    return probeResult(
      this,
      verdict === "invalid",
      "verdict = " + verdict + "; a conforming implementation consults the semantics in force before the transition",
    );
  },
};

export const P3_EVOLUTION: Probe = {
  id: "P3-permitted-evolution",
  requirement: "SPEC 4: semantics may itself evolve.",
  expectation: "a semantic change that the pre-state semantics DOES authorise is accepted",
  run(target) {
    target.reset();
    const verdict = target.proposeSemanticChange({ actor: "admin", toPermissive: true, authorised: true });
    return probeResult(this, verdict === "valid", "verdict = " + verdict + "; the rule orders semantic change, it does not forbid it");
  },
};

export const P4_NON_DEGENERATE: Probe = {
  id: "P4-ordinary-transition",
  requirement: "SPEC 2: R(S, X, C, S') -> valid / invalid.",
  expectation: "an ordinary transition that the semantics in force permits is accepted, so the target is not rejecting everything",
  run(target) {
    target.reset();
    const verdict = target.proposeOrdinary("admin");
    return probeResult(this, verdict === "valid", "verdict = " + verdict);
  },
};

export const P5_DETERMINISM: Probe = {
  id: "P5-determinism",
  requirement: "SPEC 2: R is a relation; the same state, input, context and successor have one verdict.",
  expectation: "two fresh instances given identical inputs return the same verdict",
  run(target) {
    target.reset();
    const first = target.proposeSemanticChange({ actor: "intruder", toPermissive: true, authorised: false });
    target.reset();
    const second = target.proposeSemanticChange({ actor: "intruder", toPermissive: true, authorised: false });
    return probeResult(this, first === second, "first = " + first + ", second = " + second);
  },
};

export const PROBES: readonly Probe[] = [P1_GENESIS, P2_PRE_STATE, P3_EVOLUTION, P4_NON_DEGENERATE, P5_DETERMINISM];

export function runProbes(target: ConformanceTarget): { results: ReturnType<Probe["run"]>[]; failed: string[] } {
  const results = PROBES.map((probe) => probe.run(target));
  const failed = results.filter((r) => !r.passed).map((r) => r.probe);
  return { results, failed };
}
