# Open Problems

Status of the problems listed in the README, with the current evidence for each. A problem is marked resolved only when an experiment demonstrates it, not when a design argues for it.

| # | Problem | Status | Evidence |
|---|---------|--------|----------|
| 1 | Cross-Agent Atomicity | Addressed as semantics; coordination open | review 001, RFC/ATP-0003 |
| 2 | Cross-State Transactions | Open kernel question, deferred | proposals/ATP-P0001 |
| 3 | Evidence Authenticity | Open | review 013 |
| 4 | Decision Authority | Partially addressed | review 015, docs/decision-schema.md |
| 5 | Sybil Resistance | Characterised, not solved | review 017-020, docs/identity-and-cost.md |
| 6 | Capability Fungibility | Open | extension accounting only |
| 7 | Temporal Semantics | Partially addressed; cross-Domain ordering open | review 005 |
| 8 | Dispute and Reversal | Addressed within a Domain | review 009 |
| 9 | Finality | Partially addressed | review 005 |
| 10 | Agent Failure and Disappearance | Partially addressed; liveness open | review 001 |
| 11 | Interoperability Between Domains | Portability addressed; wire format undefined | review 014 |
| 12 | **Identity** | Open; cost model implemented, distinctness unresolved | review 017-020 |
| 13 | **Privacy and Erasure** | Open, in direct tension with I4 | not addressed anywhere |
| 14 | **Interpreter and Verifier Provenance** | Partially addressed | docs/policy-as-state.md |

## 1. Cross-Agent Atomicity - addressed as semantics, coordination open

I8 states that atomicity is Domain-scoped, and review case 001 confirms it: each Domain stays internally atomic while a crash between two commit phases leaves a joint inconsistency. Recovery is eventual consistency through Evidence, Policy, and compensation (RFC/ATP-0003). Instantaneous atomicity is not provided and is not claimed.

## 2. Cross-State Transactions - open kernel question, deferred

No transition spans two Domains. proposals/ATP-P0001 records the failure case and the conditions under which a kernel revision would be justified. None has been demonstrated, so no primitive is proposed.

## 3. Evidence Authenticity - open

Content addressing detects tampering after publication. It cannot detect a false claim in a well-formed record. Review case 013 shows that the same policy text is capturable or not depending on the verifier's trusted-producer set, which means authenticity is a configuration concern, not a kernel property.

## 4. Decision Authority - partially addressed

The Decision schema now requires `rationale`, `evidence_basis`, and `policy_context`, so an evaluator that can only return a score cannot produce a conforming Decision. That bounds the problem; it does not solve who is eligible to judge.

## 5. Sybil Resistance - characterised, not solved

Four experiments now measure this rather than asserting it (docs/identity-and-cost.md):

- free identities win outright (017);
- a stake requirement prices the attack and blocks it above break-even, but registration is one-time so the cost amortises away (018);
- slashing makes a **provable** fraud lose (019);
- an unprovable fraud still wins, with stake and all (020).

The binding constraint is provability, not identity cost. See problem 3.

## 6. Capability Fungibility - open

Capability accounting with conservation exists, and `capability-conserved-effect` prevents negative or non-conserved values. Whether one unit of capability A is exchangeable for one unit of capability B is undefined.

## 7. Temporal Semantics - partially addressed

Policy documents carry `validFrom` and `validUntil`, the `time-window` rule tests an injected clock, and review case 005 shows an expired policy rejecting transitions and refusing to reopen itself. There is still no ordering guarantee between two independent Domains.

## 8. Dispute and Reversal - addressed within a Domain

Review case 009: `CONFLICTED` is ordinary state, does not block further transitions, and does not mutate the disputed record. Cross-Domain disputes reduce to problem 2.

## 9. Finality - partially addressed

Finality is a Policy window (review case 005). There is no rule that closes a state against competing transitions beyond expiring the policy that governs it.

## 10. Agent Failure and Disappearance - partially addressed, liveness open

Case 001 shows a disappearing counterparty does not destroy value because holds expire and compensation is expressible. But release requires some actor to propose it: the kernel has no timers. Any extension protocol must name that actor.

## 11. Interoperability Between Domains - portability addressed, wire format undefined

Review case 014 confirms that history is portable by content address and that authority is not, requiring destination recognition. Serialization of transitions and policies is still unspecified, so two independent implementations cannot yet be checked for agreement.

## 12. Identity - open; cost model implemented, distinctness unresolved

I3 and I5 quantify over a claimant, but the kernel does not define one. The extension model in extensions/identity.ts makes a claimant cost something, which is enough to price attacks and to hang eligibility rules on. It does not establish that two identifiers are two principals, and no amount of stake does. This remains the top dependency for the strength of I3 and I5.

## 13. Privacy and Erasure - open, in direct tension with I4

I4 forbids silently rewriting history, and there is no delete effect. A data-protection regime may require erasure. The candidate does not address this at all, and the tension is structural rather than incidental. The minimum honest fix is an explicit scope statement: ATP is not intended for state subject to erasure obligations, or an extension must define commitment-plus-selective-disclosure.

## 14. Interpreter and Verifier Provenance - partially addressed

Policy **documents** are state and their versions are recorded, so policy provenance is now auditable. The rule **vocabulary**, the interpreter, and the verifier's trust set are code and are not in the ledger. Review case 013 makes that boundary concrete.

## Resolved by expression, not by a new primitive

- **Resulting-state invariants.** A precondition sees the prior state; a rule over `context.proposal.effects` sees the result. No postcondition primitive is needed.
- **Over-commitment.** Prohibition, pricing, and collateralization are policy and economic choices over claim state.
- **Policy evolution.** I10 with the representation in docs/policy-as-state.md; no Governance primitive.
- **Organizational form.** Centralized and plurality Domains authorize through the same pipeline (review case 011).
- **Decision.** Removed from the kernel and kept as an Evidence schema, with identical authorization outcomes (review case 015).
