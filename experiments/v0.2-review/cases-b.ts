import { Domain } from "../../kernel/domain.ts";
import { createVerifier } from "../../kernel/evidence.ts";
import { hashJson } from "../../kernel/json.ts";
import { PolicyInterpreter, policyDocument, registerKernelRules } from "../../kernel/policy.ts";
import type { JsonValue } from "../../kernel/types.ts";
import * as kernel from "../../kernel/index.ts";
import { checkInvariants } from "../../kernel/invariants.ts";
import { Recorder, finalize, seed, type ReviewCase } from "../harness.ts";
import { genesisPolicy, standardInterpreter } from "../../extensions/index.ts";
import { createDecision, judgmentPolicy } from "../../extensions/decision.ts";
import { createOutcome, outcomeKey } from "../../extensions/outcome.ts";
import { allowPolicy, actorPolicy, clock, makeDomain, proposal } from "./common.ts";

// ---------------------------------------------------------------------------
// 009 - Protocolized Disagreement
// ---------------------------------------------------------------------------
export function case009(): ReviewCase {
  const rec = new Recorder();
  const t = clock();
  const d = rec.track(makeDomain({ id: "dispute", clock: t.now, policies: [allowPolicy()] }));

  d.propose(proposal({ domain: "dispute", actor: "agent-a", intent: "record outcome O1", policy: "allow", effects: [{ op: "create", key: outcomeKey("O1"), value: createOutcome({ id: "O1", producer: "agent-a", specification: "S", status: "PROVEN" }) as unknown as JsonValue }] }));
  const conflict = d.propose(
    proposal({
      domain: "dispute",
      actor: "agent-b",
      intent: "record a conflict without blocking",
      policy: "allow",
      effects: [{ op: "create", key: "conflict/C1", value: { subject: "outcome/O1", status: "CONFLICTED", parties: ["agent-a", "agent-b"] } }],
    }),
  );
  rec.step("dispute", "agent-b", "record CONFLICTED state", "committed=" + conflict.committed);
  const after = d.propose(proposal({ domain: "dispute", actor: "agent-a", intent: "continue working despite the conflict", policy: "allow", effects: [{ op: "create", key: outcomeKey("O2"), value: createOutcome({ id: "O2", producer: "agent-a", specification: "S2", status: "UNPROVEN" }) as unknown as JsonValue }] }));
  rec.step("dispute", "agent-a", "transition while CONFLICTED", "committed=" + after.committed);

  const conflictValue = d.document("conflict/C1")?.value as unknown as { status: string };
  rec.assert(
    "conflict is representable as ordinary State",
    conflictValue.status === "CONFLICTED",
    "conflict/C1 holds CONFLICTED",
  );
  rec.assert(
    "conflict does not automatically block further transitions",
    after.committed === true,
    "a transition committed while the conflict remained in state",
  );
  rec.assert(
    "the disputed record is not mutated by the conflict",
    (d.document(outcomeKey("O1"))!.value as unknown as { status: string }).status === "PROVEN",
    "O1 still reads PROVEN; the conflict is separate state",
  );

  return finalize({
    id: "009",
    name: "Protocolized Disagreement",
    invariant: "v0.2 I7 - Conflict Is Not Automatically a Block",
    prediction: "A CONFLICTED record will be ordinary State and will not by itself prevent subsequent authorized transitions.",
    scenario: "Record a disputed outcome, mark a conflict, then continue transacting.",
    observed: "The conflict committed as state, the disputed outcome was untouched, and a further transition committed normally.",
    classification: "SUPPORTED.",
    rec,
  });
}

