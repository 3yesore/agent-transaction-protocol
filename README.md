# Agent Transaction Protocol (ATP)

> A research project exploring a minimal, machine-native transaction protocol for autonomous agents.

[![CI](https://github.com/3yesore/agent-transaction-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/3yesore/agent-transaction-protocol/actions/workflows/ci.yml)

**Status:** Experimental / Research
**Frozen historical baseline:** ATP-0001 / Kernel v0.1 - `RFC/ATP-0001-kernel-baseline.md`, `SPEC-v0.1-historical.md`
**Current research version:** ATP-0002 / Kernel v0.2 (freeze) - `SPEC.md`, `RFC/ATP-0002-state-evolution-kernel.md`
**Intermediate candidate:** `SPEC-v0.2-candidate.md` - the four-primitive model that `kernel/` and `extensions/` implement

## Abstract

Agent systems can reason, plan, delegate, negotiate, execute work, consume services, and interact with other autonomous agents. Existing transaction models are largely designed around human-controlled accounts, predefined APIs, or monetary transfers.

ATP asks a narrower question:

> What is the smallest protocol kernel required for autonomous agents to interact through verifiable state transitions?

The v0.2 candidate reduces the kernel to four primitives:

~~~text
State
Transition
Policy
Evidence
~~~

`Decision` is no longer a primitive. It remains a first-class semantic, represented as a structured Evidence schema when judgment must be recorded. The candidate also sharpens the boundaries that v0.1 left implicit: authority is Domain-scoped, atomicity is Domain-scoped, conflict is not a block, failure is not rollback, and Policy is itself State.

## Design Principle

> **Agents are free outside protocol state; constraints apply to state transitions.**

An agent may reason, plan, invoke tools, execute code, delegate, negotiate, or coordinate without the protocol prescribing its internal process. But when an action changes protocol-recognized state, it must occur through an authorized transition.

## What ATP Is Not

ATP is not currently a blockchain, a cryptocurrency, an LLM framework, an agent runtime, a marketplace, a governance system, or a claim that AI judgment can prove truth. Currency, credit, reputation, markets, governance, and runtimes remain higher-level extensions unless an experiment shows the kernel cannot express the required behavior.

## Reference Implementation

A zero-dependency reference implementation of Kernel v0.2 in TypeScript, executed directly by Node 22.6+ with no build step.

~~~bash
npm test              # 40 tests: kernel, invariants, review, judge bench, reduction audit
npm run experiments   # regenerate experiments/results/v0.2-review.md
npm run bench         # judge benchmark -> experiments/results/judge-bench.md
npm run reduction     # kernel reduction audit -> experiments/results/reduction-audit.md
npm run verify        # experiments then tests
~~~

It enforces the ten v0.2 invariants, resolves Policy documents out of state, and gates policy amendment by the policy itself or by `policy/authority`. See `docs/implementation.md`, `docs/domain.md`, and `docs/policy-as-state.md`.

## Executable Adversarial Review

The sixteen review cases behind the v0.2 reduction were prose assertions, four identity and cost experiments, and three decision-provider cases have been added. All twenty-three are executable: each states a falsifiable prediction, runs it, and is REFUTED if an assertion fails.

| # | Case | Result | Tests |
|---|------|--------|-------|
| 001 | Cross-Agent Atomicity | coordination, not a kernel guarantee | I8 |
| 005 | Temporal Finality | an expired policy cannot reopen itself | I10 |
| 012 | Policy Evolution | amendment rules hold in all three directions | I10 |
| 013 | Evidence Recognition Capture | producer trust is part of the boundary | I2 / I5 |
| 015 | Decision Reduction | identical authorization without a primitive | I6 |
| 016 | Kernel Reduction | no case needed a fifth primitive | arity |
| 018 | Registration Stake | stake prices an attack but amortises away | problem 5 |
| 020 | Unprovable Fraud | collusion still wins when fraud cannot be proven | problems 3 / 5 |
| 021 | Decision Provider Conformance | a bare score or an invented option is refused | I6 |
| 023 | Model Failure Is Not Authority | confidence is recorded, never authoritative | I2 / I6 |

All twenty-three cases pass in `experiments/results/v0.2-review.md`. See `experiments/README-v0.2.md` for the full index and `docs/identity-and-cost.md` for the identity economics.

## ATP-0002 Conformance

Because the freeze's kernel is exactly one rule, a conformance suite for it is
five behavioural probes:

| Probe | Requirement it tests |
|-------|---------------------|
| P1 genesis | SPEC 2 - an initial semantic state |
| **P2 pre-state evaluation** | SPEC 4 - a semantic change is recognised under the semantics it replaces |
| P3 permitted evolution | SPEC 4 - semantics may evolve |
| P4 ordinary transition | SPEC 2 - the target is not rejecting everything |
| P5 determinism | SPEC 2 - the same state, input, context and successor have one verdict |

The suite ships a **test oracle and four mutants**, so a green run is meaningful:
the real `kernel/` implementation passes 5/5, an abstract control passes, and
each mutant fails exactly the probe it should - successor evaluation and
permissive semantics fail P2, refusing semantics fails P3 and P4, and a
history-dependent relation fails P5. No mutant conforms.

What this establishes is conformance to the one rule, not correctness. A target
can pass all five probes and still lose all your money. What it cannot do is pass
and then let a domain rewrite its own semantics. See `conformance/report.md`.

## Validator Quorum Under Correlated Failure

A chain's validators run the same client, so they fail together. This measures what a
quorum's safety actually depends on, with two error sources separated on purpose: a
shared cause that flips a whole client family, and independent noise.

**False acceptance is floored at the shared-cause rate.** At rho = 0.2, seven
same-family validators sit at 20.9% and thirty-one sit at 20.1% - validator count does
not move it. The floor is set by the **largest family**, not the number of families:
splitting seven validators at k=4 into 4+3 leaves the floor unchanged *and* makes it
measurably worse (20.9% to 28.4%), because a three-member cause plus one independent
flip now also reaches the threshold.

| rho | n=1 | n=3 (k=2) | n=5 (k=3) | n=7 (k=4) |
|-----|-----|-----------|-----------|-----------|
| 0.00 | 15.1% | 6.3% | 2.6% | 1.2% |
| 0.20 | 32.3% | 25.3% | 22.1% | 20.9% |
| 0.50 | 57.9% | 53.4% | 51.4% | 50.6% |

Design rules that fell out:

1. **No client family may hold at least as many validators as the threshold.**
2. The floor is a bound, not a prediction - tight only when one family can carry the
   threshold alone, loose where causes must combine.
3. Diversity de-correlates but does not reduce the marginal error rate,
   rho + (1-rho)p. At full diversity the residual is that rate's binomial tail.
4. Threshold is not a strictness parameter: unanimity quadruples false rejections for
   almost no safety gain at moderate correlation.
5. Diversity and size must be raised together. 5 diverse validators give 19.2%;
   35 diverse validators give 1.6%.

Consequence: **a chain's safety claim cannot come from ATP-0002 and cannot come from
validator count or stake. It comes from implementation diversity, which is an
ecosystem property.** See `docs/validator-quorum.md`.

## Semantic Amendment Under a Quorum

ATP-0002's one rule says an amendment must be authorised by the semantics it
replaces. On a chain that means a quorum selects it - and a semantic amendment is a
single, self-replacing, irreversible event, unlike the stream of object-level
transitions. Three asymmetries follow.

**Frequency.** A per-round shared cause is averaged away over a stream but not over
a handful of amendments. At rho = 0.2 there is a 50% chance of capturing an
amendment within four attempts and 99% within twenty-one. The same quorum with no
shared cause is immune by five orders of magnitude.

**Persistence.** An object-level bad state is corrected by a later transition under
unchanged rules, so it settles at p/(p+c) = 18.2%. A captured amendment *replaces*
the rules, so the correcting mechanism is gone. Bad rounds climb to 99% at N=400:
the same per-event rate costs five times the lifetime damage, growing with the
protocol's age.

**Divergence.** Diversity lowers the object-level floor and raises the chance that
implementations read the rules differently. At the meta level that is not a rejected
transition, it is two rule sets.

| implementations | object floor | P(meta fork) | loss @ severity 1 | loss @ severity 10 |
|-----------------|--------------|--------------|-------------------|--------------------|
| 1 | 20.0% | 2.0% | 0.220 | **0.400** |
| 5 | 5.8% | 9.6% | **0.154** | 1.018 |
| 35 | 0.0% | 50.7% | 0.507 | 5.067 |

The two risks move in opposite directions. The optimum is m=5 when a fork is cheap
and **m=1 once a fork is expensive** - which it should be, because it splits the
chain's common ground.

> A self-amending chain can have self-amendment or implementation diversity.
> It cannot have both.

That reframes the engineering problem: it is not the consensus mechanism. It is
reducing the shared-cause rate of one implementation, and designing an amendment
procedure unambiguous enough that independent readers cannot diverge on it. See
`docs/meta-consensus.md`.

## The Ambiguity Budget of an Amendment Specification

A specification does not have to be wrong to fork a chain. It only has to be silent.
So the amendment decision function is three-valued - valid, invalid,
**undetermined** - and `d`, the fraction it does not decide, is exactly where two
honest clients diverge.

Seven clauses take an authored corpus of 12 defective amendments from 91.7%
undetermined to 0%, without rejecting the conforming case:

| spec | clauses | undetermined | d |
|------|---------|--------------|---|
| minimal | 0 | 11 | 91.7% |
| + pre-state authorization | 1 | 8 | 66.7% |
| + precondition match | 2 | 7 | 58.3% |
| + closed vocabulary | 3 | 6 | 50.0% |
| + type checking | 4 | 5 | 41.7% |
| + reject unknown fields | 5 | 4 | 33.3% |
| + value range | 6 | 3 | 25.0% |
| + canonical encoding | 7 | **0** | **0.0%** |

Two findings matter more than the numbers.

**The kernel's own rule is an ambiguity class.** Under a specification that leaves
pre-state evaluation implicit, an amendment naming the *successor's* semantics as
its authoriser is not invalid - it is **undetermined**. The most important case in
the framework is undecided rather than forbidden. One clause closes it, along with
authorisation that is absent and authorisation that points somewhere unrelated.

**Encoding alone can fork a chain.** Three amendments with identical meaning and
different bytes - key order, duplicate key, whitespace - are all undetermined
without a canonical-encoding clause. Canonical encoding is part of the amendment
procedure, not a serialization preference.

This is the constructive counterpart to the meta-consensus result: it gives the
chain a design obligation rather than a hope. Publish the amendment procedure as a
total function over a canonical encoding, state pre-state evaluation explicitly,
and ship a conformance suite for it - then diversity is free again, because `d = 0`
is a property of the specification rather than a hope about implementers. See
`docs/amendment-ambiguity.md`.

## Current Normative State

The repository carries the **ATP-0002 freeze**, which reduces the kernel again,
from four primitives to two:

~~~text
D = (S0, R0)
R(S, X, C, S') -> valid / invalid
~~~

Policy and Evidence leave the kernel; `S0` and `R0` remain. See `SPEC.md`,
`RFC/ATP-0002-state-evolution-kernel.md`, `docs/kernel-reduction-research.md`,
and `docs/ATP-0002-stage-freeze.md`.

`kernel/` and `extensions/` implement the **intermediate candidate**, not the
freeze. Under the freeze that code is not superseded - it is one concrete `R`.
`docs/freeze-reconciliation.md` maps the two and lists five defects in the freeze
that should be fixed rather than silently patched.

## Kernel Reduction Audit

The obvious objection to a kernel of `D = (S0, R0)` is that it is empty, because
`R` is a free parameter. That is true by construction and refutes nothing. The
audit asks instead a question that can fail: is there a constraint that
constrains **which relation the kernel consults**, or **how many domains exist**,
rather than what any relation accepts?

Of the eight constraints the freeze states, six reduce to some `R`, one is a
permission, and two resist - for different reasons:

- **C5 (shared uniqueness)** is architectural: no local relation can observe
  another domain. The audit demonstrates this by showing that a domain's validity
  is invariant under arbitrary changes to the other domain's state.
- **C2 (semantic reflexivity)** is the kernel: it constrains which relation is
  consulted, and that choice is made above every relation. Hold the relations
  fixed and change only the kernel's evaluation rule; the same transition flips
  from rejected to accepted.

So the kernel is not empty. It is exactly one rule - **evaluate a transition under
the semantics in force before it** - plus a free relation. Everything else is
definition, permission, or architecture. `docs/kernel-reduction-audit.md`.

This is a smaller claim than the freeze makes, and a more useful one: it is
specific, executable, and it names the single thing that must not be changed
casually.

## Repository Structure

~~~text
.
├── README.md
├── SPEC.md                      Kernel v0.2 (ATP-0002 freeze)
├── SPEC-v0.1-historical.md      Kernel v0.1 (frozen baseline)
├── SPEC-v0.2-candidate.md       the four-primitive intermediate
├── protocol.json                ATP-0002 kernel manifest
├── protocol-v0.2-candidate.json
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── RFC/
│   ├── ATP-0001-kernel-baseline.md           frozen v0.1 baseline
│   ├── ATP-0002-state-evolution-kernel.md    the current kernel (freeze)
│   └── ATP-0003-cross-agent-coordination.md  extension protocol
├── docs/
│   ├── kernel-reduction-audit.md   the kernel is one rule, not eight constraints
│   ├── freeze-reconciliation.md    freeze <-> implementation, and five defects
│   ├── ATP-0002-stage-freeze.md    the frozen conclusions and next boundary
│   ├── kernel-reduction-research.md
│   ├── architecture.md
│   ├── evolution.md
│   ├── implementation.md        how the code maps to the candidate
│   ├── domain.md                State Domain, and what D is
│   ├── policy-as-state.md       the candidate's I10 representation
│   ├── decision-schema.md       Decision as an Evidence schema
│   ├── decision-provider.md     the seam between protocol state and an evaluator
│   ├── identity-and-cost.md     identity, stake, and what collusion costs
│   ├── judge-evaluation.md      why accuracy is the wrong metric for a judge
│   ├── validator-quorum.md      what a quorum's safety actually depends on
│   ├── meta-consensus.md        semantic amendment, and why it is worse
│   ├── amendment-ambiguity.md   what d = 0 would take, measured
│   ├── open-problems.md
│   └── history/                 superseded candidate-era documents
├── conformance/                 ATP-0002 conformance suite
│   ├── report.md                generated
│   ├── adapter.ts  probes.ts  targets.ts  run.ts
├── kernel/                      State, Transition, Policy, Evidence
├── extensions/                  capability, reservation, commitment, outcome, decision, identity
├── experiments/
│   ├── README.md
│   ├── README-v0.2.md           the review index
│   ├── harness.ts
│   ├── v0.2-review/             twenty-three executable cases
│   ├── judge-bench/             judge quality measured against protocol outcome
│   ├── reduction/               the freeze kernel as code, and the audit
│   ├── validator-quorum/        correlated validator failure
│   ├── meta-consensus/          semantic amendment under a quorum
│   ├── amendment-ambiguity/     the ambiguity budget of a specification
├── chain/                       single-writer chain skeleton and selectors
│   └── results/                 generated reports
├── proposals/
├── prompts/
├── test/
└── LICENSE
~~~

## Research Method

The candidate was produced by adversarial review, and the review is now executable. For every requirement:

1. Try to express it with the existing four primitives.
2. If it can be expressed, do not add a primitive.
3. If it cannot, test whether an extension schema is sufficient.
4. Only a demonstrated kernel insufficiency justifies a kernel revision.
5. Record the reasoning as an RFC, a proposal, or a review case.

Minimality is a method rule, not an invariant: it constrains this process rather than a ledger. Note that "can be expressed" is a low bar, so a review case is only accepted when it states a prediction that could fail.

## What the Kernel Does Not Guarantee

Given I7, I8, and I9 together, ATP does not guarantee that a Domain will avoid acting on contested or false evidence, that two Domains reach a consistent joint state, that external execution can be undone, or that distinct identifiers are distinct principals. It guarantees two things: state changes only through authorized transitions, and history is not silently rewritten. See `SPEC-v0.2-candidate.md` section 12.

## Contributing

The most useful contribution is not necessarily code. Counterexamples, adversarial scenarios, formal models, state-machine analyses, prototype implementations, security analyses, and concrete cases that the current kernel cannot represent are all welcome. Prefer a concrete failure case over a broad philosophical objection. See `CONTRIBUTING.md`.

## Status

ATP-0001 remains frozen. The v0.2 candidate is implemented and passes its executable review, but it is not yet a frozen baseline: it must survive another adversarial round, and it still has open problems with no experiment behind them - identity, privacy, cross-Domain time, and wire format. Breaking the candidate is considered productive research.
