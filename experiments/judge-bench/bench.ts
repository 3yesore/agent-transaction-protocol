import { Domain } from "../../kernel/domain.ts";
import { createIntegrityVerifier } from "../../kernel/evidence.ts";
import { hashJson } from "../../kernel/json.ts";
import type { JsonValue, TransitionProposal } from "../../kernel/types.ts";
import { genesisPolicy, standardInterpreter, standardPreconditions } from "../../extensions/index.ts";
import { judgmentPolicy } from "../../extensions/decision.ts";
import { decideFor, type DecisionProvider, type DecisionRequest } from "../../extensions/decision-provider.ts";
import { computeMetrics, type JudgeMetrics, type JudgeOutcome } from "./metrics.ts";
import type { JudgeScenario } from "./scenarios.ts";

/**
 * Runs a judge over the authored scenarios AND through the full protocol flow.
 *
 * The same judgment is fed to a Domain holding a one-judge release policy, so
 * the benchmark reports both what the judge concluded and what the protocol did
 * with it. The proposal whose hash the judgment is addressed to must be the very
 * proposal that is later submitted, otherwise the addressed evidence is not
 * gathered and nothing is ever released.
 */
export interface BenchResult {
  readonly label: string;
  readonly outcomes: readonly JudgeOutcome[];
  readonly metrics: JudgeMetrics;
}

export interface BenchOptions {
  readonly label: string;
  readonly provider: DecisionProvider;
  readonly scenarios: readonly JudgeScenario[];
  readonly evaluatorId: string;
}

function proposalFor(index: number): TransitionProposal {
  return {
    id: "bench-" + index,
    domain: "bench",
    actor: "agent-a",
    intent: "release the escrow on a judgment",
    policy: { id: "judge" },
    preconditions: [],
    effects: [{ op: "create" as const, key: "action/A1", value: { released: true } as JsonValue }],
    evidence: [],
    parents: [],
    createdAt: 1,
  };
}

function domainFor(evaluatorId: string): Domain {
  return new Domain({
    id: "bench",
    interpreter: standardInterpreter(),
    verifier: createIntegrityVerifier(),
    preconditions: standardPreconditions(),
    clock: () => 1,
    initialState: [genesisPolicy(judgmentPolicy({ id: "judge", threshold: 1, allowedJudges: [evaluatorId] }))],
  });
}

async function judgeAndRelease(
  provider: DecisionProvider,
  evaluatorId: string,
  proposal: TransitionProposal,
  materials: JudgeScenario["materials"],
): Promise<Omit<JudgeOutcome, "scenarioId" | "difficulty" | "groundTruth">> {
  const domain = domainFor(evaluatorId);
  const subject = hashJson(proposal);
  const request: DecisionRequest = {
    evaluator: evaluatorId,
    subject,
    question: "Did the supplier satisfy commitment C1 exactly as specified?",
    options: ["AFFIRM", "DENY", "ABSTAIN"],
    materials,
    timestamp: 1,
  };
  const started = Date.now();
  try {
    const { response } = await decideFor(domain, provider, request);
    const result = domain.propose(proposal);
    return {
      concluded: response.conclusion as "AFFIRM" | "DENY" | "ABSTAIN",
      confidence: response.confidence,
      conformed: true,
      released: result.committed,
      latencyMs: Date.now() - started,
      calls: 1,
      error: null,
    };
  } catch (error) {
    return {
      concluded: "NONE",
      confidence: null,
      conformed: false,
      released: false,
      latencyMs: Date.now() - started,
      calls: 1,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runBench(options: BenchOptions): Promise<BenchResult> {
  const outcomes: JudgeOutcome[] = [];
  for (let index = 0; index < options.scenarios.length; index++) {
    const scenario = options.scenarios[index];
    const judged = await judgeAndRelease(options.provider, options.evaluatorId, proposalFor(index), scenario.materials);
    outcomes.push({
      scenarioId: scenario.id,
      difficulty: scenario.difficulty,
      groundTruth: scenario.groundTruth,
      ...judged,
    });
  }
  return { label: options.label, outcomes, metrics: computeMetrics(outcomes) };
}
