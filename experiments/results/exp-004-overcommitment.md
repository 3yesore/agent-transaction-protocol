# Experiment 004 - Over-Commitment

**Status:** CONFIRMED (all assertions held)

## Problem

A capability of 100 units is claimed twice: C1 claims 80 and C2 claims 60. Determine whether over-commitment is prohibited by the kernel, merely a risk-bearing state, or expressible through Policy.

## Actors

- agent-a (claimant C1)
- agent-b (claimant C2)
- agent-c (probabilistic claimant)

## Initial State

- capability/C/unit = { total 100, available 100, reserved 0, consumed 0 }
- no claim state

## Actions

1. Record C1 = 80 guaranteed units under an over-commit guard
2. Attempt C2 = 60 guaranteed units under the guard, then repeat with the guard disabled
3. In a second domain, record a guaranteed claim of 80 and a probabilistic claim of 20 at certainty 0.5 under a certainty-weighted guard

## Expected Result

Determine whether prohibiting over-commitment requires a kernel primitive, or whether Policy and an extension schema suffice.

## Observed Result

The guard rejected the second guaranteed claim with no state change, the capability stayed conserved, the unguarded attempt committed as ordinary state, and the certainty-weighted guard admitted the probabilistic claim.

## Failure

- Without a guard the domains hold 140 units of guaranteed claims against 100 units of capacity (a risk-bearing state, not an inconsistency).

## Classification

EXTENSION / economic layer. No kernel limitation demonstrated.

## Proposed Change

No kernel change. Document over-commitment as a policy concern in the extension layer, and express collateral or reservation with the same State + Transition + Policy pattern.

## Step Log

| # | Domain | Actor | Action | Result |
|---|--------|-------|--------|--------|
| 1 | capacity-1 | agent-a | claim 80 of 100 guaranteed units | committed=true |
| 2 | capacity-1 | agent-b | claim 60 guaranteed units (guarded) | committed=false failure=POLICY |
| 3 | capacity-1 | agent-a | attempt a capability write that breaks conservation | committed=false failure=POLICY |
| 4 | capacity-1 | agent-b | same claim with the guard disabled | committed=true |
| 5 | capacity-2 | agent-c | claim 20 units at certainty 0.5 (weighted by the guard) | committed=true |

## Assertions

| Claim | Held | Detail |
|-------|------|--------|
| a guarded policy prohibits over-commitment | yes | over-commitment: projected 140 > total 100 |
| the rejected claim leaves capability accounting conserved and untouched | yes | {"unit":"unit","total":100,"available":100,"reserved":0,"consumed":0} |
| a resulting-state invariant is enforced by policy over the proposed effects | yes | effect on capability/C/unit would break conservation: not conserved: available+reserved+consumed !== total |
| without a guard the kernel accepts the over-committed claim as ordinary state | yes | guaranteed claims total 140 against a capability of 100 |
| probabilistic commitments are expressible with a certainty-weighted policy | yes | guaranteed 80 + expected 10 = 90 <= 100 |

## Findings

### Preconditions guard the prior state; policy guards the resulting state

**Classification:** EXTENSION (schema/policy pattern)

Named preconditions are evaluated against the current snapshot, so they cannot by themselves prevent a transition from writing an inconsistent value. The capability-conserved-effect policy inspects context.proposal.effects and rejects it, which is expressible with Policy alone. No postcondition primitive is justified.

### Over-commitment is a policy choice, not a kernel primitive

**Classification:** EXTENSION / economic layer

The kernel records claims and capability state consistently; whether 140 units of guaranteed claims against 100 units of capacity is allowed is an economic decision expressed by Policy. No new primitive is needed to prohibit, price, or collateralize over-commitment.

### Guaranteed and probabilistic commitments need no new primitive

**Classification:** EXTENSION

A certainty field plus a policy that weights expected value distinguishes guaranteed from probabilistic commitments. Policy can also refuse probability altogether by only counting certainty === 1.

## Invariant Checks

- capacity-1: 2 transition(s), chain verified
- capacity-2: 2 transition(s), chain verified
- no invariant violations across 2 domain(s)

## Conclusion

Capability accounting needs only conservation; the decision to permit, price, or prohibit over-commitment is Policy. All 5 assertions held.
