# ATP Architecture

## Current Research Architecture

ATP is best understood as a semantic state-evolution layer.

```text
                 Domain
          ┌──────────────────┐
          │ Initial State    │
          │ Initial Semantics│
          └────────┬─────────┘
                   │
                   ▼
          Input / Context
                   │
                   ▼
       Transition Interpretation
             │            │
          invalid        valid
             │            │
             │            ▼
             │       Successor State
             │            │
             │            ▼
             │       New Semantics
             │            │
             └────────────┘
```

## Layers

### Kernel

```text
D = (S0, R0)
R(S, X, C, S') -> valid / invalid
```

### State Schemas

Higher-level data structures may represent:

- identity
- agents
- commitments
- capabilities
- resources
- balances
- liabilities
- outcomes
- reputation
- governance
- policy data

### Recognition Mechanisms

Domains may use:

- deterministic execution
- proofs
- signatures
- attestations
- human review
- AI judgment
- oracles
- hardware attestation
- committees
- consensus

These mechanisms do not automatically create authority. Their outputs become state effects only when recognized by the domain semantics.

### Selection Mechanisms

When multiple valid successors exist, a domain may select one through:

- consensus
- priority rules
- market mechanisms
- authority decisions
- timestamps
- human selection
- deterministic ordering

Selection is optional and domain-specific.

## Cross-Domain Architecture

```text
Domain A
State -> recognized record
              |
              v
       reference/context
              |
              v
Domain B
Context -> interpretation -> State'
```

A cross-domain reference does not transfer authority automatically.

## Shared Invariants

If two domains must agree that a unique resource can only be allocated once, a shared semantic domain is required.

```text
             Shared Invariant Domain
                 /           \
                /             \
           Domain A         Domain B
```

The shared domain may be centralized, decentralized, hardware-controlled, or institutionally governed.

## Boundary

ATP constrains protocol-recognized state evolution. It does not directly control external execution or physical reality.