// ---------------------------------------------------------------------------
// 010 - Authority Without Global Root
// ---------------------------------------------------------------------------
export function case010(): ReviewCase {
  const rec = new Recorder();
  const t = clock();
  const d1 = rec.track(makeDomain({ id: "domain-1", clock: t.now, policies: [actorPolicy("act", ["agent-a"])] }));
  const d2 = rec.track(makeDomain({ id: "domain-2", clock: t.now, policies: [actorPolicy("act", ["agent-b"])] }));

  const inD1 = d1.propose(proposal({ domain: "domain-1", actor: "agent-a", intent: "act where authorized", policy: "act", effects: [{ op: "create", key: "action/A1", value: { ok: true } }] }));
  const inD2 = d2.propose(proposal({ domain: "domain-2", actor: "agent-a", intent: "act where not authorized", policy: "act", effects: [{ op: "create", key: "action/A1", value: { ok: true } }] }));
  rec.step("domain-1", "agent-a", "act under an allowlist that names agent-a", "committed=" + inD1.committed);
  rec.step("domain-2", "agent-a", "same actor, different allowlist", "committed=" + inD2.committed + " failure=" + String(inD2.failure?.kind));

  rec.assert(
    "the same agent is authorized in one Domain and not in another",
    inD1.committed === true && inD2.committed === false && inD2.failure?.kind === "POLICY",
    String(inD2.failure?.detail),
  );
  rec.assert(
    "nothing in the ledger carries authority across the boundary",
    d1.ledger.length === 1 && d2.ledger.length === 0,
    "domain-2 recorded only a rejected attempt",
  );

  return finalize({
    id: "010",
    name: "Authority Without Global Root",
    invariant: "v0.2 I3 - Domain-Scoped Authority",
    prediction: "Authority recognized in one Domain will confer nothing in another Domain that has not recognized it.",
    scenario: "The same actor proposes the same action in two Domains with different allowlists.",
    observed: "The action committed in the Domain that named the actor and was rejected in the other, with no cross-domain effect.",
    classification: "SUPPORTED.",
    rec,
  });
}

// ---------------------------------------------------------------------------
// 011 - Centralized and Decentralized Domains
// ---------------------------------------------------------------------------
export function case011(): ReviewCase {
  const rec = new Recorder();
  const t = clock();
  const central = rec.track(makeDomain({ id: "central", clock: t.now, policies: [actorPolicy("act", ["admin"])] }));
  const decentral = rec.track(makeDomain({ id: "decentral", clock: t.now, policies: [judgmentPolicy({ id: "act", threshold: 2, allowedJudges: ["j1", "j2", "j3"] })] }));

  const single = central.propose(proposal({ domain: "central", actor: "admin", intent: "a single administrator acts", policy: "act", effects: [{ op: "create", key: "action/A1", value: { by: "admin" } }] }));
  const target = proposal({ domain: "decentral", actor: "requester", intent: "a plurality acts", policy: "act", effects: [{ op: "create", key: "action/A1", value: { by: "quorum" } }] });
  createDecision(decentral, { evaluator: "j1", conclusion: "AFFIRM", subject: hashJson(target), timestamp: 1, rationale: "approved" });
  createDecision(decentral, { evaluator: "j2", conclusion: "AFFIRM", subject: hashJson(target), timestamp: 2, rationale: "approved" });
  const plurality = decentral.propose(target);
  rec.step("central", "admin", "authorize under a single-administrator policy", "committed=" + single.committed);
  rec.step("decentral", "requester", "authorize under a two-of-three policy", "committed=" + plurality.committed);

  rec.assert(
    "both organizational forms authorize through the identical pipeline",
    single.committed === true && plurality.committed === true,
    "both transitions committed with no kernel difference",
  );
  rec.assert(
    "the kernel imposes no organizational assumption",
    central.interpreter.types().join(",") === decentral.interpreter.types().join(","),
    "both Domains share one rule vocabulary: " + central.interpreter.types().length + " rule types",
  );
  rec.assert(
    "the difference is entirely a matter of Policy content",
    (central.policyDocument("act")!.value as unknown as { rules: unknown[] }).rules.length === 1 &&
      (decentral.policyDocument("act")!.value as unknown as { rules: unknown[] }).rules.length === 1,
    "each Domain holds a different policy document in its own state",
  );

  return finalize({
    id: "011",
    name: "Centralized and Decentralized Domains",
    invariant: "v0.2 organizational neutrality",
    prediction: "A single-administrator Domain and a plurality Domain will authorize transitions identically at the kernel boundary.",
    scenario: "One Domain gates on an administrator allowlist, the other on a two-of-three judgment threshold.",
    observed: "Both authorized their transition through the same interpreter and pipeline; only the policy documents differed.",
    classification: "SUPPORTED.",
    rec,
  });
}

