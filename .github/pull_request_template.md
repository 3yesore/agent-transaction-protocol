## What this changes

<!-- One or two sentences. -->

## Which rule does it touch?

- [ ] The kernel rule (a transition is evaluated under the semantics in force before it)
- [ ] A state schema or extension
- [ ] Conformance probes
- [ ] Documentation only
- [ ] Tooling

## Checklist

- [ ] `npm run verify` passes locally
- [ ] If this adds or changes a kernel claim, it comes with a **concrete failure case**, not an argument
- [ ] No new primitive is proposed without a demonstrated inability to express the behavior with existing ones
- [ ] If I changed an invariant, I said which one it replaces and why
- [ ] Generated reports are regenerated and committed (`npm run experiments`, `npm run reduction`, `npm run conformance`, `npm run bench`)

## If this adds or changes a conformance probe

- [ ] The probe cites the requirement it tests
- [ ] There is a mutant that fails exactly this probe, and it is registered so CI proves the probe has teeth
