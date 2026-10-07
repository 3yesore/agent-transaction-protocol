# Proposals

This directory contains proposed changes to ATP.

## Proposal Template

```markdown
# ATP Proposal: <Title>

## Problem

What concrete behavior cannot be represented or is unsafe?

## Existing Representation

Show how the current kernel attempts to represent it.

## Failure

Explain exactly where the representation fails.

## Why an Extension Is Insufficient

Explain why the problem changes kernel semantics rather than requiring only a higher-level protocol.

## Proposed Change

Describe the smallest semantic modification.

## Alternatives Rejected

List simpler alternatives and why they fail.

## New Invariants

What must remain true after the change?

## Compatibility

How does this affect previous versions?

## Test Cases

Provide adversarial and normal cases.
```

## Rule

A proposal should start from a failure case.

Do not propose primitives merely because they are conceptually useful.
