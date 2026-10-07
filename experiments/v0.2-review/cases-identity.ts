import { Domain } from "../../kernel/domain.ts";
import { createIntegrityVerifier, createVerifier, type EvidenceVerifier } from "../../kernel/evidence.ts";
import { hashJson } from "../../kernel/json.ts";
import { policyDocument } from "../../kernel/policy.ts";
import type { JsonValue, PolicyDocument, TransitionProposal } from "../../kernel/types.ts";
import { Recorder, finalize, seed, type ReviewCase } from "../harness.ts";
import { capabilityKey, updateCapabilityEffect, type CapabilityValue } from "../../extensions/capability.ts";
import { createDecision } from "../../extensions/decision.ts";
import { createIdentity, identityKey, identityOf, isEligible, slashIdentity, type IdentityValue } from "../../extensions/identity.ts";
import { genesisPolicy, standardInterpreter, standardPreconditions } from "../../extensions/index.ts";
import { allowPolicy, clock, proposal } from "./common.ts";

/**
 * The market under attack.
 *
 * The victim has 300 credit in escrow. Releasing the escrow to the attacker
 * requires two affirmative judgments. The attacker controls no legitimate
 * judge, so it registers its own.
 *
 * Every figure in the assertions below is read out of protocol state, not
 * computed by hand in the test.
 */
const UNIT = "credit";
const ATTACKER_START = 1000;
const ESCROW_AMOUNT = 300;
const attackerKey = capabilityKey("attacker", UNIT);
const victimKey = capabilityKey("victim", UNIT);
const escrowKey = "escrow/T1";

function CAP(total: number, available: number, reserved: number, consumed: number): CapabilityValue {
  return { unit: UNIT, total, available, reserved, consumed };
}

function releasePolicy(minStake: number | null, requireValid = false): PolicyDocument {
  const rules = minStake === null
    ? [{ type: "decision-threshold", params: { threshold: 2 } }]
    : [{ type: "staked-decision-threshold", params: { threshold: 2, minStake, requireValid } }];
  return policyDocument({
    id: "release",
    description: minStake === null ? "2-of-N judgment, no stake and no provenance check" : "2 affirmations from judges staking at least " + minStake + (requireValid ? " with valid provenance" : ""),
    rules,
  });
}

function disputePolicy(): PolicyDocument {
  return policyDocument({
    id: "dispute",
    description: "the victim may slash on a valid non-delivery proof",
    rules: [
      { type: "actor-in", params: { actors: ["victim"] } },
      { type: "evidence-required", params: { kind: "non-delivery-proof", min: 1, statuses: ["VALID"] } },
    ],
  });
}

function market(rec: Recorder, id: string, now: () => number, release: PolicyDocument, verifier?: EvidenceVerifier): Domain {
  return rec.track(
    new Domain({
      id,
      interpreter: standardInterpreter(),
      verifier: verifier ?? createIntegrityVerifier(),
      preconditions: standardPreconditions(),
      clock: now,
      initialState: [
        genesisPolicy(release),
        genesisPolicy(allowPolicy()),
        genesisPolicy(disputePolicy()),
        seed(attackerKey, CAP(ATTACKER_START, ATTACKER_START, 0, 0) as unknown as JsonValue),
        seed(victimKey, CAP(ESCROW_AMOUNT, ESCROW_AMOUNT, 0, 0) as unknown as JsonValue),
        seed(escrowKey, { amount: ESCROW_AMOUNT, beneficiary: "victim", status: "HELD" } as JsonValue),
      ],
    }),
  );
}

/** Registers an identity and locks its stake out of the attacker's balance. */
function registerIdentity(domain: Domain, id: string, stake: number) {
  const doc = domain.document(attackerKey)!;
  const value = doc.value as unknown as CapabilityValue;
  const next = CAP(value.total, value.available - stake, value.reserved + stake, value.consumed);
  return domain.propose(
    proposal({
      domain: domain.id,
      actor: "attacker",
      intent: "register identity " + id + " with stake " + stake,
      policy: "allow",
      effects: [
        { op: "create", key: identityKey(id), value: createIdentity({ id, controller: "attacker", stake, unit: UNIT, registeredAt: 1 }) as unknown as JsonValue },
        updateCapabilityEffect(doc, next),
      ],
    }),
  );
}

