# Evaluating a Judge

**Status:** framework implemented and run against two real models. Report: `experiments/results/judge-bench.md`.

## The wrong question

"How accurate is this judge?" is the wrong question for a transaction protocol.
ATP's failure modes are **asymmetric**:

- a wrong **AFFIRM** releases value, and per I7-I9 the protocol has no rollback;
- a wrong **DENY** withholds value from a rightful claimant, which delays but does
  not destroy;
- a failure to judge blocks the transition, which is safe but may be gamed.

So the quantity that matters is not the error rate but the **error direction**.
The benchmark leads with the false-affirm rate and computes an expected protocol
loss under an explicit cost model (release 1.00, deny 0.05, failure 0.10).

## Result 1 - same accuracy, twenty times the damage

Three judges, all constructed to 85% accuracy, differing only in which direction
they err, measured over a synthetic population of 2000 decisions:

| Judge | false AFFIRM | false DENY | expected loss |
|-------|--------------|------------|---------------|
| cautious (p=0, q=0.15) | 0.0% | 15.0% | 0.0036 |
| balanced (p=q=0.075) | 7.5% | 7.5% | 0.0423 |
| trigger-happy (p=0.15, q=0) | 15.0% | 0.0% | **0.0740** |

Identical accuracy, twenty times the expected loss. **Accuracy is not merely an
incomplete metric here, it is a misleading one**, because it treats the two
directions as interchangeable when the protocol does not.

## Result 2 - a quorum buys nothing unless the judges are independent

Three ways of forming a 2-of-3 majority, each judge independently at a 15%
false-affirm rate:

| Configuration | false AFFIRM | expected loss |
|---------------|--------------|---------------|
| one judge | 14.2% | 0.0750 |
| 2-of-3 **independent** | 6.1% | 0.0321 |
| 2-of-3 **correlated** (same model, same prompt, same materials) | 14.2% | 0.0750 |

Independent judges behave as theory predicts; correlated ones are
indistinguishable from a single judge. "Correlated" is the default in practice,
since a deployment will run three copies of the same model over the same
materials. **A threshold policy is not redundancy unless the judges are actually
independent** - the same conclusion as review case 013 and the collusion
experiments, reached from the other direction.

## Result 3 - the less accurate model is the better judge

Twelve authored scenarios; each judgment is then fed through a real one-judge
release policy, so the protocol outcome is measured too.

| Judge | accuracy | false AFFIRM | false DENY | Brier | expected loss | latency |
|-------|----------|--------------|------------|-------|---------------|---------|
| deterministic keyword judge | 25.0% | 9 | 0 | 0.438 | 0.3750 | 0 ms |
| qwen2.5:1.5b (general) | **83.3%** | 2 | 0 | 0.168 | 0.0833 | 3999 ms |
| **decision-4b (Jev-like)** | 81.8% | **1** | 1 | **0.071** | **0.0477** | **779 ms** |

The general model is **1.5 points more accurate and 43% worse on the metric that
matters**, with 2.4x worse calibration and one fifth of the throughput. Choosing
on accuracy alone would have picked the wrong judge.

Per-difficulty false affirmations:

| Judge | clear | ambiguous | adversarial |
|-------|-------|-----------|-------------|
| keyword judge | 3/5 | 3/4 | 3/3 |
| qwen2.5:1.5b | 2/5 | 0/4 | 0/3 |
| decision-4b | **0/5** | 1/4 | 0/3 |

The safety number is the clear column: on unambiguous cases the decision model
never wrongly released, and the general model twice did - on `hash-mismatch`
(a digest differing in one character) and `delivered-after-deadline`. Those are
**literal-comparison** failures, not reasoning failures. The decision model got
both right and instead failed on `revoked-signing-certificate` (a revocation
list in the materials) and, in the other direction, on `late-but-waived` (it
missed an amendment present in the materials).

That is a **capability profile** rather than a noise level, and it is what a
protocol needs to route on: a judge reliable on literal comparison but weak on
cross-referencing is safe for release gates and unsafe for exception handling.

## Result 4 - a real decision model does not fit the Decision schema

Decision-4B is trained to return **one letter and no explanation** - it is the
literal instruction in its model card. Run through the enforce point,
`decideFor`:

| rationale mode | outcome |
|----------------|---------|
| `none` - record what the model actually produces | **REFUSED**: "rationale must be at least 12 characters; a bare score is not an auditable judgment" |
| `restatement` - mechanically restate the choice and its probability | conforms |

So ATP cannot accept a purpose-built decision model's native output, and the
workaround that satisfies the schema is a **restatement of the choice, not a
reason for it**. The rationale rule is therefore **syntactic**: it rejects an
empty string and accepts a tautology.

This is a finding about ATP, not about the model. It means:

- `docs/decision-schema.md` overstates the guarantee. Requiring a rationale
  does not obtain a basis; it obtains a field.
- The dispute and reversal paths depend on a judgment having a basis. A
  restated score gives them nothing to work with when a decision is challenged.
- The honest options are to give score-only evidence its own kind and let Policy
  treat it as lower-trust, or to require a second, generative component to argue
  the case - which reintroduces the model ATP was trying to exclude.

The decision model does at least supply something a generative model does not:
**a real probability distribution over the options.** The transport recovers it
from `top_logprobs`, which is why decision-4b's Brier score is 0.071 against
0.168 for the general model. Confidence is the one part of the Decision schema a
decision model fills in better than an LLM.

## Framework self-check

`experiments/judge-bench/run.ts` asserts its own claims and exits non-zero if
any fail: equal accuracy across the constructed judges; loss monotone in the
false-affirm rate; a trigger-happy judge at least 5x worse; independent judges
cutting false releases by 25% or more; correlated judges within 2 points of a
single one; a real judge actually run; and both halves of the schema result
above.

The suite is hermetic: `test/judge-bench.test.ts` verifies the metric maths, the
PRNG determinism, the realised rates of the simulated judge, the quorum
behaviour, and that the benchmark drives the **real protocol** - an always-affirm
judge must actually release the escrow in every scenario.

## How to run

~~~bash
npm run bench
node experiments/judge-bench/run.ts qwen2.5:1.5b decision-4b:latest
~~~

## Caveat

The ground truth is **authored** against a written delivery specification, so
twelve scenarios measure agreement with a specification, not objective truth -
the same limit the protocol carries under I4. It is meaningful because the
specification is shown to the judge. Twelve scenarios is also a small sample: the
difference between 1 and 2 false affirmations is one scenario, and the loss
figures should be read as a demonstration of the method rather than as a
benchmark of either model.
