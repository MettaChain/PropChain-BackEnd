# Generate reports

## Acceptance criteria

- Create custom reports with selectable data fields and filters.
- Support scheduled reports delivered automatically on a configurable cadence.
- Export reports in multiple formats such as PDF, CSV, and Excel.
- Allow sharing reports with users or teams via links or email.

## Implementation details

### Report builder

- Offer a report builder UI for selecting data sources, columns, filters, and sort order.
- Allow users to save custom report templates for reuse.
- Provide preview mode so users can validate report content before exporting.

### Scheduled reports

- Enable users to schedule reports daily, weekly, or monthly.
- Store schedule settings, recipient lists, and last run status.
- Send scheduled report outputs to configured email recipients or shared workspace locations.

### Export formats

- Support exports in PDF with formatted layouts, CSV for spreadsheet import, and Excel for richer data interaction.
- Include report metadata in exports, such as title, filters applied, and generation timestamp.
- Ensure CSV and Excel exports preserve column names and values cleanly.

### Sharing

- Provide shareable links for saved report templates and generated report snapshots.
- Allow sharing with specific users or teams, controlling view/download permissions.
- Include email sharing and notification options for one-off reports.
