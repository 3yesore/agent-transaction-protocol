import { mulberry32 } from "../judge-bench/simulated-judge.ts";

/**
 * A validator quorum under correlated failure.
 *
 * In ATP-0002 terms a validator evaluates R(S, X, C, S') and the quorum is a
 * selection mechanism over the resulting verdicts. The freeze says selection is
 * a domain-level mechanism and says nothing about whether it is safe. This model
 * is what that safety actually depends on.
 *
 * The correlation structure is the point. Validators that run the same client
 * fail together, so the model separates two error sources:
 *
 *   - a shared cause that hits a whole client family, flipping every member;
 *   - independent per-validator noise.
 *
 * With one family, a shared cause hits everybody and no quorum can help. With
 * several families the cause must hit enough families at once, which is what
 * implementation diversity actually buys.
 */
export interface QuorumConfig {
  readonly validators: number;
  readonly threshold: number;
  /** P(a given client family suffers a shared cause in a given round). */
  readonly commonModeRate: number;
  /** Independent per-validator error rate, outside any shared cause. */
  readonly independentRate: number;
  /** Distinct client implementations. 1 means fully correlated. */
  readonly families: number;
  readonly seed: number;
}

export function familySizes(config: QuorumConfig): number[] {
  const count = Math.max(1, Math.min(config.families, config.validators));
  const sizes = new Array<number>(count).fill(0);
  for (let index = 0; index < config.validators; index++) sizes[index % count] += 1;
  return sizes;
}

/**
 * The exact probability that shared causes ALONE push enough flippers over the
 * threshold. This is a floor on false acceptance: whenever it happens, the
 * quorum accepts an invalid transition no matter how many validators there are.
 */
export function analyticFloor(config: QuorumConfig): number {
  const sizes = familySizes(config);
  const families = sizes.length;
  let floor = 0;
  for (let mask = 0; mask < 1 << families; mask++) {
    let forced = 0;
    let probability = 1;
    for (let index = 0; index < families; index++) {
      if (mask & (1 << index)) {
        forced += sizes[index];
        probability *= config.commonModeRate;
      } else {
        probability *= 1 - config.commonModeRate;
      }
    }
    if (forced >= config.threshold) floor += probability;
  }
  return floor;
}

export interface QuorumResult {
  readonly rounds: number;
  /** P(the quorum accepts | the true transition is invalid). */
  readonly falseAcceptRate: number;
  /** P(the quorum rejects | the true transition is valid). */
  readonly falseRejectRate: number;
  /** Marginal per-validator error rate, for reference. */
  readonly validatorErrorRate: number;
}

export function simulate(config: QuorumConfig, rounds = 40000): QuorumResult {
  const sizes = familySizes(config);
  const families = sizes.length;
  const familyOf = new Array<number>(config.validators);
  {
    const cursor = new Array<number>(families).fill(0);
    for (let index = 0; index < config.validators; index++) {
      const family = index % families;
      familyOf[index] = family;
      cursor[family] += 1;
    }
  }
  const rng = mulberry32(config.seed);

  let invalidRounds = 0;
  let validRounds = 0;
  let falseAccepts = 0;
  let falseRejects = 0;
  let validatorErrors = 0;
  let validatorObservations = 0;

  for (let round = 0; round < rounds; round++) {
    const truthValid = rng() < 0.5;
    const fired = new Array<boolean>(families);
    for (let family = 0; family < families; family++) fired[family] = rng() < config.commonModeRate;

    let accepted = 0;
    for (let index = 0; index < config.validators; index++) {
      const flipped = fired[familyOf[index]] || rng() < config.independentRate;
      // A validator "accepts" when it says the transition is valid.
      const saysValid = truthValid ? !flipped : flipped;
      if (saysValid) accepted++;
      if (flipped) validatorErrors++;
      validatorObservations++;
    }
    const quorumAccepts = accepted >= config.threshold;

    if (truthValid) {
      validRounds++;
      if (!quorumAccepts) falseRejects++;
    } else {
      invalidRounds++;
      if (quorumAccepts) falseAccepts++;
    }
  }

  return {
    rounds,
    falseAcceptRate: invalidRounds === 0 ? 0 : falseAccepts / invalidRounds,
    falseRejectRate: validRounds === 0 ? 0 : falseRejects / validRounds,
    validatorErrorRate: validatorObservations === 0 ? 0 : validatorErrors / validatorObservations,
  };
}

/**
 * The marginal per-validator error rate: a validator errs if its own family's
 * shared cause fires, or if independent noise flips it.
 *
 * Diversity removes the SYNCHRONISATION between validators; it does not remove
 * this rate. That distinction is the difference between the floor and the
 * realised risk.
 */
export function marginalErrorRate(config: QuorumConfig): number {
  return config.commonModeRate + (1 - config.commonModeRate) * config.independentRate;
}

function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let index = 0; index < k; index++) result = (result * (n - index)) / (index + 1);
  return result;
}

/** P(X >= k) for X ~ Binomial(n, p). */
export function binomialTail(n: number, p: number, k: number): number {
  let sum = 0;
  for (let index = k; index <= n; index++) sum += combination(n, index) * p ** index * (1 - p) ** (n - index);
  return sum;
}

export function majority(validators: number): number {
  return Math.floor(validators / 2) + 1;
}

export function describe(config: QuorumConfig): string {
  return (
    "n=" + config.validators +
    " k=" + config.threshold +
    " families=" + familySizes(config).length +
    " rho=" + config.commonModeRate.toFixed(2) +
    " p=" + config.independentRate.toFixed(2)
  );
}

export function formatPercent(value: number): string {
  return (value * 100).toFixed(1) + "%";
}
