import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMetrics, expectedProtocolLoss, DEFAULT_COSTS, type JudgeOutcome } from "../experiments/judge-bench/metrics.ts";
import { mulberry32, quorumProvider, simulatedJudge } from "../experiments/judge-bench/simulated-judge.ts";
import { runBench } from "../experiments/judge-bench/bench.ts";
import { SCENARIOS } from "../experiments/judge-bench/scenarios.ts";
import { defaultRuleProvider, type DecisionProvider, type DecisionRequest } from "../extensions/decision-provider.ts";

function outcome(over: Partial<JudgeOutcome>): JudgeOutcome {
  return {
    scenarioId: "s",
    difficulty: "clear",
    groundTruth: "DENY",
    concluded: "DENY",
    confidence: null,
    conformed: true,
    released: false,
    latencyMs: 1,
    calls: 1,
    error: null,
    ...over,
  };
}

test("metrics separate the two error directions", () => {
  const metrics = computeMetrics([
    outcome({ concluded: "AFFIRM", groundTruth: "DENY" }),
    outcome({ concluded: "AFFIRM", groundTruth: "DENY" }),
    outcome({ concluded: "DENY", groundTruth: "AFFIRM" }),
    outcome({ concluded: "AFFIRM", groundTruth: "AFFIRM" }),
    outcome({ concluded: "DENY", groundTruth: "DENY" }),
    outcome({ concluded: "ABSTAIN" }),
    outcome({ concluded: "NONE", conformed: false, error: "refused" }),
  ]);
  assert.equal(metrics.total, 7);
  assert.equal(metrics.decided, 5);
  assert.equal(metrics.falseAffirm, 2);
  assert.equal(metrics.falseDeny, 1);
  assert.equal(metrics.abstained, 1);
  assert.equal(metrics.failed, 1);
  assert.equal(metrics.accuracy, 2 / 5);
  assert.equal(metrics.falseAffirmRate, 2 / 5);
});

test("brier is computed only over answers that carried a confidence", () => {
  const metrics = computeMetrics([
    outcome({ concluded: "AFFIRM", groundTruth: "AFFIRM", confidence: 0.9 }),
    outcome({ concluded: "AFFIRM", groundTruth: "DENY", confidence: 0.6 }),
    outcome({ concluded: "DENY", groundTruth: "DENY", confidence: null }),
  ]);
  assert.ok(metrics.brier !== null);
  assert.ok(Math.abs(metrics.brier - ((0.9 - 1) ** 2 + (0.6 - 0) ** 2) / 2) < 1e-9);
});

test("protocol loss weights the dangerous direction heavily", () => {
  const cautious = expectedProtocolLoss({ falseAffirmRate: 0, falseDenyRate: 0.15, failRate: 0 });
  const triggerHappy = expectedProtocolLoss({ falseAffirmRate: 0.15, falseDenyRate: 0, failRate: 0 });
  assert.ok(triggerHappy > cautious * 10, cautious + " vs " + triggerHappy);
  assert.equal(0.5 * 0.15 * DEFAULT_COSTS.release, triggerHappy);
});

test("the simulated judge is deterministic and its rates are honest", async () => {
  assert.equal(mulberry32(42)(), mulberry32(42)());
  assert.notEqual(mulberry32(42)(), mulberry32(43)());

  const size = 4000;
  const truth = new Map<string, "AFFIRM" | "DENY">();
  const requests: DecisionRequest[] = [];
  for (let i = 0; i < size; i++) {
    const label: "AFFIRM" | "DENY" = i % 2 === 0 ? "DENY" : "AFFIRM";
    const subject = "sha256:" + i.toString(16).padStart(64, "0");
    truth.set(subject, label);
    requests.push({ evaluator: "sim", subject, question: "q", options: ["AFFIRM", "DENY", "ABSTAIN"], materials: [{ label: "m", content: "x" }], timestamp: 1 });
  }
  const judge = simulatedJudge({
    config: { id: "s", falseAffirmRate: 0.2, falseDenyRate: 0.05, seed: 3 },
    truthOf: (request) => truth.get(request.subject) ?? "DENY",
  });
  let denials = 0;
  let falseAffirm = 0;
  let affirmations = 0;
  let falseDeny = 0;
  for (const request of requests) {
    const response = await judge.decide(request);
    if (truth.get(request.subject) === "DENY") {
      denials++;
      if (response.conclusion === "AFFIRM") falseAffirm++;
    } else {
      affirmations++;
      if (response.conclusion === "DENY") falseDeny++;
    }
  }
  assert.ok(Math.abs(falseAffirm / denials - 0.2) < 0.03, "false affirm " + falseAffirm / denials);
  assert.ok(Math.abs(falseDeny / affirmations - 0.05) < 0.03, "false deny " + falseDeny / affirmations);
});

