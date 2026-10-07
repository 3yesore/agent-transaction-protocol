# ATP Reference Implementation

**Status:** experimental reference implementation of Kernel v0.1
**Runtime:** Node.js 22.6 or newer. TypeScript is executed directly by Node with type stripping, so there are **zero runtime dependencies** and no build step.

## 1. Purpose

SPEC.md defines the kernel; this implementation exists to make its claims
falsifiable. It is deliberately small: it enforces the eight invariants, exposes
the five primitives as ordinary data structures, and provides a place for the
experiments to fail.

The implementation does not attempt to be a production protocol stack. It has no
network layer, no consensus, no cryptography beyond content hashing, and no
cross-domain transactions.

## 2. Layout

~~~
kernel/          the five primitives and their enforcement
  json.ts        canonical JSON (sorted keys) and sha256 content addressing
  types.ts       State, Transition, Policy, Evidence, Decision as data
  state.ts       snapshots, preconditions, atomic effect application
  evidence.ts    content-addressed evidence and the verifier boundary
  decision.ts    judgment records, indexed by subject
  policy.ts      policy combinators and the policy registry
  ledger.ts      append-only hash-chained transition records
  domain.ts      the propose -> authorize -> apply -> append pipeline
  invariants.ts  I1-I8 runtime report
extensions/      higher-level schemas (not kernel primitives)
  capability.ts  capability accounting with conservation
  reservation.ts two-phase holds over a resource
  commitment.ts  obligations and history-preserving amendments
  outcome.ts     outcomes, dispute, supersession
  index.ts       standard policy and precondition registries
experiments/     adversarial experiments and generated reports
test/            node:test suites
~~~

## 3. Transaction Pipeline

Every state change goes through `Domain.propose`. The order is fixed and is
visible in the ledger:

1. **Shape** - the proposal is structurally valid.
2. **Domain** - the proposal targets this domain.
3. **Replay guard** - the proposal id has not already committed.
4. **Evidence** - every referenced evidence id resolves to a published record.
5. **Decisions** - decisions whose subject equals the proposal hash are gathered.
6. **Policy** - the registered policy is rehydrated from `{ id, params }` and evaluated.
7. **Preconditions** - evaluated against the current snapshot.
8. **Effects** - applied into a copy. All effects land or none do.
9. **Append** - exactly one transition record is hash-chained onto the ledger.

A rejected proposal appends nothing to the ledger. Rejections are retained in a
separate, non-authoritative `attempts` log so that an operator can see what was
refused and why.

## 4. Primitive Mapping

| SPEC concept | Module | Representation |
|--------------|--------|----------------|
| State | `kernel/state.ts` | immutable snapshot of keyed documents with monotonic versions |
| Transition | `kernel/types.ts` | a proposal (actor, intent, policy ref, preconditions, effects) plus a committed record |
| Policy | `kernel/policy.ts` | a function of `PolicyContext` returning ALLOW or REJECT, referenced by `{ id, params }` |
| Evidence | `kernel/evidence.ts` | content-addressed record; verifier returns VALID / INVALID / UNVERIFIED |
| Decision | `kernel/decision.ts` | content-addressed judgment about a subject hash |

## 5. Design Decisions

### 5.1 Canonical JSON and content addressing

`canonicalize` sorts object keys, drops `undefined`, and rejects non-finite
numbers. Evidence, decisions, proposals, and transition records are all hashed
with this function, so any later edit changes the address and is detectable.

### 5.2 One ledger per domain

A `Domain` is one independently governed state space. This forces the
cross-agent question into the open: there is no object in the codebase that can
commit two domains at once, which is precisely the limitation Experiment 001
measures.

### 5.3 Compare-and-swap instead of mutation

An `update` effect must carry the version it expects. A stale writer is
rejected with `VERSION` rather than overwriting a concurrent change. This is
also, in effect, a lightweight optimistic-concurrency mechanism.

### 5.4 No delete effect

There is no `delete` operation in the effect union. Invalidation, reversal,
amendment, and dispute are all expressed as new values or new keys. Invariant I5
is therefore structural rather than a convention.

### 5.5 transitioId versus record hash

`transitionId` is computable before the effects are applied (it covers domain,
sequence, previous hash, and proposal hash), so documents can name the
transition that wrote them. The record hash additionally covers the resulting
state hash.

### 5.6 Preconditions guard the prior state; policy guards the result

Named preconditions are evaluated against the current snapshot. A guard on the
*result* of a transition must be a policy that inspects
`context.proposal.effects`. Experiment 004 demonstrates both forms. This is an
extension-layer pattern, not a kernel gap.

### 5.7 Decisions are a directory keyed by subject

Decisions are published once and gathered by the proposal hash they judge. A
proposal does not embed its judges, which is what makes thresholds, vetoes, and
duplicate-ballot suppression testable.

### 5.8 Evidence verification is three-valued

A verifier may say INVALID, UNVERIFIED, or VALID. Unknown provenance is
UNVERIFIED, never INVALID, because "unknown source" and "false claim" are
different statements. The API has no way to return truth.

## 6. What Is Deliberately Omitted

- networking, transport, and message ordering
- signatures and key management (the signature field exists but is not verified cryptographically)
- consensus and finality
- cross-domain transactions
- agent runtimes, planning, or execution (invariant I6)

## 7. Running

~~~
npm test          # node --test over kernel, invariant, and experiment suites
npm run experiments   # regenerates experiments/results/*.md
npm run verify        # experiments then tests
~~~

## 8. Known Deviations and Limits

- **Effect ordering is significant.** Effects apply in array order; a later
  effect can update a key created by an earlier effect in the same proposal.
- **The attempts log is not hash-chained.** It is diagnostic, not authoritative.
- **Evidence is not cryptographically signed.** Integrity comes from content
  addressing only, which detects tampering after publication but not forgery at
  publication.
- **No temporal ordering across domains.** Clocks are injected, and each domain
  is unaware of the others.
