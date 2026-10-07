# Experiment 005 - Outcome Reversal

**Status:** CONFIRMED (all assertions held)

## Problem

An outcome is first recognized as PROVEN, then new evidence contradicts it. Determine whether the kernel can represent the reversal while keeping history intact.

## Actors

- verifier-1 (produced both the original and the contradicting evidence)
- judge-1 (decides the dispute)

## Initial State

- verification domain with no outcome state
- evidence e1 = spec satisfied, e2 = spec violated

## Actions

1. Record O1 = PROVEN with evidence e1
2. Publish a decision on the contradicting evidence and dispute O1
3. Create O2 = DISPROVEN referencing e2 and the decision, and mark O1 SUPERSEDED

## Expected Result

The reversal must be expressible as new transitions, with no silent mutation or deletion of the original record.

## Observed Result

O1 moved PROVEN -> DISPUTED -> SUPERSEDED, gained a supersededBy pointer, and its original PROVEN value remained in the ledger; O2 carried the DISPROVEN status and the decision reference.

## Failure

- none observed

## Classification

NONE for this scenario: the kernel represents dispute and reversal without additions.

## Proposed Change

No change. Use this as the reference pattern for reversal in any extension protocol.

## Step Log

| # | Domain | Actor | Action | Result |
|---|--------|-------|--------|--------|
| 1 | verification | verifier-1 | record OUTCOME O1 = PROVEN | committed=true |
| 2 | verification | judge-1 | dispute O1 with new evidence | committed=true decision=sha256:b90b8 |
| 3 | verification | verifier-1 | supersede O1 with O2 = DISPROVEN | committed=true |

## Assertions

| Claim | Held | Detail |
|-------|------|--------|
| O1 still exists after being disputed and superseded | yes | no deletion occurred |
| O1 records its supersession rather than losing its history | yes | {"status":"SUPERSEDED","supersededBy":"O2"} |
| the original PROVEN value remains addressable in the ledger | yes | ledger seq 1 still reads PROVEN |
| the successor outcome carries the reversal and the decision that justified it | yes | {"status":"DISPROVEN","supersedes":"O1"} |
| reversal produced new transitions, not mutations of prior records | yes | ledger length=3 |
| the whole domain still verifies after reversal | yes | hash chain and replayed state agree |

## Findings

### Outcome reversal is fully expressible in the v0.1 kernel

**Classification:** NONE (kernel sufficient)

Dispute and supersession are ordinary transitions. The predecessor keeps its state key, gains a supersededBy pointer, and its original value stays in the ledger, satisfying invariant I5 without any new primitive. Only the question of who may reverse an outcome (Decision Authority) remains open.

## Invariant Checks

- verification: 3 transition(s), chain verified
- no invariant violations across 1 domain(s)

## Conclusion

History-preserving reversal works with State + Transition + Policy + Evidence + Decision alone. All 6 assertions held.
