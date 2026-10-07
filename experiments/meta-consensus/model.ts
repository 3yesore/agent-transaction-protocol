import { mulberry32 } from "../judge-bench/simulated-judge.ts";
import { analyticFloor, binomialTail, simulate, type QuorumConfig } from "../validator-quorum/model.ts";

/**
 * Semantic amendment under a quorum.
 *
 * ATP-0002's one rule is that a transition is evaluated under the semantics in
 * force BEFORE it. So an amendment R0 -> R1 must be authorised by R0. On a chain
 * "authorised" means a quorum selects it, which raises a question the object
 * level does not have:
 *
 *   An object-level transition is one of a stream. A semantic amendment is a
 *   single, self-replacing, irreversible event.
 *
 * Three asymmetries follow, and this module measures each:
 *
 *   1. FREQUENCY. A per-round shared cause is averaged away over a stream but
 *      not over a handful of amendments, so the relevant quantity is the
 *      LIFETIME capture probability, 1 - (1 - p)^N, which tends to 1.
 *   2. PERSISTENCE. A captured object-level transition is corrected by the next
 *      transition under unchanged rules. A captured amendment REPLACES the rules,
 *      so the mechanism that would correct it is gone. Capture is absorbing.
 *   3. DIVERGENCE. Diversity lowers the object-level floor because it
 *      de-correlates failures. It raises the chance that implementations read the
 *      rules differently, which at the meta level is not a rejected transition
 *      but a split set of rules.
 */
export interface MetaConfig {
  readonly validators: number;
  readonly implementations: number;
  readonly threshold: number;
  readonly commonModeRate: number;
  readonly independentRate: number;
  /** Per-implementation chance its reading of R0 differs on a given amendment. */
  readonly interpretationDivergence: number;
  readonly seed: number;
}

/**
 * Validator count and threshold are held FIXED while implementations vary, so a
 * change in the floor is attributable to the partition and not to a drifting
 * threshold. An earlier version derived the threshold from a rounded total, which
 * produced a family of exactly k and made the floor rise with diversity - an
 * artefact of the construction, not a property of the model.
 */
export function quorumOf(config: MetaConfig): QuorumConfig {
  return {
    validators: config.validators,
    threshold: config.threshold,
    commonModeRate: config.commonModeRate,
    independentRate: config.independentRate,
    families: config.implementations,
    seed: config.seed,
  };
}

/** P(the quorum accepts an amendment that R0 should reject). */
export function amendmentCaptureRate(config: MetaConfig, rounds = 40000): number {
  return simulate(quorumOf(config), rounds).falseAcceptRate;
}

/** The shared causes alone that force acceptance. A lower bound on capture. */
export function amendmentFloor(config: MetaConfig): number {
  return analyticFloor(quorumOf(config));
}

/**
 * P(at least one implementation reads the amendment differently) = 1 - (1-d)^m.
 *
 * This is not a rejected transition. Implementations that disagree about R0 will
 * also disagree about which successors R1 makes valid, so the chain has two rule
 * sets and no common ground for selecting between them.
 */
export function metaForkProbability(config: MetaConfig): number {
  const d = config.interpretationDivergence;
  return 1 - (1 - d) ** config.implementations;
}

/** P(at least one amendment is captured over a lifetime of N amendments). */
export function lifetimeCapture(perAmendmentRate: number, amendments: number): number {
  return 1 - (1 - perAmendmentRate) ** amendments;
}

export interface PersistenceConfig {
  readonly captureRate: number;
  readonly recoveryRate: number;
  readonly amendments: number;
  readonly trials: number;
  readonly seed: number;
}

export interface PersistenceResult {
  /** Fraction of rounds spent in a bad state at the object level. */
  readonly objectBadFraction: number;
  /** Fraction of rounds spent in a bad state at the meta level. */
  readonly metaBadFraction: number;
  /** Fraction of trials in which the meta guard was captured at all. */
  readonly metaCaptureFraction: number;
  readonly ratio: number;
}

/**
 * Object level: a bad state is reversible under unchanged rules, so it is
 * corrected with probability recoveryRate per round.
 *
 * Meta level: capture replaces the rules, so it is absorbing. Nothing in the new
 * semantics is obliged to offer a way back.
 */
export function simulatePersistence(config: PersistenceConfig): PersistenceResult {
  const rng = mulberry32(config.seed);
  let objectBad = 0;
  let metaBad = 0;
  let captureTrials = 0;

  for (let trial = 0; trial < config.trials; trial++) {
    let bad = false;
    for (let round = 0; round < config.amendments; round++) {
      if (!bad) {
        if (rng() < config.captureRate) bad = true;
      } else if (rng() < config.recoveryRate) {
        bad = false;
      }
      if (bad) objectBad++;
    }

    let captured = false;
    for (let round = 0; round < config.amendments; round++) {
      if (!captured && rng() < config.captureRate) {
        captured = true;
        captureTrials++;
      }
      if (captured) metaBad++;
    }
  }

  const total = config.trials * config.amendments;
  const objectBadFraction = objectBad / total;
  const metaBadFraction = metaBad / total;
  return {
    objectBadFraction,
    metaBadFraction,
    metaCaptureFraction: captureTrials / config.trials,
    ratio: objectBadFraction === 0 ? Infinity : metaBadFraction / objectBadFraction,
  };
}

/**
 * A combined loss for choosing how many implementations to run.
 *
 * Deliberately explicit about the weights, because the conclusion depends on
 * them and hiding that would be dishonest.
 */
export function combinedLoss(config: MetaConfig, forkSeverity: number): number {
  return amendmentFloor(config) + forkSeverity * metaForkProbability(config);
}

export function optimalImplementations(base: Omit<MetaConfig, "implementations">, candidates: readonly number[], forkSeverity: number): number {
  let best = candidates[0];
  let bestLoss = Infinity;
  for (const implementations of candidates) {
    const loss = combinedLoss({ ...base, implementations }, forkSeverity);
    if (loss < bestLoss) {
      bestLoss = loss;
      best = implementations;
    }
  }
  return best;
}

export function formatPercent(value: number): string {
  return (value * 100).toFixed(value < 0.0001 ? 4 : 1) + "%";
}

/** Exposed so the runner can cite a purely independent capture rate. */
export function independentCaptureRate(validators: number, threshold: number, rate: number): number {
  return binomialTail(validators, rate, threshold);
}
