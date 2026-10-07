# Experiment 003 - Malicious Judge

**Status:** CONFIRMED (all assertions held)

## Problem

An agent or group of agents attempts to manipulate judgment: one malicious judge, colluding judges, false evidence, contradictory evidence, and repeated ballots.

## Actors

- agent-b (seeks recognition of outcome O1)
- judge-1..3 (authorized judges)
- judge-x, judge-y (colluding identities held by one operator)

## Initial State

- court domains with no outcome state
- policy judgment(threshold 2) over an allowed judge set, and judgment-with-evidence(threshold 1, minValidEvidence 1)
- a content-addressed verifier that reports VALID / INVALID / UNVERIFIED

## Actions

1. A: one judge affirms a 2-of-3 threshold
2. B: two colluding identities affirm
3. C: a well-formed but false evidence record supports an affirmation, then the record is tampered with
4. D: one judge publishes five AFFIRM decisions

## Expected Result

Separate protocol correctness (authority is enforced) from semantic correctness (whether the judged claim is true).

## Observed Result

A single judge and repeated ballots were rejected; two colluding identities succeeded; well-formed false evidence was accepted while tampering was detected as INVALID.

## Failure

- A 2-of-N threshold was satisfied by two ids controlled by one operator (Sybil / collusion).
- Policy admitted false evidence because provenance was valid; truth is out of scope for the kernel.

## Classification

AGENT and EXTENSION issues, not kernel issues. Authority is enforced correctly; the residual problems are identity, judge selection, and evidence authenticity.

## Proposed Change

No kernel change. Add extension guidance on judge eligibility, per-evidence-kind trust, and stake/identity requirements; track Sybil Resistance, Evidence Authenticity, and Decision Authority as open problems.

## Step Log

| # | Domain | Actor | Action | Result |
|---|--------|-------|--------|--------|
| 1 | court-a | judge-1 | single judge affirms against a 2-of-3 threshold | committed=false failure=POLICY |
| 2 | court-b | judge-x, judge-y | two colluding identities affirm | committed=true |
| 3 | court-c | judge-x | affirm using well-formed false evidence | committed=true |
| 4 | court-d | judge-1 | publishes five AFFIRM decisions | committed=false failure=POLICY |

## Assertions

| Claim | Held | Detail |
|-------|------|--------|
| a single malicious judge cannot reach a 2-of-3 threshold | yes | judgment requires 2 affirm(s), found 1 (deny 0, abstain 0) |
| two colluding judge identities satisfy a 2-of-N threshold | yes | judgment threshold met (2/2) |
| a false but well-formed evidence record verifies as VALID | yes | verification checks provenance and integrity, never truth (invariant I4) |
| policy admits well-formed false evidence | yes | judgment threshold met (1/1) |
| tampering is detectable even though truth is not | yes | content address mismatch -> INVALID |
| repeated ballots from one judge identity count once | yes | judgment requires 2 affirm(s), found 1 (deny 0, abstain 0) |

## Findings

### Distinct judge identities are not distinct principals

**Classification:** AGENT + EXTENSION (identity, judge selection)

A threshold policy counts distinct judge ids, so an attacker holding several ids reaches any threshold. Policy can constrain who may judge and how many, but cannot establish that two ids are two independent principals. Sybil resistance and judge selection belong in an extension protocol (and are listed as open problems).

### Verification bounds tampering, not lying

**Classification:** KERNEL boundary (I4) / open problem: Evidence Authenticity

Evidence supports a decision only up to the credibility of its source. The protocol can detect that a record was altered after publication, but it cannot decide that a truthful-looking record is false. Any system built on ATP must state who is trusted for which evidence kinds.

### Policy is the authority boundary even under adversarial decisions

**Classification:** EXTENSION

Decisions are inert inputs. A malicious judge cannot change state directly; it must still pass Policy, which can require a threshold, restrict judges, and demand valid evidence. This is the intended effect of Decision != Authority.

## Invariant Checks

- court-a: 0 transition(s), chain verified
- court-b: 1 transition(s), chain verified
- court-c: 1 transition(s), chain verified
- court-d: 0 transition(s), chain verified
- no invariant violations across 4 domain(s)

## Conclusion

The kernel keeps Decision separate from Authority and the policy boundary held in every scenario. What it cannot do is decide who is a real principal or whether evidence is true; those stay outside the kernel as extension and open research problems. All 6 assertions held.
