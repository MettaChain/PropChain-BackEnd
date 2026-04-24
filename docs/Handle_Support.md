# Handle support

## Acceptance criteria

- Create support tickets from user issues or internal reports.
- Assign agents to tickets and update ownership.
- Track ticket status through open, in progress, and resolved states.
- Resolve tickets with a summary of actions taken and closure notes.

## Implementation details

### Ticket creation

- Allow ticket creation from a support inbox, user-reported issue form, or internal incident report.
- Require key ticket fields such as title, description, priority, category, and requester.
- Capture related user, account, property, or transaction context for faster resolution.

### Assignment and ownership

- Support assigning tickets to one or more agents or teams.
- Track assignment history and enable reassignments as workload changes.
- Notify assigned agents when a ticket is created or transferred.

### Status tracking

- Maintain ticket status values: Open, In Progress, Pending, Resolved, and Closed.
- Display status changes in the ticket timeline with timestamps and responsible agent.
- Allow agents to update status and add internal notes, public replies, and resolution details.

### Resolution workflow

- Require a resolution summary and closure notes before closing a ticket.
- Log the full action history, including agent updates, customer responses, and attachments.
- Provide reporting metrics such as ticket resolution time, open ticket count, and backlog by category.
