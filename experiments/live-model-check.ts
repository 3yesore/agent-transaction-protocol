/**
 * Runs a REAL model through the ATP decision provider.
 *
 * Deliberately not part of the test suite: the suite uses a mock transport so
 * it stays hermetic, and this script needs a reachable Ollama plus a pulled
 * model.
 *
 *   node experiments/live-model-check.ts [model]
 *
 * This validates the INTERFACE against a real model. It is not a benchmark of
 * judgment quality: a small general-purpose model asked for a typed decision is
 * a plumbing test, not a Jev-class decision model.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Domain } from "../kernel/domain.ts";
import { createIntegrityVerifier } from "../kernel/evidence.ts";
import { hashJson } from "../kernel/json.ts";
import { checkInvariants } from "../kernel/invariants.ts";
import type { JsonValue } from "../kernel/types.ts";
import { genesisPolicy, standardInterpreter, standardPreconditions } from "../extensions/index.ts";
import { judgmentPolicy, type DecisionPayload } from "../extensions/decision.ts";
import {
  decideFor,
  modelProvider,
  ollamaTransport,
  type DecisionMaterial,
  type DecisionRequest,
  type ModelTransport,
} from "../extensions/decision-provider.ts";

const model = process.argv[2] ?? "qwen2.5:1.5b";
const baseUrl = process.env.ATP_OLLAMA_URL ?? "http://127.0.0.1:11434";

interface Scenario {
  readonly name: string;
  readonly materials: DecisionMaterial[];
  readonly expect: string;
}

const scenarios: Scenario[] = [
  {
    name: "clear delivery",
    expect: "AFFIRM",
    materials: [{ label: "receipt", content: "delivery receipt 8841; artifact sha256 matches the committed digest; delivered two hours before the deadline" }],
  },
  {
    name: "clear non-delivery",
    expect: "DENY",
    materials: [{ label: "trace", content: "no artifact was produced; the execution log ends with aborted by operator; the deadline has passed" }],
  },
  {
    name: "ambiguous evidence",
    expect: "any outcome, but a stated basis",
    materials: [{ label: "note", content: "the artifact was produced but its hash was never recorded, and the only witness is the supplier" }],
  },
];

function countingTransport(inner: ModelTransport): { transport: ModelTransport; calls: () => number; lastRaw: () => string } {
  let calls = 0;
  let lastRaw = "";
  return {
    transport: {
      id: inner.id,
      model: inner.model,
      async complete(messages, schema) {
        calls++;
        const text = await inner.complete(messages, schema);
        lastRaw = text;
        return text;
      },
    },
    calls: () => calls,
    lastRaw: () => lastRaw,
  };
}

function domainFor(id: string): Domain {
  return new Domain({
    id,
    interpreter: standardInterpreter(),
    verifier: createIntegrityVerifier(),
    preconditions: standardPreconditions(),
    clock: () => Date.now(),
    initialState: [genesisPolicy(judgmentPolicy({ id: "judge", threshold: 1, allowedJudges: [model] }))],
  });
}

async function main(): Promise<void> {
  const lines: string[] = [];
  lines.push("# ATP Live Model Check");
  lines.push("");
  lines.push("Model: **" + model + "** at " + baseUrl);
  lines.push("Started: " + new Date().toISOString());
  lines.push("");
  lines.push("| Scenario | Expected | Conclusion | Confidence | Latency | Transport calls | Transition |");
  lines.push("|----------|----------|------------|------------|---------|-----------------|------------|");

  let failures = 0;
  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    const domain = domainFor("live-" + (i + 1));
    const proposal = {
      id: "live-" + (i + 1),
      domain: domain.id,
      actor: "agent-a",
      intent: "release escrow on a model judgment",
      policy: { id: "judge" },
      preconditions: [],
      effects: [{ op: "create" as const, key: "action/A" + (i + 1), value: { released: true } as JsonValue }],
      evidence: [],
      parents: [],
      createdAt: Date.now(),
    };
    const request: DecisionRequest = {
      evaluator: model,
      subject: hashJson(proposal),
      question: "Did the supplier deliver the artifact described by the commitment?",
      options: ["AFFIRM", "DENY", "ABSTAIN"],
      materials: scenario.materials,
      timestamp: Date.now(),
    };

    const counter = countingTransport(ollamaTransport({ model, baseUrl }));
    const provider = modelProvider(counter.transport, { retries: 1 });
    const started = Date.now();
    try {
      const { response } = await decideFor(domain, provider, request);
      const elapsed = Date.now() - started;
      const result = domain.propose(proposal);
      console.log("");
      console.log("[" + scenario.name + "] " + elapsed + " ms, " + counter.calls() + " call(s)");
      console.log("  raw      : " + counter.lastRaw().replace(/\s+/g, " ").slice(0, 300));
      console.log("  decision : " + response.conclusion + " (confidence " + String(response.confidence) + ")");
      console.log("  rationale: " + response.rationale);
      console.log("  led to   : committed=" + result.committed);
      lines.push(
        "| " + scenario.name + " | " + scenario.expect + " | " + response.conclusion + " | " + String(response.confidence) + " | " + elapsed + " ms | " + counter.calls() + " | " + (result.committed ? "committed" : "rejected") + " |",
      );
      lines.push("");
      lines.push("**" + scenario.name + "** rationale: " + response.rationale);
      lines.push("");
      const payload = domain.evidenceOfKind("decision")[0]?.payload as unknown as DecisionPayload;
      if (!payload || payload.rationale !== response.rationale) {
        console.log("  MISMATCH: the recorded rationale differs from the model output");
        failures++;
      }
      const invariantFailures = checkInvariants(domain).filter((r) => r.status === "FAIL");
      if (!result.committed || !domain.verify().ok || invariantFailures.length > 0) failures++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log("");
      console.log("[" + scenario.name + "] FAILED after " + (Date.now() - started) + " ms: " + message);
      console.log("  raw: " + counter.lastRaw().replace(/\s+/g, " ").slice(0, 300));
      lines.push("| " + scenario.name + " | " + scenario.expect + " | n/a | n/a | " + (Date.now() - started) + " ms | " + counter.calls() + " | **no conforming decision** |");
      lines.push("");
      lines.push("**" + scenario.name +"** failed: " + message);
      lines.push("");
      failures++;
    }
  }

  lines.push("");
  lines.push(failures === 0 ? "All scenarios produced a conforming Decision." : failures + " scenario(s) did not conform.");
  lines.push("");
  const outDir = join(dirname(fileURLToPath(import.meta.url)), "results");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "live-model-check.md"), lines.join("\n"), "utf8");
  console.log("");
  console.log(failures === 0 ? "ALL SCENARIOS CONFORMED" : failures + " SCENARIO(S) FAILED");
  if (failures > 0) process.exitCode = 1;
}

await main();