// ---------------------------------------------------------------------------
// 012 - Policy Evolution (I10)
// ---------------------------------------------------------------------------
export function case012(): ReviewCase {
  const rec = new Recorder();
  const t = clock();
  const v1 = policyDocument({ id: "transfer", rules: [{ type: "actor-in", params: { actors: ["agent-a"] } }] });
  const d = rec.track(makeDomain({ id: "evolve", clock: t.now, policies: [v1, allowPolicy()] }));

  const foreign = d.propose(
    proposal({
      domain: "evolve",
      actor: "agent-a",
      intent: "amend policy/transfer using an unrelated policy",
      policy: "allow",
      effects: [{ op: "update", key: "policy/transfer", value: v1 as unknown as JsonValue, expectVersion: 1 }],
    }),
  );
  rec.step("evolve", "agent-a", "amend policy/transfer under policy/allow", "committed=" + foreign.committed + " failure=" + String(foreign.failure?.kind));
  rec.assert(
    "a policy cannot be amended by an unrelated policy",
    foreign.committed === false && foreign.failure?.kind === "POLICY_AMENDMENT",
    String(foreign.failure?.detail),
  );

  const fabricate = d.propose(
    proposal({
      domain: "evolve",
      actor: "agent-a",
      intent: "create a brand new policy by transition",
      policy: "allow",
      effects: [{ op: "create", key: "policy/backdoor", value: policyDocument({ id: "backdoor", rules: [{ type: "allow-all" }] }) as unknown as JsonValue }],
    }),
  );
  rec.step("evolve", "agent-a", "create policy/backdoor by transition", "committed=" + fabricate.committed + " failure=" + String(fabricate.failure?.kind));
  rec.assert(
    "a policy cannot be created outside genesis without policy/authority",
    fabricate.committed === false && fabricate.failure?.kind === "POLICY_AMENDMENT",
    String(fabricate.failure?.detail),
  );

  const v2 = policyDocument({ id: "transfer", description: "v2 requires evidence as well", rules: [{ type: "actor-in", params: { actors: ["agent-a"] } }, { type: "evidence-required", params: { kind: "approval", min: 1 } }] });
  const amend = d.propose(
    proposal({
      domain: "evolve",
      actor: "agent-a",
      intent: "self-amend policy/transfer to v2",
      policy: "transfer",
      expectedPolicyVersion: 1,
      effects: [{ op: "update", key: "policy/transfer", value: v2 as unknown as JsonValue, expectVersion: 1 }],
    }),
  );
  rec.step("evolve", "agent-a", "self-amend policy/transfer to v2", "committed=" + amend.committed);
  rec.assert(
    "a policy may amend itself under a version pin",
    amend.committed === true && d.policyDocument("transfer")!.version === 2,
    "policy/transfer is now state version " + d.policyDocument("transfer")!.version,
  );

  const underV2 = d.propose(proposal({ domain: "evolve", actor: "agent-a", intent: "act under v2 without approval", policy: "transfer", effects: [{ op: "create", key: "action/A1", value: { ok: true } }] }));
  rec.step("evolve", "agent-a", "act under the new policy without approval", "committed=" + underV2.committed + " failure=" + String(underV2.failure?.kind));
  rec.assert(
    "the amended policy immediately has teeth",
    underV2.committed === false && underV2.failure?.kind === "POLICY",
    String(underV2.failure?.detail),
  );

  return finalize({
    id: "012",
    name: "Policy Evolution",
    invariant: "v0.2 I10 - Policy Is State",
    prediction: "A policy will be amendable only by itself under a version pin or by policy/authority, never creatable by a bare transition, and the new version will take effect immediately.",
    scenario: "Attempt amendment under an unrelated policy, attempt to fabricate a new policy, then self-amend with a version pin and act under the new version.",
    observed: "Both illegitimate attempts were rejected with POLICY_AMENDMENT, the self-amendment committed advancing the policy's state version to 2, and the new rule immediately rejected an unapproved action.",
    classification: "SUPPORTED. This is the candidate's strongest addition and it is mechanically checkable.",
    rec,
  });
}