test("a quorum of correlated judges is indistinguishable from one judge", async () => {
  const independent: DecisionProvider[] = [1, 2, 3].map((seed) =>
    simulatedJudge({ config: { id: "i" + seed, falseAffirmRate: 0.15, falseDenyRate: 0.15, seed }, truthOf: () => "DENY" }),
  );
  const correlated: DecisionProvider[] = [1, 2, 3].map(() =>
    simulatedJudge({ config: { id: "c", falseAffirmRate: 0.15, falseDenyRate: 0.15, seed: 7 }, truthOf: () => "DENY" }),
  );
  const size = 4000;
  const truth = new Map<string, "AFFIRM" | "DENY">();
  const requests: DecisionRequest[] = [];
  for (let i = 0; i < size; i++) {
    const subject = "sha256:" + i.toString(16).padStart(64, "0");
    truth.set(subject, "DENY");
    requests.push({ evaluator: "sim", subject, question: "q", options: ["AFFIRM", "DENY", "ABSTAIN"], materials: [{ label: "m", content: "x" }], timestamp: 1 });
  }
  const countFalseAffirm = async (provider: DecisionProvider) => {
    let n = 0;
    for (const request of requests) {
      const response = await provider.decide(request);
      if (response.conclusion === "AFFIRM") n++;
    }
    return n / requests.length;
  };
  const single = await countFalseAffirm(independent[0]);
  const indep = await countFalseAffirm(quorumProvider(independent));
  const corr = await countFalseAffirm(quorumProvider(correlated));
  assert.ok(Math.abs(corr - single) < 0.02, "correlated " + corr + " vs single " + single);
  assert.ok(indep < single * 0.75, "independent " + indep + " vs single " + single);
});

test("the benchmark drives the real protocol, not just the judge", async () => {
  const result = await runBench({ label: "always-affirm", provider: alwaysAffirm(), scenarios: SCENARIOS, evaluatorId: "always-affirm" });
  assert.equal(result.outcomes.length, SCENARIOS.length);
  assert.equal(result.metrics.conformed, SCENARIOS.length);
  assert.equal(result.metrics.falseAffirm, SCENARIOS.filter((s) => s.groundTruth === "DENY").length);
  const anyReleased = result.outcomes.some((o) => o.released);
  assert.equal(anyReleased, true, "a conforming AFFIRM judgment must actually release the escrow");
  assert.equal(result.outcomes.filter((o) => o.released).length, SCENARIOS.length, "every scenario released because the judge always affirms");
});

test("a scenario suite exists with both directions and three difficulties", () => {
  assert.ok(SCENARIOS.length >= 12);
  assert.ok(SCENARIOS.some((s) => s.groundTruth === "AFFIRM"));
  assert.ok(SCENARIOS.some((s) => s.groundTruth === "DENY"));
  for (const difficulty of ["clear", "ambiguous", "adversarial"]) {
    assert.ok(SCENARIOS.some((s) => s.difficulty === difficulty), "missing difficulty " + difficulty);
  }
});

function alwaysAffirm(): DecisionProvider {
  return {
    id: "always-affirm",
    kind: "deterministic",
    async decide(): Promise<{ conclusion: string; confidence: number | null; rationale: string }> {
      return { conclusion: "AFFIRM", confidence: 0.99, rationale: "the materials were not examined; this judge always affirms" };
    },
  };
}

test("the deterministic baseline judge runs through the same path", async () => {
  const result = await runBench({ label: "rule", provider: defaultRuleProvider(), scenarios: SCENARIOS, evaluatorId: "rule-j1" });
  assert.equal(result.metrics.failed, 0);
  assert.ok(result.metrics.falseAffirm > 0, "a keyword judge should be fooled by these scenarios");
});
