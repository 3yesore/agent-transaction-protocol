# Open Problems

This file tracks the open problems listed in README.md, with the current
evidence for each. A problem is marked **resolved** only when an experiment
demonstrates it, not when a design argues for it.

| # | Problem | Status | Evidence |
|---|---------|--------|----------|
| 1 | Cross-Agent Atomicity | Open | experiments/results/exp-001-cross-agent-atomicity.md |
| 2 | Cross-State Transactions | Open (kernel question) | experiments/results/exp-001-cross-agent-atomicity.md |
| 3 | Evidence Authenticity | Open | experiments/results/exp-003-malicious-judge.md |
| 4 | Decision Authority | Partially addressed | exp-003, exp-005 |
| 5 | Sybil Resistance | Open | experiments/results/exp-003-malicious-judge.md |
| 6 | Capability Fungibility | Open | exp-004 (accounting only) |
| 7 | Temporal Semantics | Partially addressed | exp-001 (expiry), exp-004 (deadlines) |
| 8 | Dispute and Reversal Semantics | Addressed within one domain | experiments/results/exp-005-outcome-reversal.md |
| 9 | Finality Across Dependent Agents | Open | - |
| 10 | Agent Failure and Disappearance | Partially addressed | exp-001 |
| 11 | Interoperability Between ATP Domains | Open | content-addressed evidence is a starting point |

## 1. Cross-Agent Atomicity - Open

A two-phase reservation with expiry, plus an evidence-driven settlement and
compensation path, restores a *consistent* joint state after a crash. It does not
provide *instantaneous* atomicity: a crash between the two commit phases is
observable. See Experiment 001.

Next step: state the required delivery semantics precisely (atomic, or eventual
with bounded compensation), then show whether an extension coordinator satisfies
them.

## 2. Cross-State Transactions - Open (kernel question)

No transition in the reference implementation spans two domains. Instantaneous
cross-domain atomicity is therefore unavailable by construction. This is recorded
as a kernel question in proposals/ATP-P0001-cross-state-transactions.md, and no
primitive is proposed until a requirement is shown that cannot accept eventual
consistency.

## 3. Evidence Authenticity - Open

Content addressing detects post-publication tampering. It cannot detect a false
claim made by a well-formed record. Experiment 003 shows a false but structurally
valid evidence record verifying as VALID.

Next step: define a per-evidence-kind trust model as an extension schema.

## 4. Decision Authority - Partially Addressed

Policy bounds who may decide (allowed judge set), how many must agree
(threshold), and what evidence must exist. It cannot establish that a judge is
honest or independent. Experiment 005 shows outcome reversal working when the
authority is known.

## 5. Sybil Resistance - Open

Two ids controlled by one operator satisfied a 2-of-N threshold (Experiment 003).
Distinct judge ids are deduplicated, but identity is not proof of independence.

## 6. Capability Fungibility - Open

Experiment 004 implements capability accounting with conservation, over-commit
guards, and certainty-weighted claims. Whether one unit of capability A is
exchangeable for one unit of capability B is undefined, and no experiment has
forced the question.

## 7. Temporal Semantics - Partially Addressed

Clocks are injected; reservations carry expiries and commitments carry deadlines.
There is no ordering guarantee across domains and no protocol-level notion of
"before" between two independent ledgers.

## 8. Dispute and Reversal Semantics - Addressed within one domain

Experiment 005: an outcome moves PROVEN to DISPUTED to SUPERSEDED, the successor
references the decision that justified it, and the original value stays in the
ledger. Cross-domain disputes remain open, because they reduce to problem 2.

## 9. Finality Across Dependent Agents - Open

Finality is not modelled. A domain can always accept another transition. There is
no rule that closes a state against competing transitions.

## 10. Agent Failure and Disappearance - Partially Addressed

Reservations expire and can be released, and compensation is expressible, so a
disappearing counterparty does not destroy value. But release requires some actor
to propose it: the kernel has no timers (Experiment 001, third finding). This is a
liveness obligation that any extension protocol must state.

## 11. Interoperability Between ATP Domains - Open

Evidence is content-addressed and can be republished identically in another
domain, which makes cross-domain evidence references possible today. Shared
policy registries, shared verifiers, and cross-domain transitions are undefined.

## Resolved by expression, not by a new primitive

- **Resulting-state invariants.** A named precondition sees the prior state; a
  policy over `context.proposal.effects` sees the result and can reject it.
  Demonstrated in Experiment 004. No postcondition primitive is needed.
- **Over-commitment.** Prohibition, pricing, and collateralization are policy and
  economic choices over claim state, not kernel semantics. Experiment 004.