function releaseProposal(domain: Domain): TransitionProposal {
  const escrow = domain.document(escrowKey)!;
  const victim = domain.document(victimKey)!;
  const attacker = domain.document(attackerKey)!;
  const v = victim.value as unknown as CapabilityValue;
  const a = attacker.value as unknown as CapabilityValue;
  return proposal({
    domain: domain.id,
    actor: "attacker",
    intent: "release the escrow to the attacker",
    policy: "release",
    effects: [
      { op: "update", key: escrowKey, value: { amount: ESCROW_AMOUNT, beneficiary: "attacker", status: "RELEASED" }, expectVersion: escrow.version },
      { op: "update", key: victimKey, value: CAP(v.total - ESCROW_AMOUNT, v.available - ESCROW_AMOUNT, v.reserved, v.consumed), expectVersion: victim.version },
      { op: "update", key: attackerKey, value: CAP(a.total + ESCROW_AMOUNT, a.available + ESCROW_AMOUNT, a.reserved, a.consumed), expectVersion: attacker.version },
    ],
  });
}

function attack(domain: Domain, judges: readonly string[]) {
  const target = releaseProposal(domain);
  for (const judge of judges) {
    createDecision(domain, { evaluator: judge, conclusion: "AFFIRM", subject: hashJson(target), timestamp: 1, rationale: "deliverable confirmed" });
  }
  return { target, result: domain.propose(target) };
}

function attackerBalance(domain: Domain): CapabilityValue {
  return domain.document(attackerKey)!.value as unknown as CapabilityValue;
}

function victimBalance(domain: Domain): CapabilityValue {
  return domain.document(victimKey)!.value as unknown as CapabilityValue;
}

// ---------------------------------------------------------------------------
// 017 - Sybil Without Cost
// ---------------------------------------------------------------------------
export function case017(): ReviewCase {
  const rec = new Recorder();
  const t = clock();
  const d = market(rec, "market-free", t.now, releasePolicy(null));

  const r1 = registerIdentity(d, "sybil-1", 0);
  const r2 = registerIdentity(d, "sybil-2", 0);
  rec.step("market-free", "attacker", "register two identities at zero stake", "committed=" + r1.committed + ", " + r2.committed);
  const a = attack(d, ["sybil-1", "sybil-2"]);
  rec.step("market-free", "attacker", "two Sybil judgments release the escrow", "committed=" + a.result.committed);

  const attacker = attackerBalance(d);
  const victim = victimBalance(d);
  rec.assert(
    "two free identities satisfy a 2-of-N threshold",
    a.result.committed === true,
    a.result.policyResult?.reason ?? "",
  );
  rec.assert(
    "the attacker captures the escrow at zero cost",
    attacker.total === ATTACKER_START + ESCROW_AMOUNT && attacker.reserved === 0,
    "attacker total " + attacker.total + " (was " + ATTACKER_START + "), stake locked " + attacker.reserved,
  );
  rec.assert(
    "the victim is drained with no recourse recorded",
    victim.total === 0,
    "victim total " + victim.total,
  );
  rec.assert(
    "identity without a cost is not a defence",
    attacker.total - ATTACKER_START === ESCROW_AMOUNT,
    "gross gain " + (attacker.total - ATTACKER_START) + " against a cost of 0",
  );

  return finalize({
    id: "017",
    name: "Sybil Without Cost",
    invariant: "open problem 5 (Sybil Resistance) - baseline attack",
    prediction: "A threshold that counts identifiers without requiring a cost will be satisfied by free attacker-created identities, and the attack will be profitable with no capital at risk.",
    scenario: "The attacker registers two zero-stake identities, has them affirm, and the release policy counts them.",
    observed: "The release committed, the attacker's balance rose by the full escrow, and nothing was locked.",
    classification: "SUPPORTED. Establishes the baseline: identity alone is worth nothing.",
    rec,
  });
}

