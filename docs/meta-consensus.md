# Semantic Amendment Under a Quorum

**Status:** executed. Report: `experiments/results/meta-consensus.md`.
**Code:** `experiments/meta-consensus/`. **Tests:** `test/meta-consensus.test.ts`.

> Every table below is copied from @@experiments/results/meta-consensus.md@@, which is
> generated. If a number here disagrees with the report, the report is right.

## The question

ATP-0002's one rule is that a transition is evaluated under the semantics in force
**before** it. So an amendment `R0 -> R1` must be authorised by `R0`. On a chain
"authorised" means a quorum selects it. That raises a question the object level
does not have.

An object-level transition is one of a stream. A semantic amendment is a **single,
self-replacing, irreversible** event. Three asymmetries follow, and each is
measurable.

## 1. Frequency - the relevant quantity is lifetime capture

A per-round shared cause is averaged away over a stream. Over N amendments it is
not, because the question is whether it coincides with **any** of them:

~~~text
P(at least one capture) = 1 - (1 - p)^N
~~~

| amendments N | correlated (rho = 0.2) | independent (V=35, k=18, p=0.15) |
|--------------|------------------------|--------------------------------------|
| 1 | 20.0% | 0.0001% |
| 3 | 48.8% | 0.0002% |
| 5 | 67.2% | 0.0003% |
| 10 | 89.3% | 0.0005% |
| 21 | 99.1% | 0.0011% |
| 50 | 100.0% | 0.0025% |

**A shared cause that a streaming system averages away gives a 50% chance of
capturing an amendment within four attempts and 99% within twenty-one.** The chain
does not need the cause to persist; it only needs it to coincide. The same quorum
with no shared cause is effectively immune - five orders of magnitude apart.

## 2. Persistence - capture is absorbing

At the object level a bad state is reversible under unchanged rules, so it
converges on `p / (p + c) = 18.2%` and stays there however long the chain runs.
A captured amendment replaces the rules, so nothing in the new semantics is
obliged to offer a way back.

| N | object-level bad rounds | meta-level bad rounds | meta captures | ratio |
|---|-------------------------|-----------------------|---------------|-------|
| 10 | 17.9% | 64.4% | 89.3% | 3.6x |
| 50 | 18.2% | 92.1% | 100.0% | 5.1x |
| 100 | 18.2% | 96.0% | 100.0% | 5.3x |
| 400 | 18.2% | 99.0% | 100.0% | 5.4x |

**The same per-amendment capture rate costs about five times the lifetime damage,
and the gap grows with the protocol's age:** the object fraction is flat at 18.2%
while the meta fraction climbs toward 100%.

## 3. Divergence - diversity helps one risk and hurts the other

Diversity lowers the object-level floor because it de-correlates failures. It
raises the chance that implementations read `R0` differently, and at the meta
level a disagreement about the rules is not a rejected transition - it is **two
rule sets**:

~~~text
P(fork) = 1 - (1 - d)^m
~~~

35 validators, majority threshold, rho = 0.2, d = 2% per implementation.

| implementations m | family split | object floor | P(meta fork) | loss, severity 1 | loss, severity 10 |
|-------------------|--------------|--------------|--------------|------------------|-------------------|
| 1 | 35 | 20.0% | 2.0% | 0.220 | 0.400 |
| 2 | 18+17 | 20.0% | 4.0% | 0.240 | 0.600 |
| 3 | 12+12+11 | 10.4% | 5.9% | 0.163 | 0.694 |
| 5 | 7+7+7+7+7 | 5.8% | 9.6% | **0.154** | 1.018 |
| 7 | 5x7 | 3.3% | 13.2% | 0.165 | 1.350 |
| 12 | mostly 3 | 1.2% | 21.5% | 0.227 | 2.163 |
| 35 | 1x35 | 0.0% | 50.7% | 0.507 | 5.067 |

**The two risks move in opposite directions and there is no m that minimises
both.** The optimum depends on what a fork costs:

| fork severity | optimal implementations |
|---------------|-------------------------|
| 1 | 5 |
| 10 | 1 |
| 30 | 1 |

## The design conclusion

The weights above are explicit because the conclusion depends on them, and hiding
that would be dishonest. But the direction is unambiguous: **once a rule fork is
expensive - and it should be, because it splits the chain's common ground -
diversity becomes net-negative and the optimum is a single implementation.**

> A self-amending chain can have self-amendment or implementation diversity.
> It cannot have both.

That reframes the engineering problem. It is not the consensus mechanism. It is:

1. **reducing the shared-cause rate of one implementation**, since with m=1 the
   object-level floor is exactly that rate and nothing else moves it; and
2. **designing an amendment procedure unambiguous enough that independent readers
   cannot diverge on it**, which is what would let d fall and make diversity safe
   again.

## Relationship to the rest of the repository

This composes directly on `docs/validator-quorum.md`: the object-level floor and
the quorum behaviour come from that model. The new result is that the meta level
adds two things the object level does not have - an absorbing state and a fork
risk - and both get worse as the object level gets better.

## Falsifiers

- a quorum where a shared cause cannot coincide with an amendment, which would
  break the frequency result;
- a corrective mechanism that survives replacement of the rules, which would break
  the persistence result;
- an amendment procedure with d = 0 - unambiguous enough that independent readers
  cannot diverge - which would break the divergence trade-off and make diversity
  free again. **Addressed in @@docs/amendment-ambiguity.md@@**, which turns this
  falsifier into a measurement: a specification is three-valued, and the fraction
  it does not decide is d. Seven explicit clauses take an authored corpus from
  91.7% undetermined to 0%.
