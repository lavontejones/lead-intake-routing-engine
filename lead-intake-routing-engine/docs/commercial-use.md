# Adapting this workflow for a client

## Client-facing explanation

“Your leads need one consistent path from inquiry to follow-up. This workflow cleans incoming details, flags duplicates and missing information, explains which opportunities meet your priority rules, and assigns a responsible team before CRM import.”

## A bounded implementation scope

| Work | Deliverable |
| --- | --- |
| Intake mapping | Field dictionary for the client's form, spreadsheets, and existing contacts. |
| Business rules | Agreed service categories, estimated-value bands, urgency definitions, referral/source points, and score thresholds. |
| Ownership | Team routing matrix, general fallback, review queue, and required response-time policy. |
| CRM handoff | Reviewed field mapping, accepted CSV/JSON format, owner identifiers, and duplicate handling policy. |
| Acceptance | Synthetic cases exercising the agreed routes, quality flags, score boundaries, and exports. |
| Handoff | Operator instructions, documented limitations, and rule change procedure. |

CRM API integration, an online form backend, persistent contact storage, notifications, scheduling, retry queues, and multi-user authentication are separate implementation work. The current repository supplies the engine, local interface, and file handoff.

## Demonstrate it in a client meeting

1. Load the sample batch and open Avery's lead. Show the 100-point explanation and assigned team.
2. Open the second Avery inquiry and Quinn's shared company phone. Show why both need human duplicate review.
3. Open Riley's record. Show that no usable contact method prevents CRM entry.
4. Open Alex's record. Show that conflicting categories route to review rather than silently choosing a team.
5. Download the CRM CSV. Compare its five eligible records with the seven records in the review queue.
6. Change a team name or scoring threshold in the editor, apply it, and show the recalculated result. Download the modified rules to retain them.

These are fictional demonstrations. They are not evidence of client performance or production reliability.

## Acceptance criteria for a live adaptation

- Agreed source columns map without silent data loss or header collisions.
- A lead with no usable contact method cannot enter the import set.
- Known duplicate contacts are held according to the agreed policy, including shared-number examples.
- Every score can be reconciled to its rule contributions and threshold.
- Every eligible category has an owner or deliberate fallback.
- Gender, partner details, and other excluded personal fields cannot change rank or ownership.
- The target CRM sandbox imports a reviewed fixture correctly, including phones, tags, owner IDs, and custom fields.
- Repeated delivery uses the agreed persistent identifiers/upsert behavior and does not create accidental duplicates.
- Operators know how to correct, reprocess, and handle the review queue.
- Required production access, retention, monitoring, and recovery controls are reviewed for the actual deployment.

Measure results only after a real deployment: time from receipt to assignment, completeness rate, duplicate-review rate, routing corrections, and follow-up completion. This repository provides no measured ROI claim.
