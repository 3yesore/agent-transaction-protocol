# Agent Transaction Protocol — Specification

**Version:** Kernel v0.1  
**Status:** Experimental Baseline

## 1. Scope

ATP defines a minimal protocol model for autonomous agents interacting through authoritative state.

The protocol does not prescribe:

- agent cognition
- model architecture
- execution environment
- tool usage
- negotiation strategy
- economic strategy
- identity technology
- consensus technology
- governance structure

It defines how protocol-recognized state can change.

## 2. Kernel

The current kernel contains five conceptual primitives:

1. State
2. Transition
3. Policy
4. Evidence
5. Decision

These are intentionally minimal.

### 2.1 State

State is the authoritative protocol-recognized condition at a point in the protocol history.

Examples of state schemas include:

- identity records
- capability allocation
- commitments
- balances
- ownership
- liabilities
- reservations
- outcomes
- reputation records

These schemas are not automatically kernel primitives.

A statement does not become authoritative merely because an agent asserts it.

It becomes protocol state through a valid state transition.

### 2.2 Transition

A Transition changes protocol state.

Abstractly:

```text
State_n + Transition → State_n+1
```

A transition should conceptually contain:

```text
actor
intent
preconditions
inputs
authorization
effects
```

The exact serialization is intentionally unspecified at v0.1.

A protocol-relevant state change MUST NOT occur through an untracked direct mutation.

### 2.3 Policy

Policy determines whether a proposed transition is authorized under current protocol rules.

Abstractly:

```text
Policy(State, Transition, Evidence?, Decision?) → ALLOW | REJECT
```

Policy is the authority boundary.

A Decision does not itself grant authority.

### 2.4 Evidence

Evidence is information presented to support a decision or transition.

Evidence may include:

- execution traces
- signed messages
- external observations
- measurements
- logs
- outputs
- attestations
- references to prior outcomes

Evidence is not equivalent to truth.

The protocol may determine whether evidence satisfies a specified verification process, but cannot assume that every evidence source is truthful.

### 2.5 Decision

Decision is a judgment over State and/or Evidence.

Examples:

- whether a deliverable satisfies a specification
- whether evidence is sufficient
- whether a dispute condition is met
- whether an outcome should be recognized

A Decision may be produced by:

- an agent
- a model
- a human
- a deterministic rule engine
- an oracle
- multiple judges

The protocol does not require a particular decision-maker.

Decision and authority are separate:

```text
Decision ≠ Authority
```

A Decision can become authoritative only when Policy permits a corresponding Transition.

## 3. Canonical Transaction Model

An Agent Transaction is:

> A policy-authorized state transition over protocol state, potentially mediated by evidence and judgment.

Canonical form:

```text
Agent
  ↓
proposes Transition
  ↓
State + Evidence
  ↓
Decision (optional)
  ↓
Policy
  ↓
Transition authorized?
  ↓
State'
```

## 4. Execution

Execution is outside the kernel.

An agent may:

- call an LLM
- call APIs
- run code
- use hardware
- delegate work
- negotiate with another agent
- use humans
- perform arbitrary internal planning

The protocol does not need to reproduce the execution process.

Instead, execution can produce Evidence and/or a resulting state transition.

## 5. Commitment

A Commitment is a higher-level state schema.

It represents an obligation or promise concerning future behavior or an outcome.

An accepted commitment MUST NOT be edited in place.

Changes are represented through new transitions.

Example:

```text
C1
A → B
deliver X before T
```

Amendment:

```text
C1
 ↓
Amendment C1.1
 ↓
new state
```

Cancellation is also a transition, not deletion.

## 6. Capability

Capability is a state schema representing an agent's ability or allocatable resource.

Capability may have:

```text
total
available
reserved
consumed
```

The protocol does not need to define every capability type.

Examples:

- GPU-hours
- API quota
- storage
- human review capacity
- data access
- execution authority

Over-commitment is a policy/economic question unless experiments demonstrate that capability accounting itself requires a kernel primitive.

## 7. Outcome

An Outcome is a protocol-recognized state representing the result of an execution or verification process.

It may reference:

```text
producer
specification
evidence
decision
verification status
provenance
timestamp
```

An Outcome is not metaphysical truth.

Possible verification states include:

```text
PROVEN
DISPROVEN
UNPROVEN
CONFLICTED
UNKNOWN
```

An outcome MUST NOT be silently deleted.

A later transition may supersede, invalidate, or dispute it while preserving history.

## 8. Settlement

Settlement is a class of state transitions that apply consequences to commitments, outcomes, balances, liabilities, ownership, or other state.

Settlement does not necessarily imply money.

Examples:

- releasing a reservation
- recognizing a completed commitment
- transferring an asset
- recording a liability
- paying currency
- returning collateral

## 9. Currency

Currency is a higher-level state schema.

A currency balance can be represented as state:

```text
balance
locked_balance
```

A payment is a state transition.

Credit, debt, collateral, futures, insurance, and markets are higher-level protocols.

The kernel does not require currency.

## 10. Identity

Identity is represented as state and interpreted through Policy.

ATP does not mandate:

- public-key identity
- DID
- account-based identity
- biometric identity
- human identity
- agent-specific identity technology

## 11. Disputes

A dispute is not a kernel primitive.

A typical dispute flow is:

```text
Existing State
    ↓
New Evidence
    ↓
Decision
    ↓
Policy
    ↓
Transition
    ↓
Revised State
```

History remains intact.

## 12. Finality

Finality means that under the protocol's rules, normal mechanisms can no longer produce an equally authoritative competing state transition.

Finality is protocol-specific.

It does not mean that the resulting state is philosophically or physically infallible.

## 13. Core Invariants

### I1 — No Direct State Mutation

All authoritative state changes occur through valid transitions.

### I2 — State Changes Are Traceable

A state change must be attributable to a transition and its relevant inputs.

### I3 — Decision Does Not Imply Authority

A judgment only has authority through Policy.

### I4 — Evidence Does Not Equal Truth

Evidence is an input to epistemic processes, not an automatic guarantee of truth.

### I5 — History Is Not Silently Deleted

Invalidation, reversal, amendment, and dispute create new state rather than rewriting history.

### I6 — Execution Is Not the Kernel

Internal execution remains outside the protocol unless an observable result becomes protocol state.

### I7 — Policy Defines Authority

The protocol boundary is determined by valid state transitions and the policy governing them.

### I8 — Minimality

A new primitive must not be added when existing primitives can express the behavior.

## 14. Evolution Rule

For any proposed feature:

```text
Requirement
    ↓
Can State + Transition express it?
    ↓
Can Policy express authorization?
    ↓
Can Evidence + Decision express required judgment?
    ↓
If yes → no new primitive
    ↓
If no → test extension-layer representation
    ↓
Only then → consider kernel revision
```

## 15. Baseline Position

The v0.1 kernel is a research hypothesis.

Its correctness is not assumed.

Its purpose is to be attacked.
