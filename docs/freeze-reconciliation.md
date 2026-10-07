# Freeze Reconciliation

How the ATP-0002 freeze (the `ATP-v0.2-freeze.zip` revision) relates to this
repository, what it changes, and what needs fixing in it.

## What the freeze changed

Relative to the v0.2 **candidate** this repository implemented:

- The kernel is reduced again, from four primitives to **two**: `S0` and `R0`.
- **Policy and Evidence are removed** as primitives. Policy becomes part of
  semantic state; Evidence becomes context `C`.
- `Agent`, `Decision`, `Consensus`, `Identity`, `Domain` all become
  higher-level or derived.
- Three core invariants replace the candidate's ten.
- All `-candidate` files are removed and folded into the normative documents.
- The 0-byte `protocol-v0.2-candidate.json.tmp` is gone (it was flagged).

## How this repository relates

This repository's `kernel/` and `extensions/` implement the **candidate**, not
the freeze. Under the freeze that code is not superseded - it is **one concrete
`R`**, a domain instance. Specifically:

| Freeze statement | Where this repository instantiates it |
|------------------|----------------------------------------|
| `D = (S0, R0)` | `Domain` with seeded genesis state, including policy documents |
| `R(S, X, C, S') -> valid/invalid` | `Domain.propose`: shape, domain, replay, evidence, policy, preconditions, effects |
| "semantics may evolve" (SPEC 4) | `policy/<id>` documents amended by transitions |
| "recognised under the preceding semantics" | the amendment guard: a policy is amended by its **pre-state** version, checked mechanically by `checkPolicyIsState` |
| "recognised history cannot silently be replaced" | no delete effect exists; the ledger is hash-chained |
| "multiple valid successors permitted" | policies are data; canonical selection is not implemented |
| "shared uniqueness needs a shared domain" | review case 007 |

The important alignment: the freeze's **one substantive invariant** (invariant 2)
is exactly what this repository already implements and mechanically checks as
I10. `checkPolicyIsState` in `kernel/invariants.ts` is an executable witness
for it, and `docs/kernel-reduction-audit.md` generalises the argument.

## Evidence base

The freeze **deleted** `experiments/README-v0.2.md`, the candidate's
sixteen-row review record, and `experiments/README.md` is byte-identical to the
v0.1 file in the freeze. So the freeze's evidence base is *smaller* than the
candidate's, and `docs/evolution.md` claims the reduction "was accepted after
adversarial tests covering..." with no record of those tests.

This repository retains the executable form of that review: **23 review cases
with 81 assertions**, plus 40 tests. That is currently the only executable
evidence for the reduction. It is retained deliberately.

## Defects to fix in the freeze

These are concrete and mechanical. They are recorded rather than patched here,
because silently editing a frozen baseline is exactly what the project forbids.

1. **README repository structure is the v0.1 tree.** It omits `protocol.json`,
   `RFC/ATP-0002-state-evolution-kernel.md`, `docs/kernel-reduction-research.md`,
   `docs/ATP-0002-stage-freeze.md`, and the rewritten `architecture.md` and
   `evolution.md`.
2. **README open problems are the v0.1 list, unchanged**, and still say "the first
   major stress test is expected to be cross-agent atomicity" - which the freeze
   has since concluded (cross-domain is local recognition composed). The RFC's
   next research boundary is a *different* list. Two competing lists, one stale.
3. **README Status still names only ATP-0001**, while the header says "Current
   Research Version: ATP-0002".
4. **`D` is used as the kernel's subject while the RFC says a domain is "not a
   universal kernel object"** (RFC 6), and `protocol.json` lists `domain` under
   `derived_or_higher_level` while `kernel_model` is `D = (S0, R0)`. Either
   define `D` as a kernel term or reformulate without it.
5. **RFC number 0002 is reused.** It was `ATP-0002-v0.2-kernel-reduction`, a
   frozen conclusion; it is now `ATP-0002-state-evolution-kernel`. A published
   number should not be reassigned.

## Resolution status in this repository

The five defects above are in the **freeze archive**, not in this repository, and
this repository does not silently rewrite a frozen baseline. What was done here:

| Defect | Status here |
|--------|-------------|
| 1. README tree stale | not applicable - this repository keeps its own README, and its tree is current |
| 2. README open problems stale | not applicable to the freeze's README; `docs/open-problems.md` here is the live list |
| 3. README status stale | not applicable for the same reason |
| 4. `D` is used while `domain` is declared derived | **resolved here** by `docs/domain.md`: `D` is the kernel's subject, but there is no global domain object |
| 5. RFC 0002 reused | **resolved here**: `RFC/` now holds 0001, 0002 (state evolution) and 0003 only; the candidate-era reduction RFC moved to `docs/history/ATP-0002-candidate-kernel-reduction.md` with its superseded status |

Defects 2 and 3 are still worth fixing upstream, because the freeze archive is
what a new reader receives first.

## Suggested wording changes

Because `docs/kernel-reduction-audit.md` establishes that only one constraint
does work, the invariant list would be more honest as:

~~~text
Kernel rule (the only one):
  A transition is evaluated under the semantics in force before it, so a
  semantic change must be authorised by what it replaces.

Not constraints:
  C1  definitional - restates what "recognised" means
  C8  a permission - the default behaviour of a free relation

Domain-level choices, not kernel properties:
  C3  historical integrity (a domain may adopt semantics that discard it)
  C4  atomicity
  C6  non-transfer of authority
  C7  choice of time source

Architectural pattern, not kernel property:
  C5  shared uniqueness requires a shared domain
~~~

## Relationship to RFC/ATP-0003

`RFC/ATP-0003-cross-agent-coordination.md` was written against the candidate, so
its reservations, evidence and judgments are now **domain-level schemas** rather
than protocol components. Its content is unaffected; its framing needs a status
note saying so.