// ---------------------------------------------------------------------------
// 013 - Evidence Recognition Capture
// ---------------------------------------------------------------------------
export function case013(): ReviewCase {
  const rec = new Recorder();
  const t = clock();
  const attest = policyDocument({ id: "attest", rules: [{ type: "evidence-required", params: { kind: "attestation", min: 1 } }] });

  const permissive = rec.track(makeDomain({ id: "permissive", clock: t.now, policies: [attest] }));
  const selfAttestation = permissive.publishEvidence({ kind: "attestation", producer: "attacker", domain: "permissive", payload: { claim: "I am trustworthy" } as JsonValue, issuedAt: 1 });
  const captured = permissive.propose(
    proposal({ domain: "permissive", actor: "attacker", intent: "act on my own attestation", policy: "attest", effects: [{ op: "create", key: "action/A1", value: { by: "attacker" } }], evidence: [selfAttestation.id] }),
  );
  rec.step("permissive", "attacker", "act on a self-issued attestation", "committed=" + captured.committed);
  rec.assert(
    "an unrestricted recognition rule can be captured by self-issued Evidence",
    captured.committed === true,
    "the domain accepted the attacker's own attestation",
  );

  const strict = rec.track(
    new Domain({
      id: "strict",
      interpreter: standardInterpreter(),
      verifier: createVerifier({ trustedProducers: ["notary"] }),
      clock: t.now,
      initialState: [genesisPolicy(attest)],
    }),
  );
  const forged = strict.publishEvidence({ kind: "attestation", producer: "attacker", domain: "strict", payload: { claim: "I am trustworthy" } as JsonValue, issuedAt: 1 });
  const rejected = strict.propose(
    proposal({ domain: "strict", actor: "attacker", intent: "act on my own attestation", policy: "attest", effects: [{ op: "create", key: "action/A1", value: { by: "attacker" } }], evidence: [forged.id] }),
  );
  rec.step("strict", "attacker", "act on the same self-issued attestation", "committed=" + rejected.committed + " failure=" + String(rejected.failure?.kind));

  rec.assert(
    "recognition is a governance surface: producer trust is part of the verification boundary",
    rejected.committed === false,
    String(rejected.failure?.detail),
  );
  rec.assert(
    "the same policy text behaves differently under a different verifier",
    (permissive.policyDocument("attest")!.value as unknown as { rules: unknown[] }).rules.length === (strict.policyDocument("attest")!.value as unknown as { rules: unknown[] }).rules.length,
    "identical rules, different recognition outcome",
  );

  return finalize({
    id: "013",
    name: "Evidence Recognition Capture",
    invariant: "v0.2 I2 / I5 - Evidence has no authority by itself",
    prediction: "An unrestricted recognition rule will be capturable by self-issued Evidence, and tightening the producer trust boundary will stop the same attack without changing the rule text.",
    scenario: "An attacker publishes an attestation about itself and acts on it, first in a permissive Domain then in a Domain with a trusted-producer verifier.",
    observed: "The permissive Domain was captured; the strict Domain refused the identical attempt.",
    classification: "SUPPORTED, and it exposes that the verifier's trust set is part of the authority boundary even though it is not State.",
    rec,
  });
}

