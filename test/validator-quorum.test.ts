import { test } from "node:test";
import assert from "node:assert/strict";
import { analyticFloor, binomialTail, familySizes, majority, marginalErrorRate, simulate, type QuorumConfig } from "../experiments/validator-quorum/model.ts";

function config(over: Partial<QuorumConfig> = {}): QuorumConfig {
  return { validators: 3, threshold: 2, commonModeRate: 0, independentRate: 0.15, families: 1, seed: 11, ...over };
}

test("family sizes distribute validators round-robin", () => {
  assert.deepEqual(familySizes(config({ validators: 7, families: 1 })), [7]);
  assert.deepEqual(familySizes(config({ validators: 7, families: 2 })), [4, 3]);
  assert.deepEqual(familySizes(config({ validators: 7, families: 7 })), [1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(familySizes(config({ validators: 3, families: 7 })), [1, 1, 1], "families are capped at the validator count");
});

test("the analytic floor is the probability that shared causes alone force acceptance", () => {
  assert.ok(Math.abs(analyticFloor(config({ families: 1, commonModeRate: 0.2 })) - 0.2) < 1e-12);
  assert.ok(Math.abs(analyticFloor(config({ validators: 5, threshold: 1, families: 5, commonModeRate: 0.2 })) - (1 - 0.8 ** 5)) < 1e-12);
  // seven families of one, k=4: four causes must fire at once
  const sevenFamilies = analyticFloor(config({ validators: 7, threshold: 4, families: 7, commonModeRate: 0.2 }));
  assert.ok(sevenFamilies > 0.03 && sevenFamilies < 0.04, "expected about 3.3%, got " + sevenFamilies);
});

test("the floor is set by the largest family, not the family count", () => {
  const one = analyticFloor(config({ validators: 7, threshold: 4, commonModeRate: 0.2, families: 1 }));
  const two = analyticFloor(config({ validators: 7, threshold: 4, commonModeRate: 0.2, families: 2 }));
  const three = analyticFloor(config({ validators: 7, threshold: 4, commonModeRate: 0.2, families: 3 }));
  assert.ok(Math.abs(one - two) < 1e-12, "a 4+3 split must not lower the floor: " + one + " vs " + two);
  assert.ok(three < two * 0.75, "3+2+2 must lower it: " + two + " -> " + three);
});

test("a two-way split can be worse than not splitting", () => {
  const one = simulate(config({ validators: 7, threshold: 4, commonModeRate: 0.2, families: 1 }), 40000).falseAcceptRate;
  const two = simulate(config({ validators: 7, threshold: 4, commonModeRate: 0.2, families: 2 }), 40000).falseAcceptRate;
  assert.ok(two > one * 1.2, "4+3 measured " + two + " should exceed 7 measured " + one);
});

test("false acceptance never goes below the shared-cause rate with one family", () => {
  for (const n of [1, 3, 5, 9]) {
    for (const rho of [0.05, 0.2, 0.4]) {
      const measured = simulate(config({ validators: n, threshold: majority(n), commonModeRate: rho, families: 1 }), 30000).falseAcceptRate;
      assert.ok(measured >= rho * 0.97, "n=" + n + " rho=" + rho + " measured " + measured);
    }
  }
});

test("the quorum's benefit collapses toward the floor as correlation rises", () => {
  const measure = (rho: number) => {
    const single = simulate(config({ validators: 1, threshold: 1, commonModeRate: rho }), 40000).falseAcceptRate;
    const quorum = simulate(config({ validators: 7, threshold: 4, commonModeRate: rho, families: 1 }), 40000).falseAcceptRate;
    return { single, quorum, ratio: single / quorum };
  };
  const independent = measure(0);
  const correlated = measure(0.3);
  assert.ok(independent.ratio > 3, "with independence the quorum helps several-fold: " + independent.ratio.toFixed(2));
  assert.ok(correlated.ratio < 1.5, "at rho=0.3 the benefit should have collapsed: " + correlated.ratio.toFixed(2));
  assert.ok(correlated.quorum >= 0.3 * 0.95, "and the shared-cause floor holds: " + correlated.quorum);
});

test("the floor is tight only when one family can carry the threshold", () => {
  const base = config({ validators: 35, threshold: 18, commonModeRate: 0.2 });
  const one = simulate({ ...base, families: 1 }, 20000).falseAcceptRate;
  assert.ok(Math.abs(one - analyticFloor({ ...base, families: 1 })) < 0.02, "one family: measured " + one);

  const five = simulate({ ...base, families: 5 }, 20000).falseAcceptRate;
  const fiveFloor = analyticFloor({ ...base, families: 5 });
  assert.ok(five - fiveFloor > 0.05, "five families: measured " + five + " against floor " + fiveFloor);
});

test("absolute risk falls monotonically with diversity", () => {
  const base = config({ validators: 35, threshold: 18, commonModeRate: 0.2 });
  const rates = [1, 5, 7, 35].map((families) => simulate({ ...base, families }, 20000).falseAcceptRate);
  for (let index = 1; index < rates.length; index++) {
    assert.ok(rates[index] < rates[index - 1], "rates must fall: " + rates.join(" > "));
  }
});

test("the residual at full diversity is the marginal error rate's binomial tail", () => {
  const base = config({ validators: 35, threshold: 18, commonModeRate: 0.2 });
  const measured = simulate({ ...base, families: 35 }, 20000).falseAcceptRate;
  const predicted = binomialTail(35, marginalErrorRate(base), 18);
  assert.ok(Math.abs(measured - predicted) < 0.009, "measured " + measured + " vs tail " + predicted);
});

test("simulation is deterministic", () => {
  assert.deepEqual(simulate(config({ seed: 3 }), 2000), simulate(config({ seed: 3 }), 2000));
});
