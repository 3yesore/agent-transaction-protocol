import { hashJson } from "../../kernel/json.ts";
import type { TransitionProposal } from "../../kernel/types.ts";
import { Recorder, finalize, type ReviewCase } from "../harness.ts";
import { judgmentPolicy, type DecisionPayload } from "../../extensions/decision.ts";
import {
  decideFor,
  defaultRuleProvider,
  modelProvider,
  ollamaTransport,
  type DecisionRequest,
} from "../../extensions/decision-provider.ts";
import { clock, makeDomain, proposal } from "./common.ts";
import { startMockOllama } from "./mock-model.ts";

const QUESTION = "Did the supplier deliver the artifact described by the commitment?";
const MATERIALS = [{ label: "receipt", content: "delivery receipt 8841; artifact hash matches the committed digest" }];

function requestFor(target: TransitionProposal, evaluator = "m1"): DecisionRequest {
  return {
    evaluator,
    subject: hashJson(target),
    question: QUESTION,
    options: ["AFFIRM", "DENY", "ABSTAIN"],
    materials: MATERIALS,
    timestamp: 1,
  };
}

async function expectFailure(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

// ---------------------------------------------------------------------------
// 021 - Decision Provider Conformance
// ---------------------------------------------------------------------------
export async function case021(): Promise<ReviewCase> {
  const rec = new Recorder();
  const t = clock();
  const d = rec.track(
    makeDomain({ id: "provider", clock: t.now, policies: [judgmentPolicy({ id: "judge", threshold: 1, allowedJudges: ["m1"] })] }),
  );
  const target = proposal({ domain: "provider", actor: "agent-a", intent: "act on a model judgment", policy: "judge", effects: [{ op: "create", key: "action/A1", value: { ok: true } }] });
  const request = requestFor(target);

  // a) a conforming response is accepted and published
  const conforming = JSON.stringify({ conclusion: "AFFIRM", confidence: 0.8, rationale: "receipt 8841 matches the committed artifact digest" });
  const good = await startMockOllama([conforming]);
  const published = await decideFor(d, modelProvider(ollamaTransport({ model: good.model, baseUrl: good.url })), request);
  await good.close();
  rec.step("provider", "m1", "model returns a conforming decision", "published evidence " + published.record.id.slice(0, 14));

  // b) a bare score is refused, twice
  const bare = await startMockOllama([JSON.stringify({ confidence: 0.83 })]);
  const bareError = await expectFailure(() => modelProvider(ollamaTransport({ model: bare.model, baseUrl: bare.url }), { retries: 1 }).decide(request));
  const bareCalls = bare.requestCount();
  await bare.close();
  rec.step("provider", "m1", "model returns a bare score", "refused after " + bareCalls + " call(s)");

  // c) an off-menu conclusion is refused
  const offMenu = await startMockOllama([JSON.stringify({ conclusion: "MAYBE", rationale: "the materials are ambiguous on this point" })]);
  const offMenuError = await expectFailure(() => modelProvider(ollamaTransport({ model: offMenu.model, baseUrl: offMenu.url }), { retries: 0 }).decide(request));
  await offMenu.close();
  rec.step("provider", "m1", "model invents a conclusion", "refused: " + offMenuError.slice(0, 60));

  // d) the deterministic evaluator satisfies the same interface
  const offline = await defaultRuleProvider().decide({ ...request, materials: [{ label: "trace", content: "non-delivery observed at the deadline" }] });
  rec.step("provider", "rule-j1", "deterministic evaluator judges a failure trace", offline.conclusion);

  rec.assert(
    "a conforming model response becomes a Decision addressed to the proposal",
    published.record.kind === "decision" && published.record.about === request.subject,
    "evidence kind " + published.record.kind + " about " + String(published.record.about).slice(0, 14),
  );
  rec.assert(
    "a bare score is refused, and the provider retried once before giving up",
    bareError.length > 0 && bareCalls === 2,
    bareError.slice(0, 120),
  );
  rec.assert(
    "the refusal names the missing basis rather than a parse error",
    bareError.includes("conclusion") || bareError.includes("rationale"),
    bareError.slice(0, 120),
  );
  rec.assert(
    "an off-menu conclusion is refused",
    offMenuError.includes("not one of"),
    offMenuError.slice(0, 120),
  );
  rec.assert(
    "the same interface serves a deterministic evaluator with no model at all",
    offline.conclusion === "DENY" && offline.rationale.length > 12,
    offline.conclusion + ": " + offline.rationale,
  );
  rec.assert(
    "exactly one decision was published: the refused attempts left no trace",
    d.evidenceOfKind("decision").length === 1,
    "decision evidence records: " + d.evidenceOfKind("decision").length,
  );

  return finalize({
    id: "021",
    name: "Decision Provider Conformance",
    invariant: "v0.2 I6 + docs/decision-schema.md (rationale is required)",
    prediction: "A conforming model response will be accepted and published, while a bare score and an off-menu conclusion will both be refused before any Evidence is written.",
    scenario: "Drive the provider against a mock model server that returns a conforming object, then a bare score, then an invented conclusion, and finally a deterministic evaluator.",
    observed: "The conforming response became a Decision; the bare score was retried once and then refused with a message about the missing basis; the invented conclusion was refused; the offline evaluator produced a conforming DENY; nothing was published for the refusals.",
    classification: "SUPPORTED. The schema boundary is enforced in code, not trusted to the model.",
    rec,
  });
}

// ---------------------------------------------------------------------------
// 022 - A Model Judgment Inside a Live Domain
// ---------------------------------------------------------------------------
export async function case022(): Promise<ReviewCase> {
  const rec = new Recorder();
  const t = clock();
  const judge = () => judgmentPolicy({ id: "judge", threshold: 1, allowedJudges: ["m1"] });

  const affirming = rec.track(makeDomain({ id: "market-affirm", clock: t.now, policies: [judge()] }));
  const targetAffirm = proposal({ domain: "market-affirm", actor: "agent-a", intent: "release the escrow", policy: "judge", effects: [{ op: "create", key: "action/A1", value: { released: true } }] });
  const affirmMock = await startMockOllama([JSON.stringify({ conclusion: "AFFIRM", confidence: 0.91, rationale: "receipt 8841 matches the committed artifact digest exactly" })]);
  await decideFor(affirming, modelProvider(ollamaTransport({ model: affirmMock.model, baseUrl: affirmMock.url })), requestFor(targetAffirm));
  const released = affirming.propose(targetAffirm);
  await affirmMock.close();
  rec.step("market-affirm", "m1", "model affirms, then the Domain authorizes", "committed=" + released.committed);

  const denying = rec.track(makeDomain({ id: "market-deny", clock: t.now, policies: [judge()] }));
  const targetDeny = proposal({ domain: "market-deny", actor: "agent-a", intent: "release the escrow", policy: "judge", effects: [{ op: "create", key: "action/A2", value: { released: true } }] });
  const denyMock = await startMockOllama([JSON.stringify({ conclusion: "DENY", confidence: 0.88, rationale: "the artifact hash in the receipt does not match the commitment" })]);
  await decideFor(denying, modelProvider(ollamaTransport({ model: denyMock.model, baseUrl: denyMock.url })), requestFor(targetDeny));
  const refused = denying.propose(targetDeny);
  await denyMock.close();
  rec.step("market-deny", "m1", "model denies, then the Domain refuses", "committed=" + refused.committed + " failure=" + String(refused.failure?.kind));

  const payload = affirming.evidenceOfKind("decision")[0].payload as unknown as DecisionPayload;
  rec.assert(
    "a model judgment authorizes a transition exactly as any other judgment does",
    released.committed === true,
    released.policyResult?.reason ?? "",
  );
  rec.assert(
    "the model's own rationale is recorded in protocol state",
    payload.rationale === "receipt 8841 matches the committed artifact digest exactly" && payload.confidence === 0.91,
    JSON.stringify({ evaluator: payload.evaluator, conclusion: payload.conclusion, confidence: payload.confidence }),
  );
  rec.assert(
    "a denying model judgment blocks the same transition",
    refused.committed === false && refused.failure?.kind === "POLICY",
    String(refused.failure?.detail),
  );
  rec.assert(
    "the same model adapter drives both outcomes, so the difference is the judgment not the plumbing",
    released.committed !== refused.committed,
    "affirm committed, deny rejected",
  );

  return finalize({
    id: "022",
    name: "A Model Judgment Inside a Live Domain",
    invariant: "v0.2 I6 - a judgment reaches state only through Policy",
    prediction: "A model-produced Decision will authorize the transition when it affirms and block it when it denies, with the model's rationale recorded verbatim in state.",
    scenario: "Publish a model judgment addressed to a proposal, then let the Domain authorize or refuse the identical transition.",
    observed: "The affirming judgment authorized the release, the denying judgment blocked it, and the recorded Evidence carries the evaluator, conclusion, confidence and rationale the model supplied.",
    classification: "SUPPORTED. The model is an evaluator, not an authority.",
    rec,
  });
}

// ---------------------------------------------------------------------------
// 023 - Model Failure Is Not Authority
// ---------------------------------------------------------------------------
export async function case023(): Promise<ReviewCase> {
  const rec = new Recorder();
  const t = clock();
  const d = rec.track(
    makeDomain({ id: "provider-fail", clock: t.now, policies: [judgmentPolicy({ id: "judge", threshold: 1, allowedJudges: ["m1"] })] }),
  );
  const target = proposal({ domain: "provider-fail", actor: "agent-a", intent: "release the escrow", policy: "judge", effects: [{ op: "create", key: "action/A1", value: { released: true } }] });
  const request = requestFor(target);

  const junk = await startMockOllama(["I think it is probably fine, hard to say.", "It looks acceptable to me based on the materials."]);
  const junkError = await expectFailure(() => decideFor(d, modelProvider(ollamaTransport({ model: junk.model, baseUrl: junk.url }), { retries: 1 }), request));
  await junk.close();
  rec.step("provider-fail", "m1", "model replies with prose, twice", "no decision published: " + junkError.slice(0, 50));

  const blocked = d.propose(target);
  rec.step("provider-fail", "agent-a", "attempt the transition with no published judgment", "committed=" + blocked.committed + " failure=" + String(blocked.failure?.kind));

  const confident = await startMockOllama([JSON.stringify({ conclusion: "DEFINITELY", confidence: 0.999, rationale: "the supplier is obviously trustworthy given these materials" })]);
  const confidentError = await expectFailure(() => modelProvider(ollamaTransport({ model: confident.model, baseUrl: confident.url }), { retries: 0 }).decide(request));
  await confident.close();
  rec.step("provider-fail", "m1", "model is 99.9% confident but off-menu", "refused: " + confidentError.slice(0, 50));

  rec.assert(
    "an unconforming model produces no Decision at all",
    junkError.length > 0 && d.evidenceOfKind("decision").length === 0,
    "decision evidence records: " + d.evidenceOfKind("decision").length,
  );
  rec.assert(
    "with no Decision the transition is refused and nothing changes",
    blocked.committed === false && blocked.failure?.kind === "POLICY" && d.document("action/A1") === undefined,
    String(blocked.failure?.detail),
  );
  rec.assert(
    "confidence does not create authority: 0.999 in an invented category is still refused",
    confidentError.includes("not one of"),
    confidentError.slice(0, 120),
  );
  rec.assert(
    "the domain still verifies and the failed attempts stayed out of the ledger",
    d.verify().ok && d.ledger.length === 0 && d.attempts.length >= 1,
    "ledger " + d.ledger.length + ", attempts " + d.attempts.length,
  );

  return finalize({
    id: "023",
    name: "Model Failure Is Not Authority",
    invariant: "v0.2 I2 / I6 - Evidence has no authority, and a model cannot manufacture it",
    prediction: "A model that cannot produce a conforming decision will leave the Domain with no judgment, so the transition will be refused regardless of how confident the model sounds.",
    scenario: "Drive the provider with prose, then with a 0.999-confidence invented conclusion, then attempt the transition.",
    observed: "Both attempts were refused, no Decision was published, the transition was blocked, no state changed, and the ledger stayed empty while the refusals were recorded in the attempts log.",
    classification: "SUPPORTED. This is the property that makes a decision model safe to place in front of state transitions: its confidence is not authority.",
    rec,
  });
}
