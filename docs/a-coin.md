# A-Coin

**Status:** implemented extension schema. Report: `experiments/results/a-coin.md`.
**Code:** `extensions/coin.ts`, `experiments/a-coin/`. **Tests:** `test/a-coin.test.ts`.

> Every number below is copied from the generated report. If a number here
> disagrees with the report, the report is right.

## What it is

A-Coin is the protocol framework's own unit of account: a higher-level **state
schema**, not a kernel primitive, exactly as the freeze requires. Currency is on
the freeze's list of things the kernel does not need.

What matters about it is not the schema - a balance is a number - but the invariant
it carries:

> **The total supply is a shared uniqueness invariant.**

## Conservation, enforced twice

Two mechanisms, because they catch different mistakes:

| Mechanism | Catches |
|-----------|---------|
| `coin-supply-preserving-effect` policy rule | a transfer that creates or destroys value |
| `checkCoinSupply` ledger invariant | issuance through a policy that was not allowed to issue |

The policy rule computes the supply delta across the accounts the proposal touches
and refuses a non-zero result. It also refuses a transition that touches **no**
coin account at all, so a coin policy cannot authorise an unrelated transition as
a loophole.

The invariant replays the ledger and requires supply to be exactly
`genesis + issued - burned`, where issuance and redemption are recognised only in
transitions authorised by the `mint` or `burn` policy. Issuance under any other
policy is reported as a **leak** and fails the check.

## Result 1 - conservation inside a domain

Genesis 100 AC to alice:

| transition | committed | supply |
|------------|-----------|--------|
| genesis | - | 100.00 AC |
| pay 40 alice to bob | yes | 100.00 AC |
| escrow 50 from alice | yes | 100.00 AC |
| settle 50 out of existence under the pay policy | **no** | 100.00 AC |

Alice ends at balance 10, locked 50. The settle attempt is refused with "supply
would change by -50 AC across 1 account(s); issuance requires the mint policy".

## Result 2 - issuance is explicit and auditable

| attempt | actor | committed |
|---------|-------|-----------|
| issue 60 AC | treasury | yes |
| issue 60 more | treasury | **no** - "supply would reach 120 AC, above the cap of 100" |
| issue 10 AC | mallory | **no** - "actor mallory is not in [treasury]" |

The ledger invariant then reports genesis 0 + issued 60 = 60 exactly.

**A note on the cap.** The first version of `coin-supply-at-most` asked "is the
current supply below the limit?" and therefore cheerfully authorised going from 60
to 120 against a cap of 100. A bound on an outcome has to be evaluated on the
outcome. This is the same class of mistake as a precondition that cannot see its
own effects, and the test suite now guards it directly.

## Result 3 - the shared-invariant result

The **same mint policy text**, evaluated in two independent domains and in one
shared domain:

| domain | first issue | second issue | agent-x holds |
|--------|-------------|--------------|---------------|
| domain-left | 100 AC | - | 100.00 AC |
| domain-right | 100 AC | - | 100.00 AC |
| domain-shared | 100 AC | **refused** | 100.00 AC |

Both independent ledgers satisfy their own supply invariant, and agent-x appears to
hold 200 AC while the intended supply is 100. Neither domain can see the other, so
neither is wrong.

This is the freeze's principle instantiated by the currency:

> A shared uniqueness invariant requires a shared semantic domain.

**A-Coin is therefore the reason to build the chain.** Every other schema in this
repository - commitments, capabilities, outcomes, identities - works fine inside
one domain. The supply does not.

## Result 4 - A-Coin as the measurement unit

Every rate this repository measures becomes a figure in A-Coin once it is attached
to value at risk. Escrow 300 AC per decision, cost model release 1.00 / deny 0.05 /
failure 0.10. Rates are copied from `experiments/results/validator-quorum.md` and
`experiments/results/judge-bench.md`.

| configuration | false AFFIRM | expected loss per decision |
|---------------|--------------|----------------------------|
| one validator, correlated at rho=0.2 | 32.3% | **48.45 AC** |
| 3 validators k=2, correlated | 25.3% | **37.95 AC** |
| 7 validators k=4, correlated | 20.9% | **31.35 AC** |
| 3 validators k=2, independent | 6.3% | **9.45 AC** |
| qwen2.5:1.5b as judge | 16.7% | **25.00 AC** |
| decision-4b as judge | 8.3% | **12.50 AC** |

The purpose-built decision model costs 12.50 AC per decision against 31.35 AC for
a seven-validator correlated quorum, and independence beats correlation at the same
quorum size (9.45 AC against 37.95 AC). Nothing new is measured here; what changes
is that the whole repository's results are now legible in one unit.

This is the role the currency was asked to play: not a feature to ship, but the
instrument that makes the other measurements comparable.

## What it does not do

- It does not price anything. There is no fee model, no market, no exchange rate.
- It does not create consensus. The supply invariant is *checkable* by a shared
  domain; making one exist is what the chain is for.
- It is not a kernel primitive, and the freeze's own rule forbids promoting it
  without a demonstrated inability to express the behaviour. Nothing here
  demonstrates that.
