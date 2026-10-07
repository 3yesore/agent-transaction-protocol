# Agent Transaction Protocol — Specification

**Version:** Kernel v0.2 Candidate  
**Status:** Experimental / Review Candidate  
**Supersedes:** None; v0.1 remains frozen

## 1. Scope

ATP defines a minimal protocol model for autonomous agents interacting through authoritative state.

The protocol does not prescribe agent cognition, model architecture, execution environment, negotiation strategy, economic strategy, identity technology, consensus technology, or organizational form.

Its kernel concerns how protocol-recognized state changes and how authority over those changes is established.

## 2. Candidate Kernel

The v0.2 candidate kernel contains four primitives:

1. State
2. Transition
3. Policy
4. Evidence

`Decision` is intentionally removed as a kernel primitive. It remains a first-class protocol semantic represented as an Evidence schema when explicit judgment must be recorded.

### 2.0 State Domain (a defined term, not a primitive)

Three invariants below quantify over a "State Domain" (I3, I5, I8), so the term is defined rather than assumed.

A State Domain is the scope of one authority and atomicity boundary: one authoritative state space, one append-only transition ledger, one policy store keyed `policy/<id>`, and one rule vocabulary in force. A transition is confined to exactly one Domain.

A Domain is not an organisation, not a cryptographic trust boundary, and not a consensus group. It is the name for the scope the kernel's invariants already required. Promoting it to a primitive would add no expressive power, which the review rule in section 1 forbids. See `docs/domain.md`.

### 2.1 State

State is the authoritative protocol-recognized condition at a point in protocol history.

State may contain higher-level schemas such as commitments, capabilities, outcomes, balances, liabilities, reservations, authority claims, or disputes.

A claim does not become authoritative merely because an agent asserts it. It becomes authoritative only through a valid State Transition recognized under applicable Policy.

### 2.2 Transition

A Transition changes protocol State.

```text
State_n + Transition -> State_n+1
```

Any protocol-relevant change affecting rights, obligations, assets, capabilities, or risk MUST appear as a verifiable State Transition.

### 2.3 Policy

Policy defines the conditions under which a proposed Transition is authorized.

Conceptually:

```text
Policy(State, Transition, Evidence*) -> authorization / rejection
```

Policy is the authority boundary.

Policy itself is part of State. A Policy change therefore requires an authorized State Transition under the Policy applicable to that change.

#### 2.3.1 Representation

For I10 to be more than a declaration, a Policy must be represented as state:

- the rule vocabulary is interpreter code and is fixed; a transition cannot extend it;
- a policy document is stored at `policy/<id>`, and its state version is the authoritative policy version because that version advances only through an authorized transition;
- a policy may be amended only by **itself** under a version pin, or by the reserved `policy/authority` meta-policy, and it can never be created by a bare transition;
- a proposal names a policy id and may pin `expectedVersion`, but supplies **no parameters**, so a proposer cannot weaken its own gate.

Two consequences follow, and both should be stated rather than discovered:

1. an expired or revoked policy cannot authorize its own replacement; recovery requires `policy/authority`;
2. authority is circular at the Domain root by construction.

See `docs/policy-as-state.md`.

### 2.4 Evidence

Evidence is information presented to support interpretation of State or authorization of a Transition.

Evidence may include observations, measurements, execution traces, attestations, signed statements, outputs, references, or judgments.

Evidence is not Truth and has no authority by itself. Its effect is determined by the applicable Policy.

## 3. Decision as Protocol Semantic

A Decision remains necessary as a semantic concept but is not a kernel primitive.

A Decision is a structured judgment represented as Evidence, for example:

```text
Decision {
  evaluator
  conclusion
  evidence_basis
  policy_context
  timestamp
}
```

The protocol may distinguish Decision from ordinary Evidence at the schema level because provenance, evaluator identity, conclusion, and judgment context can matter.

The critical invariant is:

```text
Decision != Authority
```

A Decision cannot authorize a State Transition independently of Policy.

#### 3.1 Attachment

Because a Decision is Evidence, it reaches Policy as an input:

- **Addressed**: the evidence's `about` field equals the proposal hash. The Domain gathers every such record automatically, so a proposer cannot omit a judgment aimed at it.
- **Referenced**: the proposal lists the evidence id. Note that a proposal's hash covers its own evidence list, so referencing a judgment that is addressed to that hash is circular. Prefer the addressed form.

The Decision schema requires a `rationale`. An evaluator that can only return a score produces a lower-trust evidence kind, not a Decision. See `docs/decision-schema.md`.

Thus a judgment-mediated path is:

```text
State + Evidence
      |
      v
 Decision (Evidence schema)
      |
      v
    Policy
      |
      v
 Transition
      |
      v
    State'
```

A deterministic path remains:

```text
State -> Policy -> Transition -> State'
```

## 4. Core Invariants

### I1 — State Transition Authority

No State Transition affecting protocol-recognized rights, obligations, assets, capabilities, or risk may occur without authorization under applicable Policy.

### I2 — Evidence Non-Authority

Evidence does not possess authority by itself. Policy determines the effect of Evidence.

### I3 — Domain-Scoped Authority

Authority recognized by one State Domain does not automatically extend to another State Domain.

### I4 — Historical Integrity

