# Experiments

This directory contains concrete experiments against the ATP kernel. They are
executable: each one builds domains, records its steps, and asserts what it
observes, so a wrong model fails the test suite instead of being described.

## How to Run

~~~
npm run experiments   # regenerate experiments/results/*.md
npm test              # includes the experiment assertions
~~~

## Required Experiment Format

Each experiment should contain:

~~~text
Problem
Actors
Initial State
Actions
Expected Result
Observed Result
Failure
Classification
Proposed Change
~~~

## Status

| Experiment | Source | Report | Classification |
|------------|--------|--------|----------------|
| 001 Cross-Agent Atomicity | [exp-001-cross-agent-atomicity.ts](./exp-001-cross-agent-atomicity.ts) | [result](./results/exp-001-cross-agent-atomicity.md) | EXTENSION + open kernel question |
| 003 Malicious Judge | [exp-003-malicious-judge.ts](./exp-003-malicious-judge.ts) | [result](./results/exp-003-malicious-judge.md) | AGENT + EXTENSION |
| 004 Over-Commitment | [exp-004-overcommitment.ts](./exp-004-overcommitment.ts) | [result](./results/exp-004-overcommitment.md) | EXTENSION (economic layer) |
| 005 Outcome Reversal | [exp-005-outcome-reversal.ts](./exp-005-outcome-reversal.ts) | [result](./results/exp-005-outcome-reversal.md) | kernel sufficient |

`results/SUMMARY.md` aggregates the run.

## Experiment 001 - Cross-Agent Atomicity

### Problem

Two independent agents exchange value:

~~~text
A pays B
B provides service to A
~~~

### Questions

- Can both sides be made atomic?
- What happens if A succeeds and B fails?
- What happens if B succeeds and A disappears?
- Can reservations solve the problem?
- Does this require a cross-state transaction primitive?
- Can a two-phase or conditional transition be represented using current primitives?
- What happens under network partition?

### Result

The experiment separates four scenarios and confirms:

- one-phase exchange produces a locally valid but jointly inconsistent state
- two-phase preparation with expiry makes prepare-phase failure safe
- a crash between the two commit phases is observable: no atomic cross-domain commit
- Evidence -> Decision -> Policy -> Transition restores eventual consistency by
  settlement or compensation

Classification: **EXTENSION** (coordination protocol, RFC/ATP-0002) with one open
**KERNEL** question (cross-state transactions, proposals/ATP-P0001).

## Experiment 002 - Jev Autonomous Agent

Treat Jev as an ordinary agent.

Test:

- commitment creation
- negotiation
- delegation
- evidence production
- outcome verification
- disputes
- resource reservation
- payment
- failure recovery

Record every point where the kernel becomes insufficient.

Status: **not yet implemented.** The kernel-level pieces it depends on
(commitment, reservation, outcome, dispute) now exist in `extensions/`, so it can
be written against real schemas.

## Experiment 003 - Malicious Judge

Test whether an agent or group of agents can manipulate judgment.

Scenarios:

- one malicious judge
- colluding judges
- false evidence
- contradictory evidence
- Sybil judges
- compromised oracle

Distinguish protocol correctness from semantic correctness.

### Result

A single judge and repeated ballots are rejected; two colluding identities
succeed. Well-formed false evidence is accepted while tampering is detected.
Classification: **AGENT** and **EXTENSION**, not kernel.

## Experiment 004 - Over-Commitment

Test:

~~~text
Capability = 100 units

C1 = 80
C2 = 60
~~~

Questions:

- Is over-commitment prohibited?
- Is it merely a risk-bearing state?
- Can Policy distinguish guaranteed from probabilistic commitments?
- Can collateral or reservation be represented without new primitives?

### Result

A guarded policy prohibits over-commitment with no state change; without the
guard the over-committed claim is ordinary state; a certainty-weighted policy
admits probabilistic claims. A resulting-state guard must be a policy over the
proposed effects, because preconditions only see the prior state.

## Experiment 005 - Outcome Reversal

Test:

~~~text
Outcome O1 = PROVEN
        ↓
new evidence
        ↓
O1 disputed
        ↓
new decision
        ↓
O2 supersedes O1
~~~

Verify that history remains intact.

### Result

O1 moves PROVEN -> DISPUTED -> SUPERSEDED, its original value remains in the
ledger, and O2 references the decision that justified the reversal. Classification:
**kernel sufficient**.

## Experiment Rule

Every experiment should attempt to break the current kernel before proposing
additions.
