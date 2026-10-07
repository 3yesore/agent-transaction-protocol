# v0.2 Adversarial Review Record

This file summarises the stress tests behind the v0.2 candidate reduction.

**Every row below is executable.** The table is generated from code that states
a falsifiable prediction per case and fails if the prediction does not hold:

~~~
npm run experiments      # writes experiments/results/v0.2-review.md
~~~

| # | Experiment | Result | Tests |
|---|---|---|---|
| 001 | Cross-Agent Atomicity | Atomicity is scoped to a State Domain; cross-domain atomicity is coordination. | I8 |
| 002 | Multi-Hop Irreversible Execution | Protocol State can be atomic while external execution is irreversible; failure does not imply rollback. | I9 |
| 003 | Commitment Dependency Graph | Failure propagation does not imply State rollback. | I9 |
| 004 | Delegation and Substitution | Execution may be delegated while liability remains unless explicitly transferred. | I1 |
| 005 | Temporal Finality | Finality is Policy/Domain scoped; an expired policy cannot reopen itself. | I10 |
| 006 | Concurrent Conflicting Transitions | Validity, compatibility and applicability are distinct; no global total ordering is needed. | I8 |
| 007 | Cross-Domain Resource Over-Commitment | Shared State is required only where a uniqueness invariant requires it. | I3 |
| 008 | Consensus Scope | Consensus is scoped and is not a global authority primitive. | I3 / I5 |
| 009 | Protocolized Disagreement | `CONFLICTED` can be State; conflict does not automatically mean Blocked. | I7 |
| 010 | Authority Without Global Root | Authority is Domain/Policy recognised and does not transfer across Domains. | I3 |
| 011 | Centralized and Decentralized Domains | Organisational form can remain a Policy choice. | neutrality |
| 012 | Policy Evolution | Policy is State and changes through authorised Transitions. | I10 |
| 013 | Evidence Recognition Capture | Producer trust is part of the authority boundary. | I2 / I5 |
| 014 | Exit and Portability | Exit does not erase history; portable history does not transfer authority. | I5 |
| 015 | Decision Reduction | Decision is semantically useful but is representable as structured Evidence. | I6 |
| 016 | Kernel Reduction | No reviewed case demonstrated a need for a fifth kernel primitive. | arity |
| 017 | Sybil Without Cost | Free identities satisfy a threshold at zero cost. | problem 5 |
| 018 | Registration Stake | Stake prices the attack; one-time registration amortises away. | problem 5 / 12 |
| 019 | Slashing | A provable fraud becomes unprofitable and the identities burn. | problem 5 |
| 020 | Unprovable Fraud | Collusion still wins; the defence is provability, not cost. | problems 3 / 5 |
| 021 | Decision Provider Conformance | A conforming model response becomes a Decision; a bare score and an invented conclusion are refused. | I6 |
| 022 | A Model Judgment in a Live Domain | A model judgment authorizes or blocks a transition; its rationale reaches state verbatim. | I6 |
| 023 | Model Failure Is Not Authority | An unconforming model leaves no Decision, so the transition is refused however confident it sounds. | I2 / I6 |

## Findings the prose version did not record

- **Case 005**: an expired policy cannot amend itself, because a policy in force
  is required to authorise its own replacement. `policy/authority` is the
  explicit bootstrap path. That is a fact about the design, not a bug.
- **Case 012**: making I10 meaningful needs three distinct rejections —
  amendment by an unrelated policy, fabrication of a new policy by transition,
  and a version-pin mismatch. All three hold.
- **Case 013**: the same policy **text** is capturable in one Domain and not in
  another, because the verifier's trusted-producer set is part of the authority
  boundary. That set is not State, and the candidate should say so explicitly.
- **Case 016**: the transition record carries no field for a fifth primitive and
  the kernel rule vocabulary contains no domain schema. The arity claim is now
  checked rather than asserted.
- **Cases 017-020**: collusion is now measured, not asserted. Stake prices an
  attack but amortises away over repeats, and slashing only works against a
  provable fraud. See docs/identity-and-cost.md for the numbers.