// ---------------------------------------------------------------------------
// 018 - Registration Stake Prices the Attack, and Amortisation Defeats It
// ---------------------------------------------------------------------------
export function case018(): ReviewCase {
  const rec = new Recorder();
  const t = clock();
  const d = market(rec, "market-staked", t.now, releasePolicy(100));
  registerIdentity(d, "sybil-1", 100);
  registerIdentity(d, "sybil-2", 100);
  const a = attack(d, ["sybil-1", "sybil-2"]);
  rec.step("market-staked", "attacker", "attack with 100 stake per identity", "committed=" + a.result.committed);

  const attacker = attackerBalance(d);
  const costPerAttack = 2 * 100;
  const breakEven = Math.ceil(ESCROW_AMOUNT / 2);

  const priced = market(rec, "market-priced-out", t.now, releasePolicy(200));
  registerIdentity(priced, "sybil-1", 100);
  registerIdentity(priced, "sybil-2", 100);
  const blocked = attack(priced, ["sybil-1", "sybil-2"]);
  rec.step("market-priced-out", "attacker", "same 100-stake identities against a 200-stake requirement", "committed=" + blocked.result.committed + " failure=" + String(blocked.result.failure?.kind));

  rec.assert(
    "a stake requirement lets the attack proceed but puts capital at risk",
    a.result.committed === true && attacker.reserved === costPerAttack,
    "attacker total " + attacker.total + ", stake locked " + attacker.reserved,
  );
  rec.assert(
    "a stake above the break-even price makes the same identities ineligible",
    blocked.result.committed === false && blocked.result.failure?.kind === "POLICY",
    "break-even stake per judge is " + breakEven + "; policy required 200 - " + String(blocked.result.failure?.detail),
  );

  const survivor1 = identityOf(d.state, "sybil-1");
  const survivor2 = identityOf(d.state, "sybil-2");
  rec.step("market-staked", "attacker", "check whether the paid identities survive the attack", "eligible=" + isEligible(survivor1, 100) + ", " + isEligible(survivor2, 100));
  rec.assert(
    "registration is a one-time cost, so the next attack is free",
    isEligible(survivor1, 100) && isEligible(survivor2, 100),
    "both identities remain ACTIVE and eligible; marginal cost of attack 2 is 0, so amortised cost per attack falls as 1/R",
  );

  return finalize({
    id: "018",
    name: "Registration Stake Prices the Attack",
    invariant: "open problem 5 / 12 - cost as a filter",
    prediction: "A stake requirement will convert a free attack into a priced one, will block the attack when the stake exceeds the break-even price, but will not deter a repeat attacker because registration is one-time.",
    scenario: "Attack under a 100-stake requirement, retry the same identities against a 200-stake requirement, then inspect whether the identities survived.",
    observed: "The attack succeeded with 200 locked; the higher requirement rejected the same identities; and both identities remained eligible afterwards, so subsequent attacks carry no registration cost.",
    classification: "SUPPORTED. Stake is a capital requirement, not a correctness guarantee, and it is amortised away by repetition.",
    rec,
  });
}

// ---------------------------------------------------------------------------
// 019 - Slashing Makes It Unprofitable When the Fraud Is Provable
// ---------------------------------------------------------------------------
export function case019(): ReviewCase {
  const rec = new Recorder();
  const t = clock();
  const d = market(rec, "market-slash", t.now, releasePolicy(100));
  registerIdentity(d, "sybil-1", 100);
  registerIdentity(d, "sybil-2", 100);
  const a = attack(d, ["sybil-1", "sybil-2"]);
  rec.step("market-slash", "attacker", "attack succeeds first", "committed=" + a.result.committed);

  const proof = d.publishEvidence({
    kind: "non-delivery-proof",
    producer: "victim",
    domain: "market-slash",
    payload: { escrow: escrowKey, delivered: false } as JsonValue,
    issuedAt: 2,
  });

  const i1 = d.document(identityKey("sybil-1"))!;
  const i2 = d.document(identityKey("sybil-2"))!;
  const aDoc = d.document(attackerKey)!;
  const vDoc = d.document(victimKey)!;
  const slash = d.propose(
    proposal({
      domain: "market-slash",
      actor: "victim",
      intent: "slash both colluding judges and reverse the release",
      policy: "dispute",
      evidence: [proof.id],
      effects: [
        { op: "update", key: i1.key, value: slashIdentity(i1.value as unknown as IdentityValue, "fraudulent affirmation") as unknown as JsonValue, expectVersion: i1.version },
        { op: "update", key: i2.key, value: slashIdentity(i2.value as unknown as IdentityValue, "fraudulent affirmation") as unknown as JsonValue, expectVersion: i2.version },
        { op: "update", key: aDoc.key, value: CAP(600, 600, 0, 0) as unknown as JsonValue, expectVersion: aDoc.version },
        { op: "update", key: vDoc.key, value: CAP(700, 700, 0, 0) as unknown as JsonValue, expectVersion: vDoc.version },
      ],
    }),
  );
  rec.step("market-slash", "victim", "slash on a valid non-delivery proof", "committed=" + slash.committed);

  const net = attackerBalance(d).total - ATTACKER_START;
  rec.assert(
    "the slash commits because the fraud was provable",
    slash.committed === true,
    slash.policyResult?.reason ?? "",
  );
  rec.assert(
    "the attack becomes unprofitable: the attacker loses stake and value",
    net < 0,
    "attacker net " + net + " (started " + ATTACKER_START + ", ended " + attackerBalance(d).total + ")",
  );
  rec.assert(
    "the victim is made whole and then some",
    victimBalance(d).total > ESCROW_AMOUNT,
    "victim recovered " + victimBalance(d).total + " against a loss of " + ESCROW_AMOUNT,
  );
  rec.assert(
    "slashing removes the identities from future eligibility",
    !isEligible(identityOf(d.state, "sybil-1"), 0) && !isEligible(identityOf(d.state, "sybil-2"), 0),
    "both identities are SLASHED with zero stake",
  );

  return finalize({
    id: "019",
    name: "Slashing Makes Collusion Unprofitable",
    invariant: "open problem 5 - enforcement rather than pricing",
    prediction: "If the fraud is provable and the stake is seizable, a colluding attack will end at a net loss and the identities will be removed from eligibility.",
    scenario: "Run the attack, then let the victim present valid non-delivery proof and slash.",
    observed: "The slash committed under the dispute policy, the attacker finished below its starting balance, the victim recovered more than it lost, and both identities were burned.",
    classification: "SUPPORTED, conditionally: it works only because the domain could obtain a valid proof.",
    rec,
  });
}

