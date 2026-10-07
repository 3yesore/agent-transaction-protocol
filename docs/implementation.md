# ATP Reference Implementation

**Status:** reference implementation of Kernel v0.2 candidate
**Runtime:** Node.js 22.6 or newer. TypeScript runs directly with type stripping, so there are **zero runtime dependencies** and no build step.

## 1. Purpose

SPEC-v0.2-candidate.md defines the candidate kernel; this implementation exists to make its claims falsifiable. It enforces the ten invariants, resolves Policy out of state, and provides the extension schemas the sixteen review cases use.

It has no network layer, no consensus, no cryptography beyond content hashing, and no cross-Domain transactions.

## 2. Layout

~~~
kernel/          the four primitives and their enforcement
  json.ts        canonical JSON (sorted keys) and sha256 content addressing
  types.ts       State, Transition, Policy, Evidence as data
  state.ts       snapshots, preconditions, atomic effect application
  evidence.ts    content-addressed evidence and the three-valued verifier
  policy.ts      the policy interpreter, rule vocabulary, and resolution
  ledger.ts      append-only hash-chained transition records
  domain.ts      the propose -> resolve -> authorize -> apply -> append pipeline
  invariants.ts  I1-I10 runtime report
extensions/      higher-level schemas (not kernel primitives)
  capability.ts  capability accounting with conservation
  reservation.ts two-phase holds over a resource
  commitment.ts  obligations and history-preserving amendments
  outcome.ts     outcomes, dispute, supersession
  decision.ts    the Decision Evidence schema and its rule type
  index.ts       standard interpreter, preconditions, genesis helpers
experiments/v0.2-review/   sixteen executable review cases
test/                      node:test suites
~~~

## 3. Transaction Pipeline

Every state change goes through `Domain.propose`. The order is fixed and visible in the ledger:

1. **Shape** - the proposal is structurally valid.
2. **Domain** - the proposal targets this Domain.
3. **Replay guard** - the proposal id has not already committed.
4. **Evidence** - referenced evidence resolves; **evidence addressed to the proposal is gathered too**.
5. **Policy resolution** - the named policy document is loaded from state, version-pinned if asked, and checked against its temporal window.
6. **Policy amendment guard** - an effect touching `policy/<id>` must be authorized by that policy itself or by `policy/authority`, and a policy can never be created by a bare transition.
7. **Policy selection** - if `policy/authority` exists, it is evaluated before the named policy.
8. **Preconditions** - evaluated against the current snapshot.
9. **Policy** - the rule list is evaluated; all rules must pass.
10. **Effects** - applied into a copy. All effects land or none do.
11. **Append** - exactly one hash-chained transition record.

A rejected proposal appends nothing to the ledger; refusals are retained in a non-authoritative `attempts` log.

## 4. Primitive Mapping

| Concept | Module | Representation |
|---------|--------|----------------|
| State | `kernel/state.ts` | immutable snapshot of keyed documents with monotonic versions |
| Transition | `kernel/types.ts` | proposal (actor, intent, policy ref, preconditions, effects) plus committed record |
| Policy | `kernel/policy.ts` | a document held at `policy/<id>` plus a fixed rule vocabulary |
| Evidence | `kernel/evidence.ts` | content-addressed record; verifier returns VALID / INVALID / UNVERIFIED |

`Decision` is absent from the kernel by design. It appears only in `extensions/decision.ts`, as an Evidence schema of kind `decision`.

## 5. Design Decisions

### 5.1 Policy is state, not a reference

A proposal names a policy id and may pin its state version; it carries **no parameters**. Policy parameters live in the policy document, so a proposer cannot weaken its own gate. This closed a real hole in the v0.1 implementation, where `policy: { id, params }` was proposer-controlled. See `docs/policy-as-state.md`.

### 5.2 A proposal cannot hide evidence aimed at it

The Domain unions the referenced evidence with every record whose `about` equals the proposal hash. Without this, a proposer could cite a favourable judgment and omit an unfavourable one.

### 5.3 Preconditions guard the prior state; policy guards the result

Named preconditions are evaluated against the current snapshot. A guard on the *result* of a transition must be a rule that inspects `context.proposal.effects` - for example `capability-conserved-effect`.

### 5.4 No delete effect

There is no `delete` operation. Invalidation, reversal, amendment, and dispute are new values or new keys. I4 is structural rather than conventional.

### 5.5 Content addressing

`canonicalize` sorts keys, drops `undefined`, and rejects non-finite numbers. Evidence, proposals, and transition records are hashed with it, so later edits change the address.

### 5.6 One ledger per Domain

A `Domain` is one authority and atomicity scope. Nothing in the codebase can commit two Domains at once, which is what review case 001 measures.

### 5.7 The verifier's trust set is part of the authority boundary

`createVerifier({ trustedProducers })` returns UNVERIFIED for unknown producers. Review case 013 shows identical policy text being capturable or not depending on this configuration. That set is not State, and the candidate says so.

## 6. What Is Deliberately Omitted

- networking, transport, message ordering
- signatures and key management (the signature field exists but is not verified cryptographically)
- consensus, finality, and cross-Domain transactions
- identity and Sybil resistance
- privacy and erasure
- agent runtimes, planning, or execution (the kernel observes only effects and evidence)

## 7. Running

~~~
npm test              # 24 tests across kernel, invariants, and the review suite
npm run experiments   # regenerates experiments/results/v0.2-review.md
npm run verify        # experiments then tests
~~~

## 8. Known Limits

- **Effect ordering is significant.** A later effect may update a key created earlier in the same proposal.
- **The attempts log is not hash-chained.** Diagnostic only.
- **Evidence is not cryptographically signed.** Content addressing detects tampering after publication, not forgery at publication.
- **Policy selection without policy/authority is deployment-controlled.** Documented, not guaranteed.
- **No temporal ordering across Domains.** Clocks are injected and each Domain is unaware of the others.
