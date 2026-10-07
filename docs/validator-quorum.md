# Validator Quorum Under Correlated Failure

**Status:** executed. Report: `experiments/results/validator-quorum.md`.
**Code:** `experiments/validator-quorum/`. **Tests:** `test/validator-quorum.test.ts`.

## Why this exists

ATP-0002 says selection over valid successors is a domain-level mechanism and says
nothing about whether it is safe. Any chain built on ATP inherits that silence, so
the chain's safety claim has to come from somewhere else. This is the experiment
that finds out where.

## The model

A validator runs `R(S, X, C, S')` and votes. Two error sources, separated on
purpose:

- a **shared cause** that hits a client family and flips every member - a bug in
  the shared client, an ambiguous rule, a coordinated input;
- **independent noise** at 15% per validator.

With one family a shared cause hits everybody. With several families the cause
must hit enough of them at once. Ground truth is 50/50 valid and invalid, and
**false accept** is the dangerous direction because in ATP-0002 selection is not
rolled back.

## Result 1 - false acceptance is floored at the shared-cause rate

| rho | n=1 | n=3 (k=2) | n=5 (k=3) | n=7 (k=4) |
|-----|-----|-----------|-----------|-----------|
| 0.00 | 15.1% | 6.3% | 2.6% | 1.2% |
| 0.10 | 23.8% | 15.8% | 12.4% | 11.0% |
| 0.20 | 32.3% | 25.3% | 22.1% | 20.9% |
| 0.50 | 57.9% | 53.4% | 51.4% | 50.6% |

P(false accept) >= rho held for all 24 configurations. At rho = 0.5 a seven-validator
quorum is indistinguishable from one validator.

Note also that 2-of-3 buys about **2.4x**, not orders of magnitude. The closed form
is `3p^2(1-p) + p^3`, and quorum intuition usually overstates it.

## Result 2 - the floor is set by the largest family

This refuted the experiment's own first hypothesis. Seven validators at k=4:

| families | split | max family | >= k? | P(false accept) | floor |
|----------|-------|------------|-------|-----------------|-------|
| 1 | 7 | 7 | yes | 20.9% | 20.0% |
| 2 | 4+3 | 4 | yes | **28.4%** | 20.0% |
| 3 | 3+2+2 | 3 | no | 21.7% | 10.4% |
| 5 | 2+2+1+1+1 | 2 | no | 19.0% | 7.3% |
| 7 | 1x7 | 1 | no | 15.5% | 3.3% |

Splitting into 4+3 **does not move the floor at all**, because a four-member family
is still one shared cause away from the threshold - and the split is *measurably
worse*, because a three-member cause plus one independent flip now also reaches k.

> **Design rule: no client family may hold at least as many validators as the
> threshold.**

## Result 3 - the floor is a bound, not a prediction

35 validators at k=18, rho = 0.2:

| families | max family | P(false accept) | floor | gap |
|----------|------------|-----------------|-------|-----|
| 1 | 35 | 19.9% | 20.0% | -0.1 |
| 5 | 7 | 13.7% | 5.8% | +7.9 |
| 7 | 5 | 10.9% | 3.3% | +7.6 |
| 35 | 1 | 1.6% | 0.0% | +1.6 |

The floor is tight only when one family can carry the threshold by itself. Where
causes must combine, independent noise fills the shortfall: at five families two
causes give 14 votes and four more have to come from noise.

## Result 4 - diversity de-correlates but does not reduce the marginal error

At full diversity the floor is zero and the residual is not. Every validator still
carries its own family's shared cause, so the marginal error rate is
`rho + (1 - rho) p = 32%`, and reaching 18 of 35 is a binomial tail: **1.6%
measured against 1.3% predicted from that tail alone**.

Diversity and a low shared-cause rate are two separate requirements. Diversity is
not a substitute for making the client correct.

## Result 5 - threshold is not a strictness parameter

| rho | k=1 | k=2 | k=3 (unanimous) |
|-----|-----|-----|-----------------|
| 0.00 | 39.2% | 6.3% | 0.4% |
| 0.30 | 57.2% | 34.2% | 30.1% |

Unanimity is far safer than majority when validators are independent, buys almost
nothing at rho = 0.3, and quadruples false rejections (6.2% to 39.2%). A strictness
dial that does not buy strictness while costing liveness is worse than useless.

## Result 6 - validator count saturates; diversity does not substitute for size either

Single-family quorums at rho = 0.2: n=7 gives 20.9%, n=15 gives 20.2%, n=31 gives
20.1%. The floor does not move. But a *small* diverse quorum is also near the floor:
n=5 across five families gives 19.2%. Diversity and size must be raised together -
n=35 across 35 families reaches 1.6%.

## The boundary result for ATP

The freeze is right that selection is not a kernel property, so none of this is the
kernel's fault. The consequence runs the other way:

> **A chain's safety claim cannot come from ATP-0002, and it cannot come from
> validator count or stake. It comes from implementation diversity, which is an
> ecosystem property.**

A chain that ships one client has a safety floor equal to its shared-cause rate, and
no number of validator slots or staked tokens moves it.
