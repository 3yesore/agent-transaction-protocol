# ATP Architecture

## 1. Layering

ATP should be understood as a protocol kernel plus extension layers.

```text
┌─────────────────────────────────────┐
│ Applications / Agent Economies      │
├─────────────────────────────────────┤
│ Markets / Credit / Governance       │
├─────────────────────────────────────┤
│ Commitment / Capability / Outcome   │
│ Settlement / Currency               │
├─────────────────────────────────────┤
│ ATP Kernel                           │
│ State / Transition / Policy         │
│ Evidence / Decision                 │
└─────────────────────────────────────┘
```

The lower layer should not absorb semantics that can safely remain above it.

## 2. Agent Boundary

```text
┌──────────── Agent ─────────────┐
│ reasoning                      │
│ planning                       │
│ memory                         │
│ tools                          │
│ execution                      │
│ negotiation                    │
└──────────────┬─────────────────┘
               │ proposes / observes
               ▼
┌────────── ATP Protocol ──────────┐
│ State                            │
│ Transition                       │
│ Policy                           │
│ Evidence                         │
│ Decision                         │
└──────────────────────────────────┘
```

The agent controls its internal process.

The protocol controls what becomes authoritative state.

## 3. Commitment Graph

A higher-level application can model:

```text
A
│
C1
│
B
├── C2 → C
└── C3 → D
```

The graph is represented through state and transitions.

A commitment may be:

- created
- accepted
- reserved
- delegated
- split
- amended
- canceled
- fulfilled
- disputed
- settled

These are state-transition patterns rather than mandatory kernel primitives.

## 4. Work Graph

A useful application-level flow is:

```text
Commitment
    ↓
Execution
    ↓
Evidence
    ↓
Decision
    ↓
Outcome
    ↓
Settlement
    ↓
New Commitment
```

Execution remains outside the kernel.

## 5. Economic Layer

Currency is optional.

An agent economy may instead exchange:

- data
- compute
- API access
- verification
- labor
- capabilities
- future commitments

Currency can act as:

- unit of account
- settlement medium
- collateral
- capital
- pricing reference

These are higher-level protocols.

## 6. Epistemic Boundary

ATP explicitly distinguishes:

```text
Evidence ≠ Truth
Decision ≠ Authority
Outcome ≠ Metaphysical Truth
```

This distinction is fundamental.

The protocol can record what its rules recognize without claiming that the protocol has solved objective truth.
