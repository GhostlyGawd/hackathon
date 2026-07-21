# DET-05 approval hold and human-restoration proof

DET-05 connects exact deterministic findings to the district's existing
approval record. A witnessed conflict can move an existing **APPROVED** record
to **HOLD** once, with the contributing receipt attached. A clean rerun cannot
restore approval. Only an authorized person can restore it by signing a reason
that acknowledges the named test scope.

## Evidence

- [Approved before — desktop](approved-before-desktop.png) and
  [narrow](approved-before-narrow.png) show the imported fictional district
  approval before Pactwire evaluates a finding. The corresponding
  [API snapshot](approved-before-snapshot.json) contains no hold event.
- [Witnessed conflict hold — desktop](approved-to-hold-desktop.png) and
  [narrow](approved-to-hold-narrow.png) show **APPROVED → HOLD**, the distinct
  `WITNESSED_CONFLICT` reason, and the exact contributing receipt. The
  [API snapshot](approved-to-hold-snapshot.json) records one idempotent event.
- [Still held after repair — desktop](hold-after-repair-desktop.png) and
  [narrow](hold-after-repair-narrow.png) show that a clean named rerun does not
  restore approval. The [API snapshot](hold-after-repair-snapshot.json)
  preserves the original hold and receipt.
- [Required visibility loss — desktop](visibility-loss-hold-desktop.png) and
  [narrow](visibility-loss-hold-narrow.png) show a separate
  `REQUIRED_VISIBILITY_LOSS` hold only after the required checkpoint was
  previously visible and the exact frozen retry remained invisible. The
  [API snapshot](visibility-loss-hold-snapshot.json) records that distinct
  reason and checkpoint.
- [Human restoration — desktop](human-restored-approval-desktop.png) and
  [narrow](human-restored-approval-narrow.png) show the authorized privacy
  officer's signed, named-scope decision while retaining the original hold in
  history. The [API snapshot](human-restored-approval-snapshot.json) records
  both state events and the human decision.

All screenshots were captured through the real browser and authenticated API
against the optimized production build at source commit
`8bb40f8aecfc5a6d5928c031edac466f161f251d`. The fixtures use fictional people,
a fictional school product, synthetic observations, and reserved identifiers.

## Verification

The focused deterministic suite covers the reducer, route authorization,
PostgreSQL transactions and row locking, exact receipt lineage, concurrency,
idempotency, and append-only history. Fixed-seed generated properties include:

- PROP-01: automated event sequences cannot enter or restore **APPROVED**;
- PROP-02: automation can only perform the allowed **APPROVED → HOLD** move;
- PROP-03: concurrent processing of one receipt creates one hold contribution;
- PROP-11: earlier approval events and actors never change.

Run the four browser scenarios against the production build from the repository
root:

~~~powershell
$env:PACTWIRE_BDD_TAGS='@DET-05'
pnpm test:bdd -- --production
~~~

To recapture the curated desktop and narrow evidence at the checked-out source
commit:

~~~powershell
$env:PACTWIRE_CAPTURE_CURATED_EVIDENCE='1'
$env:PACTWIRE_EVIDENCE_TASK='DET-05'
$env:PACTWIRE_BDD_TAGS='@DET-05'
pnpm test:bdd -- --production
~~~

## Claim boundary

This proof establishes the implemented authority boundary for the controlled
fixture. It does not establish that a product is safe, compliant, approved, or
free of other behavior. A clean sampled run means only that the prior conflict
was not seen again in the named tests. Agreement meaning, destination identity,
and every decision to create or restore approval remain human-owned.

FR-056 notification delivery is P1 and is not implemented by this task. It
remains deferred until webhook delivery and bounded-language copy have their
own tests and evidence.