// ---------------------------------------------------------------------------
// 020 - Slashing Fails When the Fraud Is Unprovable
// ---------------------------------------------------------------------------
export function case020(): ReviewCase {
  const rec = new Recorder();
  const t = clock();
  const strict = createVerifier({ trustedProducers: ["notary"] });

  const blind = market(rec, "market-blind", t.now, releasePolicy(100), strict);
  registerIdentity(blind, "sybil-1", 100);
  registerIdentity(blind, "sybil-2", 100);
  const attackBlind = attack(blind, ["sybil-1", "sybil-2"]);
  rec.step("market-blind", "attacker", "attack a provenance-blind threshold", "committed=" + attackBlind.result.committed);

  const checked = market(rec, "market-checked", t.now, releasePolicy(100, true), strict);
  registerIdentity(checked, "sybil-1", 100);
  registerIdentity(checked, "sybil-2", 100);
  const attackChecked = attack(checked, ["sybil-1", "sybil-2"]);
  rec.step("market-checked", "attacker", "attack a rule that checks provenance", "committed=" + attackChecked.result.committed + " failure=" + String(attackChecked.result.failure?.kind));

  const proof = blind.publishEvidence({
    kind: "non-delivery-proof",
    producer: "victim",
    domain: "market-blind",
    payload: { escrow: escrowKey, delivered: false } as JsonValue,
    issuedAt: 2,
  });
  const i1 = blind.document(identityKey("sybil-1"))!;
  const i2 = blind.document(identityKey("sybil-2"))!;
  const aDoc = blind.document(attackerKey)!;
  const vDoc = blind.document(victimKey)!;
  const slash = blind.propose(
    proposal({
      domain: "market-blind",
      actor: "victim",
      intent: "try to slash without a recognised proof",
      policy: "dispute",
      evidence: [proof.id],
      effects: [
        { op: "update", key: i1.key, value: slashIdentity(i1.value as unknown as IdentityValue, "fraud") as unknown as JsonValue, expectVersion: i1.version },
        { op: "update", key: i2.key, value: slashIdentity(i2.value as unknown as IdentityValue, "fraud") as unknown as JsonValue, expectVersion: i2.version },
        { op: "update", key: aDoc.key, value: CAP(600, 600, 0, 0) as unknown as JsonValue, expectVersion: aDoc.version },
        { op: "update", key: vDoc.key, value: CAP(700, 700, 0, 0) as unknown as JsonValue, expectVersion: vDoc.version },
      ],
    }),
  );
  rec.step("market-blind", "victim", "attempt to slash with unrecognised proof", "committed=" + slash.committed + " failure=" + String(slash.failure?.kind));

  rec.assert(
    "a provenance-blind threshold counts judgments the verifier would not accept",
    attackBlind.result.committed === true && strict.verify(blind.evidenceOfKind("decision")[0]) !== "VALID",
    "the judgments are UNVERIFIED yet the release committed",
  );
  rec.assert(
    "adding a provenance requirement to the same rule blocks the attack",
    attackChecked.result.committed === false,
    String(attackChecked.result.failure?.detail),
  );
  rec.assert(
    "the victim cannot slash, because the fraud is not provable to this verifier",
    slash.committed === false && slash.failure?.kind === "POLICY",
    String(slash.failure?.detail),
  );
  rec.assert(
    "so collusion still wins when the fraud is unprovable",
    attackerBalance(blind).total === ATTACKER_START + ESCROW_AMOUNT && isEligible(identityOf(blind.state, "sybil-1"), 100),
    "attacker kept " + attackerBalance(blind).total + " and its identities are intact",
  );

  return finalize({
    id: "020",
    name: "Slashing Fails When the Fraud Is Unprovable",
    invariant: "open problems 3 (Evidence Authenticity) and 5",
    prediction: "The same domain will apply a lenient trust standard to the attacker's judgments and a strict one to the victim's proof, so the attack will survive regardless of stake.",
    scenario: "Under a verifier that only trusts a notary, run the attack against a provenance-blind release rule and against one that checks provenance, then have the victim attempt to slash.",
    observed: "The provenance-blind rule accepted unidentified judgments, the provenance-checking rule blocked the identical attack, and the victim's proof was unrecognised so no slash was possible.",
    classification: "SUPPORTED. This is the binding result: the defence is provability, not identity cost. It is also a policy-authoring hazard, since the asymmetry is written by the same author.",
    rec,
  });
}
