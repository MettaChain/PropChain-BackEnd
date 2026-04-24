# View audit logs

## Acceptance criteria

- Filter logs by date range, user, action type, and resource.
- Search logs using keywords, IDs, or related metadata.
- Export selected logs to CSV or JSON.
- Include user actions and event details in the log view.

## Implementation details

### Data model

- Store audit events with fields such as timestamp, userId, username, action, resourceType, resourceId, ipAddress, metadata, and description.
- Ensure events are immutable and indexed for efficient filtering by timestamp, user, and action.

### Filter and search

- Provide UI controls for selecting a date range, user, action type, and affected resource.
- Support free-text search across event descriptions, resource IDs, and metadata.
- Combine filters with search terms to narrow results.
- Implement server-side filtering and pagination for large log sets.

### Export

- Allow users to select one or more log entries or export the current filtered result set.
- Export selected logs in CSV with headers and JSON with structured event payloads.
- Include a clear filename and export timestamp in the download file.

### User action details

- Display a row or card for each audit event showing timestamp, user, action, resource, and summary.
- Expand each entry to reveal full metadata, IP address, request path, and any related notes.
- Highlight critical actions such as authentication changes, permission updates, and data exports.
