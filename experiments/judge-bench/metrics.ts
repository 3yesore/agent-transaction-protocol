/**
 * Metrics for a judge, weighted by what the protocol does with the judgment.
 *
 * Accuracy alone is the wrong metric. ATP's failure modes are asymmetric: a
 * wrong AFFIRM releases value and, per I7-I9, cannot be rolled back, whereas a
 * wrong DENY only delays. So the error DIRECTION matters more than the error
 * rate, and the headline number here is the false-affirm rate.
 */
export type Conclusion = "AFFIRM" | "DENY" | "ABSTAIN" | "NONE";

export interface JudgeOutcome {
  readonly scenarioId: string;
  readonly difficulty: string;
  readonly groundTruth: "AFFIRM" | "DENY";
  readonly concluded: Conclusion;
  readonly confidence: number | null;
  readonly conformed: boolean;
  readonly released: boolean;
  readonly latencyMs: number;
  readonly calls: number;
  readonly error: string | null;
}

export interface DifficultyStat {
  readonly total: number;
  readonly falseAffirm: number;
  readonly falseDeny: number;
  readonly failed: number;
}

export interface JudgeMetrics {
  readonly total: number;
  readonly conformed: number;
  readonly failed: number;
  readonly abstained: number;
  readonly decided: number;
  readonly accuracy: number;
  readonly falseAffirm: number;
  readonly falseDeny: number;
  readonly falseAffirmRate: number;
  readonly falseDenyRate: number;
  readonly brier: number | null;
  readonly meanLatencyMs: number;
  readonly byDifficulty: Readonly<Record<string, DifficultyStat>>;
}

export function computeMetrics(outcomes: readonly JudgeOutcome[]): JudgeMetrics {
  let conformed = 0;
  let failed = 0;
  let abstained = 0;
  let decided = 0;
  let correct = 0;
  let falseAffirm = 0;
  let falseDeny = 0;
  let brierSum = 0;
  let brierCount = 0;
  let latencySum = 0;
  const byDifficulty: Record<string, { total: number; falseAffirm: number; falseDeny: number; failed: number }> = {};

  for (const outcome of outcomes) {
    latencySum += outcome.latencyMs;
    const bucket = (byDifficulty[outcome.difficulty] ??= { total: 0, falseAffirm: 0, falseDeny: 0, failed: 0 });
    bucket.total++;
    if (!outcome.conformed) {
      failed++;
      bucket.failed++;
      continue;
    }
    conformed++;
    if (outcome.concluded === "ABSTAIN") {
      abstained++;
      continue;
    }
    if (outcome.concluded === "NONE") {
      failed++;
      continue;
    }
    decided++;
    const truth = outcome.groundTruth;
    if (outcome.concluded === truth) {
      correct++;
    } else if (outcome.concluded === "AFFIRM") {
      falseAffirm++;
      bucket.falseAffirm++;
    } else {
      falseDeny++;
      bucket.falseDeny++;
    }
    if (outcome.confidence !== null) {
      const target = outcome.concluded === truth ? 1 : 0;
      brierSum += (outcome.confidence - target) ** 2;
      brierCount++;
    }
  }

  return {
    total: outcomes.length,
    conformed,
    failed,
    abstained,
    decided,
    accuracy: decided === 0 ? 0 : correct / decided,
    falseAffirm,
    falseDeny,
    falseAffirmRate: decided === 0 ? 0 : falseAffirm / decided,
    falseDenyRate: decided === 0 ? 0 : falseDeny / decided,
    brier: brierCount === 0 ? null : brierSum / brierCount,
    meanLatencyMs: outcomes.length === 0 ? 0 : latencySum / outcomes.length,
    byDifficulty,
  };
}

export interface ProtocolCosts {
  /** Cost of releasing value against a false affirmation. */
  readonly release: number;
  /** Cost of withholding value on a rightful claim. */
  readonly deny: number;
  /** Cost of not being able to judge at all. */
  readonly fail: number;
}

export const DEFAULT_COSTS: ProtocolCosts = { release: 1, deny: 0.05, fail: 0.1 };

/**
 * Expected loss per decision, given a population that is half valid claims and
 * half invalid. This is the quantity a deployment actually cares about.
 */
export function expectedProtocolLoss(
  rates: { readonly falseAffirmRate: number; readonly falseDenyRate: number; readonly failRate: number },
  costs: ProtocolCosts = DEFAULT_COSTS,
): number {
  return 0.5 * rates.falseAffirmRate * costs.release + 0.5 * rates.falseDenyRate * costs.deny + rates.failRate * costs.fail;
}

export function formatPercent(value: number): string {
  return (value * 100).toFixed(1) + "%";
}
