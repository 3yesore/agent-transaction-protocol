# Experiment 001 - Cross-Agent Atomicity

**Status:** CONFIRMED (all assertions held)

## Problem

Two independently governed agents exchange value: A holds credit, B holds service capacity. A must pay and B must deliver, and a failure must not leave one side committed while the other is not.

## Actors

- agent-a (payer, sole authority over domain payer)
- agent-b (payee, sole authority over domain payee)
- judge-1 (decides whether a delivery receipt or a non-delivery observation supports settlement)

## Initial State

- payer: capability/A/credit = { total 100, available 100, reserved 0, consumed 0 }
- payee: capability/B/gpu-hour = { total 5, available 5, reserved 0, consumed 0 }
- no shared ledger, no shared clock, no cross-domain transaction

## Actions

1. Scenario 1: one-phase payment with a crash before delivery
2. Scenario 2: two-phase prepare where the payee cannot prepare and the payer's hold expires
3. Scenario 3: both sides prepared, the payee delivers, the payer crashes before settling, then recovery settles via a judge-affirmed receipt
4. Scenario 4: the payee never delivers and the payer compensates via a judge-affirmed non-delivery observation

## Expected Result

Determine whether the current kernel can represent an atomic exchange, and if not, whether an extension protocol using the five primitives restores a consistent state.

## Observed Result

One-phase exchange produced a locally valid but jointly inconsistent state (A consumed 100, no delivery). Two-phase preparation with expiry made prepare-phase failure safe. A crash between the two commit phases remained observable as a joint inconsistency, confirming the absence of cross-domain atomicity. Evidence -> Decision -> Policy -> Transition then settled the correct case and compensated the failed case, returning both domains to a consistent state with all history intact.

## Failure

- One-phase: A's 100 credit consumed with no delivery outcome and no protocol record linking the two domains.
- Commit-ordering crash: the payee consumed capacity while the payer's funds were still reserved, with no joint commit point.
- The kernel does not release an expired hold on its own; without a proposing actor the hold persists.

## Classification

EXTENSION (cross-agent coordination protocol) with one open KERNEL question. No precise impossibility was found for eventual consistency, so no new primitive is justified. Instantaneous cross-domain atomicity is a genuine semantic gap and stays an open problem.

## Proposed Change

Do not add a kernel primitive. Write an extension RFC for a two-phase reservation protocol (prepare with expiry, commit, release, compensate) driven by Evidence and Decision, and record 'cross-state transactions / instantaneous cross-domain atomicity' in docs/open-problems.md.

## Step Log

| # | Domain | Actor | Action | Result |
|---|--------|-------|--------|--------|
| 1 | payer-1 | agent-a | one-phase: pay 100 credit | true |
| 2 | payee-1 | agent-b | agent-b crashes before delivering | no transition proposed (payee ledger is empty) |
| 3 | payer-2 | agent-a | prepare: reserve 100 credit for C1 | committed=true |
| 4 | payee-2 | agent-b | prepare: reserve 99 gpu-hour against a 5 unit capability | committed=false failure=POLICY |
| 5 | payer-2 | agent-a | after expiry: release the unused hold | committed=true |
| 6 | payee-3 | agent-b | deliver service, consume capacity, record OUTCOME O1=PROVEN | committed=true evidence=sha256:9225289 |
| 7 | payer-3 | agent-a | CRASH between the two commit phases | no settlement transition |
| 8 | payer-3 | agent-a | recovery: settle against a judge-affirmed delivery receipt | committed=true |
| 9 | payer-4 | agent-a | recovery: release the hold after non-delivery | committed=true |

## Assertions

| Claim | Held | Detail |
|-------|------|--------|
| naive one-phase: the crashed payee recorded nothing | yes | payee-1 ledger length=0 |
| naive one-phase: both domains are internally consistent | yes | per-domain ledgers verify |
| naive one-phase: the joint state is inconsistent (A consumed 100, no delivery record) | yes | A.consumed=100, delivery outcome present=false |
| two-phase prepare failure is safe: an expired hold returns all funds | yes | during hold available=0 reserved=100 -> after release available=100 |
| insufficient-capability prepare is rejected by policy, not silently accepted | yes | insufficient available: 5 < 99 |
| commit-ordering crash leaves the joint state temporarily inconsistent | yes | payee consumed=1, payer reserved=100, payer consumed=0 |
| the v0.1 kernel offers no cross-domain transaction that would have made both commits atomic | yes | each transition is confined to exactly one domain; there is no joint commit |
| evidence + decision + policy restores eventual consistency after the crash | yes | payer consumed=100 (reserved 0) |
| the pre-crash hold is preserved in history rather than edited away | yes | ledger seq 1 still records reservation R1 as ACTIVE |
| non-delivery compensation returns the payer to a consistent state | yes | available=100 reserved=0 consumed=0 |

## Findings

### The kernel cannot make two independent domains commit atomically

**Classification:** KERNEL / open problem (do not add a primitive yet)

Every transition is confined to one domain, so a crash between the payee commit and the payer commit is observable as a joint inconsistency. The kernel's guarantee is intra-domain atomicity only. Instantaneous cross-domain atomicity is not expressible with State + Transition + Policy + Evidence + Decision, so it remains an open research problem (cross-state transactions).

### Two-phase reservation plus evidence-driven settlement achieves eventual consistency

**Classification:** EXTENSION

A prepare phase (reserve, with expiry) followed by a commit phase, and a compensation path driven by Evidence -> Decision -> Policy -> Transition, restores a consistent joint state without any new kernel primitive. This belongs in an extension RFC for cross-agent coordination.

### Expiry release is a liveness dependency on some actor proposing it

**Classification:** AGENT

A hold left ACTIVE is not released by the kernel on a timer; some agent or reaper must propose the release transition. This is an agent/environment liveness obligation, not a kernel correctness gap, and should be stated as such in any extension protocol.

## Invariant Checks

- payer-1: 1 transition(s), chain verified
- payee-1: 0 transition(s), chain verified
- payer-2: 2 transition(s), chain verified
- payee-2: 0 transition(s), chain verified
- payer-3: 2 transition(s), chain verified
- payee-3: 2 transition(s), chain verified
- payer-4: 2 transition(s), chain verified
- payee-4: 0 transition(s), chain verified
- no invariant violations across 8 domain(s)

## Conclusion

The v0.1 kernel supports safe cross-agent interaction, but only as eventual consistency through reservation and compensation; it does not provide atomic cross-domain commit. All 10 assertions held.
