# The Ambiguity Budget of an Amendment Specification

**Status:** executed. Report: `experiments/results/amendment-ambiguity.md`.
**Code:** `experiments/amendment-ambiguity/`. **Tests:** `test/amendment-ambiguity.test.ts`.

> Every number below is copied from the generated report. If a number here
> disagrees with the report, the report is right.

## Why this exists

`docs/meta-consensus.md` concluded that a self-amending chain can have
self-amendment or implementation diversity but not both, and named the way out in
its third falsifier: an amendment procedure with **d = 0**, unambiguous enough that
independent clients cannot diverge.

This measures what that would take.

The starting observation is that a specification does not have to be *wrong* to
fork a chain. It only has to be **silent**. So the decision function here is
three-valued:

~~~text
valid | invalid | undetermined
~~~

**undetermined** is the ambiguity, and it is exactly where two honest clients can
disagree. The quantity is `d`, the fraction of amendments the specification does
not decide.

- corpus: **12 amendments** covering the ways an amendment can be defective
- specification: **7 clauses**, each one a decision it must make explicitly

## The ladder

Clauses added one at a time. Every rung closes at least one class and strictly
reduces d.

| spec | clauses | valid | invalid | undetermined | d |
|------|---------|-------|---------|--------------|---|
| minimal | 0 | 1 | 0 | 11 | 91.7% |
| + require-pre-state-authorization | 1 | 1 | 3 | 8 | 66.7% |
| + require-precondition-match | 2 | 1 | 4 | 7 | 58.3% |
| + closed-target-vocabulary | 3 | 1 | 5 | 6 | 50.0% |
| + check-types | 4 | 1 | 6 | 5 | 41.7% |
| + reject-unknown-fields | 5 | 1 | 7 | 4 | 33.3% |
| + require-value-in-range | 6 | 1 | 8 | 3 | 25.0% |
| + require-canonical-encoding | 7 | 1 | 11 | **0** | **0.0%** |

A total specification reaches **d = 0** and still accepts the conforming
amendment, so determinacy did not come from rejecting everything. Removing any one
clause raises d again - the test suite asserts that every clause is load-bearing,
so none of the seven is over-specification.

## The kernel's own rule is an ambiguity class

Under the minimal specification, an amendment that names the **successor's**
semantics as its authoriser - a domain authorising its own replacement - is not
invalid. It is **undetermined**.

That is the single most important case in the whole framework, and leaving the
rule implicit makes it undecided rather than forbidden. Stating one clause closes
it, and the same clause closes three distinct shapes:

- authorisation absent entirely
- authorisation pointing at an unrelated semantics
- authorisation pointing at the successor (self-authorisation)

This is the constructive counterpart to the freeze's own open question. The only
irreducible constraint the reduction work found is **pre-state evaluation** - and
it is only a constraint once it is written down as a decision procedure.

## Encoding alone can fork a chain

Three corpus entries carry **identical semantic content** and differ only in their
bytes: key order, a duplicate key, and insignificant whitespace.

Under a specification without a canonical-encoding clause, all three are
undetermined. One client accepts the byte sequence, another rejects it, while both
agree on what it *means*. At the object level that is a rejected block. At the meta
level it is a split set of rules.

Canonical encoding is therefore not a serialization preference. It is part of the
amendment procedure, and it has nothing to do with the protocol.

## What this gives the chain

A concrete design obligation rather than a hope:

1. publish the amendment decision procedure as a **total function** over a
   **canonical encoding**;
2. state pre-state evaluation **explicitly** as a clause, not as an assumption;
3. ship a conformance suite for the procedure, in the same style as
   `conformance/` - an oracle that must pass and mutants that must fail;
4. only then is implementation diversity free again, because `d = 0` is a
   property of the specification rather than a hope about the implementers.

## Caveats

The corpus is authored, like every other benchmark in this repository, so
`d` measures the ambiguity of *this* specification over *these* shapes. A larger
corpus would find more classes; the method is what transfers, not the 91.7%.
