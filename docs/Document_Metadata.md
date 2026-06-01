# Document Metadata, Categorization & Tagging

## Overview

PropChain supports rich metadata categorization to aid in the discovery, organization, and lifecycle management of real estate documents.

## Fields

- **`category`**: A high-level classification of the document.
  - `FINANCIAL`: Bank statements, pre-approval letters, payment proofs.
  - `LEGAL`: Deeds, disclosures, title reports.
  - `PROPERTY_DETAILS`: Floor plans, inspection reports, appraisals.
  - `CONTRACT`: Offers, purchase agreements, addendums.
  - `OTHER`: Uncategorized or miscellaneous documents.

- **`tags`**: An array of custom string tags applied to the document (e.g., `["urgent", "signed", "q1-2026"]`). Used for flexible, granular filtering.

- **`expiresAt`**: An optional date-time indicating when the document is no longer valid.

- **`status`**: The lifecycle state of the document (`ACTIVE`, `EXPIRED`, `ARCHIVED`).

## Filtering

Documents can be queried by `category` and `tag` using the `GET /api/documents` endpoints via query parameters. Expired or archived documents are automatically excluded from primary listing APIs unless explicitly requested via state overrides.