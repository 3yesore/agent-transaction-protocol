import { test } from "node:test";
import assert from "node:assert/strict";
import { PROBES, runProbes } from "../conformance/probes.ts";
import { kernelTarget, referenceTarget, registeredTargets, resetFlippy } from "../conformance/targets.ts";
import { permissive } from "../experiments/reduction/kernel.ts";

test("the reference implementation conforms to the one rule", () => {
  const { failed } = runProbes(referenceTarget());
  assert.deepEqual(failed, [], "kernel/ must satisfy every probe");
});

test("a successor-evaluating target fails exactly the pre-state probe", () => {
  const { results, failed } = runProbes(
    kernelTarget({
      name: "mutant",
      description: "successor evaluation",
      evaluationOrder: "successor",
      guard: (_state, input) => (input.kind === "update-semantics" ? (input.payload as any)?.recognizedBy === "guard" ? "valid" : "invalid" : "valid"),
    }),
  );
  assert.deepEqual(failed, ["P2-pre-state-evaluation"]);
  assert.equal(results.find((r) => r.probe === "P3-permitted-evolution")?.passed, true);
  assert.equal(results.find((r) => r.probe === "P5-determinism")?.passed, true);
});

test("an accept-everything target fails the pre-state probe", () => {
  const { failed } = runProbes(kernelTarget({ name: "m", description: "permissive", evaluationOrder: "pre-state", guard: permissive }));
  assert.ok(failed.includes("P2-pre-state-evaluation"));
});

test("the probe suite has discriminating power", () => {
  resetFlippy();
  const reports = registeredTargets().map((entry) => ({ name: entry.target.name, expect: entry.expect, failed: runProbes(entry.target).failed }));
  assert.ok(reports.length >= 6);
  for (const report of reports.slice(2)) {
    assert.ok(report.failed.length > 0, report.name + " should not conform");
    assert.deepEqual([...report.failed].sort(), [...(report.expect as readonly string[])].sort(), report.name);
  }
  assert.deepEqual(reports[0].failed, []);
  assert.deepEqual(reports[1].failed, []);
});

test("every probe names the requirement it tests", () => {
  assert.equal(PROBES.length, 5);
  for (const probe of PROBES) {
    assert.ok(probe.requirement.includes("SPEC"), probe.id + " must cite a requirement");
    assert.ok(probe.expectation.length > 20, probe.id + " must state an expectation");
  }
});

test("the reference target's semantic context lives in state", () => {
  const target = referenceTarget();
  target.reset();
  assert.equal(target.genesisSemantics(), "policy/guard");
  assert.equal(target.proposeSemanticChange({ actor: "admin", toPermissive: true, authorised: true }), "valid");
  target.reset();
  assert.equal(target.proposeSemanticChange({ actor: "intruder", toPermissive: true, authorised: false }), "invalid");
});