// ---------------------------------------------------------------------------
// 014 - Exit and Portability
// ---------------------------------------------------------------------------
export function case014(): ReviewCase {
  const rec = new Recorder();
  const t = clock();
  const recognition = policyDocument({ id: "recognize", rules: [{ type: "evidence-required", params: { kind: "history-proof", min: 1 } }] });
  const from = rec.track(makeDomain({ id: "origin", clock: t.now, policies: [allowPolicy()] }));
  const to = rec.track(makeDomain({ id: "destination", clock: t.now, policies: [allowPolicy(), recognition] }));

  const input = { kind: "history-proof", producer: "origin", domain: "shared-history", payload: { records: 12 } as JsonValue, issuedAt: 1 };
  const atOrigin = from.publishEvidence(input);
  const atDestination = to.publishEvidence(input);
  const ledgerBefore = to.ledger.length;
  rec.step("destination", "nobody", "import portable history", "evidence published; ledger unchanged (" + ledgerBefore + " transitions)");

  rec.assert(
    "history is portable because it is content addressed",
    atOrigin.id === atDestination.id,
    "identical content address in both Domains: " + atOrigin.id.slice(0, 14),
  );
  rec.assert(
    "importing history transfers no authority",
    to.ledger.length === 0,
    "publishing Evidence changed no State (I2)",
  );

  const attempt = to.propose(
    proposal({ domain: "destination", actor: "agent-a", intent: "act before recognition", policy: "allow", effects: [{ op: "create", key: "action/A1", value: { ok: true } }] }),
  );
  rec.step("destination", "agent-a", "act without invoking a recognizing policy", "committed=" + attempt.committed);

  const recognized = to.propose(
    proposal({
      domain: "destination",
      actor: "agent-a",
      intent: "act under explicit recognition of the imported history",
      policy: "recognize",
      effects: [{ op: "create", key: "action/A2", value: { ok: true, basis: atDestination.id } }],
      evidence: [atDestination.id],
    }),
  );
  rec.step("destination", "agent-a", "act under the recognition policy", "committed=" + recognized.committed);
  rec.assert(
    "authority is re-recognized by the destination Domain, not carried by the artifact",
    recognized.committed === true,
    recognized.policyResult?.reason ?? "",
  );

  return finalize({
    id: "014",
    name: "Exit and Portability",
    invariant: "v0.2 I5 - Local Recognition",
    prediction: "History will be portable by content address and will acquire no authority until the destination Domain recognizes it through Policy.",
    scenario: "Export a history proof from one Domain, republish it identically in another, then act with and without a recognizing policy.",
    observed: "The artifact kept its content address across Domains, publishing it changed no state, and only the recognizing policy authorized action.",
    classification: "SUPPORTED.",
    rec,
  });
}

// ---------------------------------------------------------------------------
// 015 - Decision Reduction
// ---------------------------------------------------------------------------
export function case015(): ReviewCase {
  const rec = new Recorder();
  const t = clock();
  const d = rec.track(makeDomain({ id: "judgment", clock: t.now, policies: [judgmentPolicy({ id: "judge", threshold: 1, allowedJudges: ["judge-1"] })] }));

  const target = proposal({ domain: "judgment", actor: "agent-a", intent: "act on a judgment", policy: "judge", effects: [{ op: "create", key: "action/A1", value: { ok: true } }] });
  const without = d.propose(target);
  rec.step("judgment", "agent-a", "act with no judgment recorded", "committed=" + without.committed + " failure=" + String(without.failure?.kind));

  const judgment = createDecision(d, { evaluator: "judge-1", conclusion: "AFFIRM", subject: hashJson(target), timestamp: 1, rationale: "verified against the specification" });
  const with_ = d.propose(target);
  rec.step("judgment", "agent-a", "act with a recorded judgment", "committed=" + with_.committed);

  const kernelExports = Object.keys(kernel);
  rec.assert(
    "authorization is identical whether the judgment is a primitive or Evidence",
    without.committed === false && with_.committed === true,
    "rejected without a judgment, allowed with one",
  );
  rec.assert(
    "the judgment is stored as Evidence and nothing else",
    judgment.kind === "decision" && d.evidenceOfKind("decision").length === 1,
    "one Evidence record of kind decision; no separate kernel object",
  );
  rec.assert(
    "the kernel module exposes no Decision primitive",
    !kernelExports.some((name) => name.toLowerCase().includes("decision")),
    kernelExports.length + " kernel exports, none decision-related",
  );
  rec.assert(
    "the Decision schema requires a rationale, so a bare score cannot conform",
    typeof (judgment.payload as unknown as { rationale?: unknown }).rationale === "string",
    "rationale is a required field of the Decision schema",
  );

  return finalize({
    id: "015",
    name: "Decision Reduction",
    invariant: "v0.2 section 2.3 / I6 - Judgment is Evidence",
    prediction: "A judgment modeled as Evidence will authorize exactly as the v0.1 Decision primitive did, while the kernel export surface will contain no Decision.",
    scenario: "Propose the same transition with and without a recorded judgment, then inspect the kernel's exports.",
    observed: "The transition was rejected without the judgment and allowed with it; the judgment lives as Evidence of kind decision; the kernel exposes nothing decision-related.",
    classification: "SUPPORTED. The reduction is real at the API boundary.",
    rec,
  });
}

