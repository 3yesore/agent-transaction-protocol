import type { Domain } from "../kernel/domain.ts";
import { checkInvariants } from "../kernel/invariants.ts";
import type { JsonValue, StateDocument } from "../kernel/types.ts";

export interface Assertion {
  readonly claim: string;
  readonly held: boolean;
  readonly detail: string;
}

export interface StepLog {
  readonly n: number;
  readonly domain: string;
  readonly actor: string;
  readonly action: string;
  readonly result: string;
}

export interface Finding {
  readonly title: string;
  readonly classification: string;
  readonly detail: string;
}

export interface ExperimentReport {
  readonly id: string;
  readonly title: string;
  readonly problem: string;
  readonly actors: readonly string[];
  readonly initialState: readonly string[];
  readonly actions: readonly string[];
  readonly expected: string;
  readonly observed: string;
  readonly failures: readonly string[];
  readonly classification: string;
  readonly proposedChange: string;
  readonly steps: readonly StepLog[];
  readonly assertions: readonly Assertion[];
  readonly findings: readonly Finding[];
  readonly invariants: readonly string[];
  readonly conclusion: string;
}

/** Genesis state used to seed a domain before its first transition. */
export function seed(key: string, value: JsonValue, by = "sha256:genesis"): StateDocument {
  return { key, version: 1, value, createdBy: by, updatedBy: by, createdAt: 0, updatedAt: 0 };
}

export class Recorder {
  readonly steps: StepLog[] = [];
  readonly assertions: Assertion[] = [];
  readonly findings: Finding[] = [];
  readonly domains: Domain[] = [];
  #n = 0;

  track(domain: Domain): Domain {
    this.domains.push(domain);
    return domain;
  }

  step(domain: string, actor: string, action: string, result: string): void {
    this.steps.push({ n: ++this.#n, domain, actor, action, result });
  }

  assert(claim: string, held: boolean, detail = ""): void {
    this.assertions.push({ claim, held, detail });
  }

  find(title: string, classification: string, detail: string): void {
    this.findings.push({ title, classification, detail });
  }

  allPassed(): boolean {
    return this.assertions.every((a) => a.held);
  }

  domainReport(): string[] {
    return this.domains.map((d) => {
      const v = d.verify();
      return d.id + ": " + d.ledger.length + " transition(s), chain " + (v.ok ? "verified" : "BROKEN - " + v.reason);
    });
  }

  invariantReport(): string[] {
    const lines: string[] = [];
    for (const domain of this.domains) {
      for (const report of checkInvariants(domain)) {
        if (report.status === "FAIL") lines.push(domain.id + " " + report.id + " FAIL - " + report.detail);
      }
    }
    if (lines.length === 0) lines.push("no invariant violations across " + this.domains.length + " domain(s)");
    return lines;
  }
}

export function renderMarkdown(report: ExperimentReport): string {
  const confirmed = report.assertions.every((a) => a.held);
  const lines: string[] = [];
  lines.push("# " + report.id + " - " + report.title);
  lines.push("");
  lines.push("**Status:** " + (confirmed ? "CONFIRMED (all assertions held)" : "UNEXPECTED (at least one assertion failed)"));
  lines.push("");
  lines.push("## Problem");
  lines.push("");
  lines.push(report.problem);
  lines.push("");
  lines.push("## Actors");
  lines.push("");
  for (const actor of report.actors) lines.push("- " + actor);
  lines.push("");
  lines.push("## Initial State");
  lines.push("");
  for (const item of report.initialState) lines.push("- " + item);
  lines.push("");
  lines.push("## Actions");
  lines.push("");
  report.actions.forEach((action, index) => lines.push(index + 1 + ". " + action));
  lines.push("");
  lines.push("## Expected Result");
  lines.push("");
  lines.push(report.expected);
  lines.push("");
  lines.push("## Observed Result");
  lines.push("");
  lines.push(report.observed);
  lines.push("");
  lines.push("## Failure");
  lines.push("");
  if (report.failures.length === 0) lines.push("- none observed");
  for (const failure of report.failures) lines.push("- " + failure);
  lines.push("");
  lines.push("## Classification");
  lines.push("");
  lines.push(report.classification);
  lines.push("");
  lines.push("## Proposed Change");
  lines.push("");
  lines.push(report.proposedChange);
  lines.push("");
  lines.push("## Step Log");
  lines.push("");
  lines.push("| # | Domain | Actor | Action | Result |");
  lines.push("|---|--------|-------|--------|--------|");
  for (const step of report.steps) {
    lines.push("| " + step.n + " | " + step.domain + " | " + step.actor + " | " + step.action + " | " + step.result + " |");
  }
  lines.push("");
  lines.push("## Assertions");
  lines.push("");
  lines.push("| Claim | Held | Detail |");
  lines.push("|-------|------|--------|");
  for (const assertion of report.assertions) {
    lines.push("| " + assertion.claim + " | " + (assertion.held ? "yes" : "NO") + " | " + assertion.detail + " |");
  }
  lines.push("");
  lines.push("## Findings");
  lines.push("");
  for (const finding of report.findings) {
    lines.push("### " + finding.title);
    lines.push("");
    lines.push("**Classification:** " + finding.classification);
    lines.push("");
    lines.push(finding.detail);
    lines.push("");
  }
  lines.push("## Invariant Checks");
  lines.push("");
  for (const item of report.invariants) lines.push("- " + item);
  lines.push("");
  lines.push("## Conclusion");
  lines.push("");
  lines.push(report.conclusion);
  lines.push("");
  return lines.join("\n");
}
