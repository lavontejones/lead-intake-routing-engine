# Data contract and review policy

## Intake

The canonical input fields are `first_name`, `last_name`, `title`, `company`, `gender`, `spouse_partner`, `email`, `phone`, `location`, `lead_source`, `service_interest`, `estimated_value`, `urgency`, `notes`, `info_field_1`, `info_field_2`, `info_field_3`, `info_field_4`, and `tags`.

Blank/null scalar values become blank text, except missing estimated value becomes `null`. Numeric field values are converted to text before field-specific validation. A JSON `tags` array must contain strings. Other arrays and nested objects fail intake. Company and person names retain their supplied capitalization; whitespace is normalized. Unicode compatibility normalization is applied without guessing legal names or identity.

CSV supports UTF-8, a leading BOM, CRLF/LF line endings, quoted commas, escaped quotes, and multiline quoted cells. Empty lines are skipped. Empty or duplicate headers, header alias collisions, malformed quoting, and inconsistent cell counts stop intake. The engine subsequently collapses whitespace within text, including multiline notes.

Phone normalization accepts US ten-digit numbers, US eleven-digit numbers beginning with 1, and explicit international `+` numbers with 8–15 digits. Recognized trailing extensions are `ext`, `ext.`, `extension`, `x`, and `#`; extensions are kept in `phone_extension`. These checks are syntactic, not verification against a numbering-plan database.

## Returned envelope

| Property | Meaning |
| --- | --- |
| `schema_version` | Output contract version (`1.0`). |
| `rules_version` | Version label supplied in routing configuration. |
| `currency` | `USD`. |
| `stats` | Total, ready, review, invalid, and likely duplicate record counts. Duplicate count overlaps the other statuses. |
| `leads` | Every normalized record, including rejected/review records and decision metadata. |
| `crm_ready` | Only eligible records, with the defined CRM field set. |

CRM fields retain the input fields and add `lead_id`, `phone_extension`, `category`, `lead_score`, `priority`, `assignment`, `status`, and `summary`. `tags` is an array in JSON. Each full-audit record also includes `raw_score`, `score_breakdown`, `flags`, `duplicate_matches`, and `rules_version`.

`score_breakdown` entries have `rule`, `points`, and `reason`. Flags have `code`, `severity`, `field`, and `message`. Duplicate matches have `lead_id` and `reason`; reasons are `same_email`, `same_phone`, or `same_name_company`. Existing inventory references use `existing-0001` style row references. Input IDs and calculated scores are not trusted as routing authority.

## Status precedence

| Status | Triggers | CRM export |
| --- | --- | --- |
| `invalid` | Invalid supplied email/phone, no valid contact method, malformed amount, invalid urgency | Excluded |
| `needs_review` | Duplicate candidate, category tie, suspicious leading formula text, HTTP link in notes, without validation errors | Excluded |
| `ready_for_crm` | No error or review flag; missing optional details and unknown fields can remain as warnings | Included |

All excluded records receive the configured review assignment. Their scores remain visible to support review, but cannot make them eligible. Correct the input and reprocess the batch; the browser has no record-approval override.

Duplicate indexes use only syntactically valid contact fields and nonblank full-name/company keys. They do not merge records or validate real identity. Records with usable matching keys are indexed even if another field is invalid, so a later lead can be held for review against that earlier record. Review that candidate explicitly.

## Output files

- `processed-leads.json`: complete envelope and decision evidence for the batch.
- `crm-ready.json`: eligible records only, suitable for adapter code and typed field mapping.
- `crm-ready.csv`: eligible records only, with a stable header order and spreadsheet-safe quoting.
- `review-queue.csv`: invalid and review records, including serialized flags and duplicate reasons.

The CLI writes these fixed filenames in the requested output directory and replaces earlier exports of the same names. Use separate output directories when preserving multiple batches. Structural failures occur before output writing; a filesystem failure during writing can leave partial files. Do not ingest a partial batch without checking the CLI exit status.

CSV formula prefixes are a safety transformation, not CRM formatting. An apostrophe is intentionally inserted before risky leading characters, including normalized `+` phone numbers. JSON preserves normalized values exactly. A target CRM adapter must map `assignment` to the vendor's owner identifier, map enum/custom fields, choose tag delimiters, and define idempotent create/update rules.