Past protocol State and Transition history MUST NOT be silently rewritten. Dispute, supersession, invalidation, reversal, amendment, and compensation are represented by new transitions.

### I5 — Local Recognition

Evidence, Authority claims, Outcomes, and other protocol claims originating in one Domain acquire effect in another Domain only through recognition under the destination Domain's Policy.

### I6 — Judgment Is Not Authority

A Decision may be represented as Evidence, but cannot authorize a Transition independently of Policy.

### I7 — Conflict Is Not Automatically a Block

A conflict between protocol-recognized claims does not itself determine whether further transitions are allowed. Policy determines the consequence of conflict.

### I8 — Atomicity Is Domain-Scoped

Atomicity applies only within the State Domain whose Policy defines the atomic transition boundary. Cross-domain atomicity is a coordination property and is not implied by the kernel.

### I9 — Failure Does Not Imply Rollback

Failure of external execution does not require rollback of prior protocol State. Failure may instead become Evidence and lead to new Outcomes and Settlement transitions.

### I10 — Policy Is State

Policy is itself protocol State and can evolve only through an authorized State Transition.

The representation is given in 2.3.1. I10 is mechanically checkable: for every committed transition that touches a policy document, the authorizing policy must be that document itself or `policy/authority`, and the recorded policy version must equal the document's **pre-state** version. The reference implementation checks exactly this.

*Note on minimality.* Kernel v0.1 carried minimality as invariant I8. v0.2 treats it as the review method rule in section 1 rather than as an invariant, because it constrains the specification process rather than a ledger. It is not dropped by omission.

## 5. Cross-Domain Model

A State Domain owns the authority to interpret its own State under its own Policy.

A generic cross-domain interaction is:

```text
Domain X State Transition
          |
          v
       Evidence          (a judgment is Evidence of kind "decision")
          |
          v
Domain Y Policy          (recognises it, or does not)
          |
          v
Domain Y Transition
          |
          v
     Domain Y State'
```

The judgment is an input to the receiving Domain's Policy, not a stage after it. This ordering is the one given in section 3; an earlier draft of this section placed Decision after Policy, which contradicted section 3 and would be incoherent once Decision is Evidence.

Evidence from X is not automatically globally authoritative.

Likewise:

```text
Authority_X(A) != Authority_Y(A)
```

unless Y explicitly recognizes the relevant authority under its Policy.

## 6. Consensus and Organizational Form

Consensus is not a kernel primitive.

A Policy may be implemented or maintained through a single administrator, committee, BFT mechanism, PoW mechanism, market, AI judge, human process, or other coordination mechanism.

ATP is neutral toward centralized and decentralized organizational forms.

Centralization is a domain-local Policy choice; decentralization is not a mandatory kernel property.

## 7. Conflict and Epistemic Status

The protocol may represent statuses such as:

```text
PROVEN
DISPROVEN
UNPROVEN
CONFLICTED
UNKNOWN
```

These are State schemas or higher-level semantic statuses, not kernel primitives.

`CONFLICTED` means that, under the relevant Evidence and Policy context, competing claims cannot currently be uniquely recognized. It does not itself mean `BLOCKED` and does not establish objective Truth.

## 8. Atomicity and External Execution

Protocol State Transitions may be atomic within their State Domain even when the external execution that produced the relevant Evidence is not rollbackable.

Therefore:

```text
Failure propagation != State rollback
```

A failed execution can be recorded through new State rather than erasing history.

## 9. Higher-Level Schemas

The following remain above the kernel unless future experiments demonstrate a kernel insufficiency:

- Decision
- Commitment
- Capability
- Outcome
- Reservation
- Settlement
- Currency
- Reputation
- Credit
- Market
- Governance
- Authority claims
- Conflict status
- Transaction / transaction graph
- Consensus
- Execution

## 10. Transaction Semantics

The term `Agent Transaction` is a higher-level semantic description rather than a required kernel object.

At the kernel level, the protocol operates on State Transitions.

A transaction may therefore be represented as a collection or graph of State Transitions plus coordination relationships.

## 11. Evolution Boundary

ATP does not guarantee that an ecosystem remains decentralized.

The stronger evolution principle is:

> Convergence may occur, but protocol semantics should not make future divergence, exit, migration, or alternative Policy recognition impossible in principle.

This is an evolution principle, not currently a kernel invariant.

ATP cannot guarantee that an independent competitor or alternative Domain will possess real-world resources. Protocol-level formal autonomy does not create external resources.

## 12. What the Kernel Does Not Guarantee

Each invariant above is defensible on its own. Their conjunction should be stated plainly, because it bounds what a deployment may assume.

Given I7 (conflict is not an automatic block), I8 (atomicity is Domain-scoped), and I9 (failure does not imply rollback), the kernel does **not** guarantee that:

- a Domain will not act on contested claims;
- a Domain will not act on false but well-formed evidence;
- two Domains will reach a consistent joint state;
- an external execution can be undone;
- authority remains stable over time;
- distinct identifiers denote distinct principals.

The kernel guarantees two things:

1. protocol-recognised state changes only through a transition authorised under the applicable Policy;
2. history is not silently rewritten.

Everything else — safety against wrong or contested information, atomicity across Domains, Sybil resistance, and organisational durability — belongs to a deployment's Policy, its verifier configuration, and the surrounding institutions. ATP is a coordination substrate, not a safety system.
