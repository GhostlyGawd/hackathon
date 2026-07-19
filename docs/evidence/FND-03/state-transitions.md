# FND-03 state-transition evidence

This table and diagram are generated from the reducer transition definitions in `packages/core/src/domain.ts`. They describe authority and allowed state movement; they are not evidence of a user-facing workflow.

## Approval transitions

| Actor | From | To | Allowed reasons |
| --- | --- | --- | --- |
| AUTOMATION | APPROVED | HOLD | WITNESSED_CONFLICT, REQUIRED_VISIBILITY_LOSS |
| HUMAN | UNKNOWN, APPROVED, HOLD, REJECTED | UNKNOWN | HUMAN_DECISION |
| HUMAN | UNKNOWN, APPROVED, HOLD, REJECTED | APPROVED | HUMAN_DECISION |
| HUMAN | UNKNOWN, APPROVED, HOLD, REJECTED | HOLD | HUMAN_HOLD |
| HUMAN | UNKNOWN, APPROVED, HOLD, REJECTED | REJECTED | HUMAN_REJECTION |
| HUMAN | UNKNOWN, APPROVED, HOLD, REJECTED | RETIRED | HUMAN_RETIREMENT |
| IMPORTED_SYSTEM | UNKNOWN, APPROVED, HOLD, REJECTED | UNKNOWN | IMPORTED_DECISION |
| IMPORTED_SYSTEM | UNKNOWN, APPROVED, HOLD, REJECTED | APPROVED | IMPORTED_DECISION |
| IMPORTED_SYSTEM | UNKNOWN, APPROVED, HOLD, REJECTED | HOLD | IMPORTED_DECISION |
| IMPORTED_SYSTEM | UNKNOWN, APPROVED, HOLD, REJECTED | REJECTED | IMPORTED_DECISION |

The `MODEL` actor has no approval transition. Human restoration to `APPROVED` additionally requires a signed `HumanDecision` identifier. No event may leave `RETIRED`.

~~~mermaid
stateDiagram-v2
    [*] --> UNKNOWN: human or imported decision
    UNKNOWN --> APPROVED: human signed decision or import
    UNKNOWN --> HOLD: human or import
    UNKNOWN --> REJECTED: human or import
    UNKNOWN --> RETIRED: human only
    APPROVED --> UNKNOWN: human or import
    APPROVED --> HOLD: automation only for witnessed conflict or required visibility loss
    APPROVED --> HOLD: human or import
    APPROVED --> REJECTED: human or import
    APPROVED --> RETIRED: human only
    HOLD --> UNKNOWN: human or import
    HOLD --> APPROVED: signed human decision or import
    HOLD --> REJECTED: human or import
    HOLD --> RETIRED: human only
    REJECTED --> UNKNOWN: human or import
    REJECTED --> APPROVED: signed human decision or import
    REJECTED --> HOLD: human or import
    REJECTED --> RETIRED: human only
~~~

## Run transitions

| Event | From | To | Evidence rule |
| --- | --- | --- | --- |
| RUN_STARTED | QUEUED | RUNNING | Actor provenance required |
| RUN_COMPLETED | RUNNING | COMPLETED | Actor provenance required |
| RUN_PARTIAL | RUNNING | PARTIAL | Actor provenance required |
| RUN_FAILED | RUNNING | FAILED | Actor provenance required |
| RUN_CANCELED | QUEUED, RUNNING | CANCELED | Actor provenance required |
| RETRY_QUEUED | COMPLETED, PARTIAL, FAILED, CANCELED | QUEUED | Actor provenance required |

~~~mermaid
stateDiagram-v2
    [*] --> QUEUED: frozen configuration
    QUEUED --> RUNNING: RUN_STARTED
    RUNNING --> COMPLETED: verified manifest
    RUNNING --> PARTIAL: manifest or explicit integrity failure
    RUNNING --> FAILED: manifest or explicit integrity failure
    QUEUED --> CANCELED: manifest or explicit integrity failure
    RUNNING --> CANCELED: manifest or explicit integrity failure
    COMPLETED --> QUEUED: new retry with identical snapshot
    PARTIAL --> QUEUED: new retry with identical snapshot
    FAILED --> QUEUED: new retry with identical snapshot
    CANCELED --> QUEUED: new retry with identical snapshot
~~~

Terminal run records cannot transition in place. A retry is a new run linked to the terminal source and carries an exact copy of the frozen agreement, journey, authorization, runner version, and snapshot hash.
