import { test } from "node:test";
import assert from "node:assert/strict";
import {
  amendmentFloor,
  combinedLoss,
  lifetimeCapture,
  metaForkProbability,
  optimalImplementations,
  quorumOf,
  simulatePersistence,
  type MetaConfig,
} from "../experiments/meta-consensus/model.ts";
import { familySizes } from "../experiments/validator-quorum/model.ts";

function config(over: Partial<MetaConfig> = {}): MetaConfig {
  return { validators: 35, implementations: 1, threshold: 18, commonModeRate: 0.2, independentRate: 0.15, interpretationDivergence: 0.02, seed: 7, ...over };
}

test("lifetime capture is 1 - (1 - p)^N and tends to certainty", () => {
  assert.ok(Math.abs(lifetimeCapture(0.2, 1) - 0.2) < 1e-12);
  assert.ok(Math.abs(lifetimeCapture(0.2, 3) - (1 - 0.8 ** 3)) < 1e-12);
  assert.ok(lifetimeCapture(0.2, 21) > 0.99);
  assert.ok(lifetimeCapture(1, 5) === 1);
});

test("the fork probability is 1 - (1 - d)^m and rises with diversity", () => {
  assert.ok(Math.abs(metaForkProbability(config({ implementations: 1 })) - 0.02) < 1e-12);
  assert.ok(Math.abs(metaForkProbability(config({ implementations: 2 })) - (1 - 0.98 ** 2)) < 1e-12);
  let previous = 0;
  for (const m of [1, 2, 3, 5, 7, 12, 35]) {
    const current = metaForkProbability(config({ implementations: m }));
    assert.ok(current > previous, "fork probability must rise: " + current + " after " + previous);
    previous = current;
  }
});

test("quorumOf holds the validator count and threshold fixed while families vary", () => {
  // Regression guard: an earlier construction derived the threshold from a
  // rounded validator total, which produced a family of exactly k and made the
  // floor RISE with diversity.
  for (const m of [1, 2, 3, 5, 7, 12, 35]) {
    const quorum = quorumOf(config({ implementations: m }));
    assert.equal(quorum.validators, 35);
    assert.equal(quorum.threshold, 18);
    assert.equal(quorum.families, m);
  }
  assert.deepEqual(familySizes(quorumOf(config({ implementations: 2 }))), [18, 17]);
});

test("the object-level floor is non-increasing in diversity", () => {
  let previous = Infinity;
  for (const m of [1, 2, 3, 5, 7, 12, 35]) {
    const floor = amendmentFloor(config({ implementations: m }));
    assert.ok(floor <= previous + 1e-12, "floor rose at m=" + m + ": " + floor + " after " + previous);
    previous = floor;
  }
  assert.ok(amendmentFloor(config({ implementations: 1 })) > 0.19);
  assert.ok(amendmentFloor(config({ implementations: 35 })) < 0.001);
});

test("meta capture is absorbing while object capture is bounded", () => {
  const result = simulatePersistence({ captureRate: 0.2, recoveryRate: 0.9, amendments: 100, trials: 2000, seed: 5 });
  const closedForm = 0.2 / (0.2 + 0.9);
  assert.ok(Math.abs(result.objectBadFraction - closedForm) < 0.03, "object fraction " + result.objectBadFraction + " against " + closedForm);
  assert.ok(result.metaBadFraction > 0.9, "meta fraction " + result.metaBadFraction);
  assert.ok(result.ratio > 4, "ratio " + result.ratio);
});

test("object badness stays bounded as the horizon grows but meta badness does not", () => {
  const short = simulatePersistence({ captureRate: 0.2, recoveryRate: 0.9, amendments: 10, trials: 2000, seed: 5 });
  const long = simulatePersistence({ captureRate: 0.2, recoveryRate: 0.9, amendments: 400, trials: 2000, seed: 5 });
  assert.ok(Math.abs(long.objectBadFraction - short.objectBadFraction) < 0.12, "object fraction should stabilise: " + short.objectBadFraction + " -> " + long.objectBadFraction);
  assert.ok(long.metaBadFraction > short.metaBadFraction + 0.2, "meta fraction should grow: " + short.metaBadFraction + " -> " + long.metaBadFraction);
});

test("diversity is net-negative once a rule fork is expensive enough", () => {
  const base: Omit<MetaConfig, "implementations"> = { validators: 35, threshold: 18, commonModeRate: 0.2, independentRate: 0.15, interpretationDivergence: 0.02, seed: 7 };
  const candidates = [1, 2, 3, 5, 7, 12, 35];
  assert.ok(optimalImplementations(base, candidates, 1) > 1, "a cheap fork should tolerate diversity");
  assert.equal(optimalImplementations(base, candidates, 30), 1, "an expensive fork should not");

  // and the two risks really do move in opposite directions
  const one = config({ implementations: 1 });
  const many = config({ implementations: 35 });
  assert.ok(amendmentFloor(many) < amendmentFloor(one));
  assert.ok(metaForkProbability(many) > metaForkProbability(one));
  assert.ok(combinedLoss(many, 30) > combinedLoss(one, 30));
});
