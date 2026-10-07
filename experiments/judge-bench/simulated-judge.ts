import type { DecisionProvider, DecisionRequest, DecisionResponse } from "../../extensions/decision-provider.ts";
import { ruleProvider } from "../../extensions/decision-provider.ts";

/** Deterministic PRNG so every sweep is reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function stableHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface SimulatedJudgeConfig {
  readonly id: string;
  /** P(conclude AFFIRM | truth is DENY). The dangerous direction. */
  readonly falseAffirmRate: number;
  /** P(conclude DENY | truth is AFFIRM). */
  readonly falseDenyRate: number;
  readonly abstainRate?: number;
  /** P(output that fails the Decision schema at all, e.g. a missing rationale). */
  readonly malformedRate?: number;
  readonly confidence?: number | null;
  readonly seed: number;
}

/**
 * A judge whose error behaviour is a parameter, not a mystery.
 *
 * This is what makes the benchmark useful before any model is involved: it lets
 * the protocol-level consequence of an error rate be derived, so a real model
 * can later be placed on the curve instead of being judged by a single number.
 */
export function simulatedJudge(input: {
  readonly config: SimulatedJudgeConfig;
  readonly truthOf: (request: DecisionRequest) => "AFFIRM" | "DENY";
}): DecisionProvider {
  const { config } = input;
  return ruleProvider({
    id: config.id,
    decide: (request: DecisionRequest): DecisionResponse => {
      const rng = mulberry32(config.seed + stableHash(request.subject));
      if (rng() < (config.malformedRate ?? 0)) {
        return { conclusion: "AFFIRM", confidence: null, rationale: "" };
      }
      if (rng() < (config.abstainRate ?? 0)) {
        return { conclusion: "ABSTAIN", confidence: null, rationale: "the supplied materials do not settle the question either way" };
      }
      const truth = input.truthOf(request);
      const errorRate = truth === "DENY" ? config.falseAffirmRate : config.falseDenyRate;
      const flipped = rng() < errorRate;
      const conclusion = flipped ? (truth === "AFFIRM" ? "DENY" : "AFFIRM") : truth;
      return {
        conclusion,
        confidence: config.confidence === undefined ? null : config.confidence,
        rationale: "simulated judge: " + (flipped ? "defective" : "correct") + " evaluation of the supplied materials against the commitment",
      };
    },
  });
}

/**
 * Majority voting over several judges. Used to test whether a quorum buys
 * anything, and whether correlated judges do.
 */
export function quorumProvider(judges: readonly DecisionProvider[], threshold?: number): DecisionProvider {
  const needed = threshold ?? Math.floor(judges.length / 2) + 1;
  return {
    id: "quorum-of-" + judges.length,
    kind: "deterministic",
    async decide(request: DecisionRequest): Promise<DecisionResponse> {
      const responses = await Promise.all(judges.map((judge) => judge.decide(request)));
      const tally = new Map<string, number>();
      for (const response of responses) tally.set(response.conclusion, (tally.get(response.conclusion) ?? 0) + 1);
      let winner = "ABSTAIN";
      let best = 0;
      for (const [conclusion, count] of tally) {
        if (count > best) {
          best = count;
          winner = conclusion;
        }
      }
      if (best < needed) {
        return { conclusion: "ABSTAIN", confidence: null, rationale: "no option reached the quorum of " + needed + " among " + judges.length + " judges" };
      }
      return {
        conclusion: winner,
        confidence: null,
        rationale: "quorum of " + needed + " among " + judges.length + " judges: " + [...tally].map(([k, v]) => k + "x" + v).join(", "),
      };
    },
  };
}
