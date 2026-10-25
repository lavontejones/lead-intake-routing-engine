# Lead Intake and Routing Engine

Turn spreadsheet or form inquiries into a clean, explainable follow-up queue. The tool helps small teams apply consistent intake rules when contact details, urgency, fit, and ownership arrive in different formats.

## What it does

- Validates and normalizes CSV or JSON lead records.
- Flags likely duplicates for review without merging or deleting contacts.
- Applies configurable categories and scores, with the points and reasons shown for each result.
- Assigns eligible records to a configured team and routes uncertain or invalid records to review.
- Exports CRM-ready JSON and CSV separately from the review queue.

All included companies and contacts are fictional. The browser app processes imported data in memory; its local server only serves application files. It does not connect to a CRM, upload files to a server, or make external service calls.

## Run the demonstration

Install Node.js 22 or newer, then run from the repository root:

```sh
cd lead-intake-routing-engine
npm ci --ignore-scripts
npm start
```

Open `http://127.0.0.1:4173` and select **Load sample leads**. For the file-based CLI, run `npm run demo` from the same application directory. The [application README](lead-intake-routing-engine/README.md) documents inputs, scoring, outputs, review rules, and limitations.

This is a local demonstration of decision rules, not a live lead-management service. Review the records and scoring policy before using the pattern with real data; do not treat an exported row as approved for import automatically.
