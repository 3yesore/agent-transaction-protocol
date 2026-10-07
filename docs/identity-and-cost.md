# Identity and Cost

**Status:** extension model, with four executable experiments.

ATP does not define identity. This document records the minimal model built to
answer a narrower and more useful question:

> Does collusion actually win, and what would it cost to stop it?

Everything below is measured by `experiments/v0.2-review/cases-identity.ts`
(review cases 017-020). Every figure is read out of protocol state.

## The model

| Element | Representation |
|---------|----------------|
| Identity | State document `identity/<id>` with `controller`, `stake`, `status` |
| Cost | Stake, locked out of the controller's balance when the identity is registered |
| Eligibility | A pure predicate over State: `status === ACTIVE` and `stake >= minStake` |
| Recognition | Policy. `staked-decision-threshold` counts only eligible judges; `identity-staked` gates a single actor |

The model deliberately does **not** establish that two identifiers are two
principals. It only makes an identifier cost something. That is precisely the
variable under test.

## The market under attack

The victim holds 300 credit in escrow. Release requires two affirmative
judgments. The attacker controls no legitimate judge, so it creates its own.

## Result 1 - free identities win outright (017)

With a plain 2-of-N threshold and zero stake requirement, two attacker
identities release the escrow. The attacker's balance rises by the full 300, and
nothing is locked. Gross gain 300, cost 0.

**Identity without a cost is not a defence.** This is the baseline; it restates
review case 013 in economic terms.

## Result 2 - a stake prices the attack, but does not deter it (018)

With `minStake = 100` per judge, the attack still succeeds, but 200 credit is
now locked. Break-even stake per judge is `V / k = 300 / 2 = 150`.

- At 100 per judge: attack nets +300 gross against 200 at risk.
- At 200 per judge: the same identities are **ineligible**, and the release is
  rejected. Pricing the attack out works when the stake exceeds break-even.

The catch: registration is a **one-time** cost. Both identities remain ACTIVE
and eligible after the attack, so the marginal cost of the second attack is
zero. Over R repeated attacks against the same identities, amortised cost per
attack falls as `k * S / R` and tends to zero.

**Stake is a capital requirement, not a filter.** It raises the entry price and
does nothing about a well-capitalised or repeat attacker.

## Result 3 - slashing makes it unprofitable, when the fraud is provable (019)

If the victim can obtain a valid non-delivery proof, a dispute-policy transition
slashes both judges and reverses the transfer:

| | before slash | after slash |
|---|---|---|
| attacker total | 1300 | 600 |
| victim total | 0 | 700 |
| seizable stake | 200 | 0 |
| identity status | ACTIVE | SLASHED |

The attacker ends 400 below where it started, the victim recovers more than it
lost, and both identities are burned for future use.

This is the only configuration in which collusion loses. It works because the
domain could obtain a proof that its own verifier accepted.

## Result 4 - when the fraud is unprovable, collusion still wins (020)

Under a verifier that trusts only a notary, the same domain applies two
different standards to the same actors:

- the release rule `staked-decision-threshold` counts judgments **without**
  consulting the verifier, so unidentified judges are accepted;
- the dispute rule `evidence-required` **does** consult it, so the victim's
  proof is UNVERIFIED and the slash is rejected.

The attacker keeps all 300 and its identities are intact. Adding
`requireValid: true` to the release rule blocks the identical attack - the
defence exists and is one parameter away - but it does not help the victim,
because provability is still missing.

## What this establishes

1. **The binding constraint is provability, not identity cost.** Stake prices an
   attack; slashing only works against a fraud someone can prove. Provability is
   open problem 3 (Evidence Authenticity), which the kernel does not address.
2. **Cost alone is a tax.** One-time stake amortises to nothing over repeated
   attacks. Only per-decision cost or slashing changes the sign of the payoff.
3. **Slashing recurses.** The slash in case 019 was authorised by a dispute
   policy. Whoever judges the judges must themselves be trustworthy, so
   enforcement moves the trust problem up one level rather than removing it.
4. **Asymmetric trust standards are a policy-authoring hazard.** In case 020 the
   attacker benefits from a lenient rule and the victim is held to a strict one,
   both written by the same author. A deployment should require an explicit
   provenance standard on every rule that consumes judgments.

## Recommendation

Do not present a stake requirement as Sybil resistance. Present it as what it
is: a capital cost that makes some attacks uneconomic. Then state the two
preconditions that any enforcement claim depends on - a trusted witness able to
produce admissible evidence, and a policy that applies the same provenance
standard to every participant.