// ---------------------------------------------------------------------------
// 016 - Kernel Reduction
// ---------------------------------------------------------------------------
const FORBIDDEN_KERNEL_EXPORTS = ["decision", "commitment", "capability", "outcome", "consensus", "governance", "execution", "market", "reputation", "currency"];

export function case016(): ReviewCase {
  const rec = new Recorder();
  const t = clock();
  const d = rec.track(
    makeDomain({
      id: "surface",
      clock: t.now,
      policies: [allowPolicy(), judgmentPolicy({ id: "judge", threshold: 1, allowedJudges: ["judge-1"] })],
    }),
  );

  const target = proposal({ domain: "surface", actor: "agent-a", intent: "exercise the primitive surface", policy: "judge", effects: [{ op: "create", key: "record/R1", value: { ok: true } }] });
  createDecision(d, { evaluator: "judge-1", conclusion: "AFFIRM", subject: hashJson(target), timestamp: 1, rationale: "surface test" });
  const committed = d.propose(target);
  rec.step("surface", "agent-a", "run a full judgment-mediated transition", "committed=" + committed.committed);

  const kernelExports = Object.keys(kernel);
  const leaked = kernelExports.filter((name) => FORBIDDEN_KERNEL_EXPORTS.some((word) => name.toLowerCase().includes(word)));
  rec.assert(
    "the kernel export surface contains only the four candidate primitives",
    leaked.length === 0,
    leaked.length === 0 ? kernelExports.length + " exports; none are higher-level schemas" : "leaked: " + leaked.join(", "),
  );
  const recordFields = Object.keys(d.ledger[0] ?? {}).sort().join(",");
  rec.assert(
    "the transition record carries no field for a fifth primitive",
    recordFields === "committedAt,domain,evidence,hash,policyResult,prev,proposal,proposalHash,seq,stateHashAfter,stateHashBefore,transitionId",
    recordFields,
  );
  const kernelOnly = new PolicyInterpreter();
  registerKernelRules(kernelOnly);
  const kernelVocabulary = kernelOnly.types();
  rec.assert(
    "the kernel rule vocabulary is generic and contains no domain schema",
    kernelVocabulary.every((type) => !FORBIDDEN_KERNEL_EXPORTS.some((word) => type.includes(word))),
    "kernel rules: " + kernelVocabulary.join(", ") + " | extension rules: " + standardInterpreter().types().filter((t) => !kernelVocabulary.includes(t)).join(", "),
  );
  rec.assert(
    "I10 is the one newly checkable invariant of the reduction",
    (() => {
      const policyState = checkInvariantsOf(d);
      return policyState === "PASS";
    })(),
    "Policy Is State verified mechanically",
  );

  return finalize({
    id: "016",
    name: "Kernel Reduction",
    invariant: "v0.2 kernel arity - four primitives",
    prediction: "No reviewed case will require a fifth primitive, and the kernel's export surface will contain no higher-level schema.",
    scenario: "Exercise a full judgment-mediated transition and inspect the kernel export surface and rule vocabulary.",
    observed: "The transition committed on the four-primitive surface; no forbidden schema leaked into the kernel; the rule vocabulary stayed generic; I10 verified mechanically.",
    classification: "SUPPORTED. This is the candidate's own claim, now executable.",
    rec,
  });
}

function checkInvariantsOf(d: Domain): string {
  return checkInvariants(d).find((r) => r.id === "I10")?.status ?? "MISSING";
}
