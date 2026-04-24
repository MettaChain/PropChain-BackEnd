# Email campaigns

## Acceptance criteria

- Create and configure email campaigns with campaign name, subject, content, and send settings.
- Target campaigns to defined user segments based on user attributes, activity, and preferences.
- Schedule campaigns to send immediately or at a future date/time, with optional recurring delivery.
- Track campaign performance with delivery status, open rate, click rate, bounce rate, and unsubscribe counts.
- Provide campaign history and analytics so administrators can review performance and compare campaigns.

## Implementation details

### Campaign creation

- Allow administrators to create a campaign with a descriptive name, email subject, preheader, and body content.
- Support HTML and plain-text email content or templated message blocks.
- Include email sender details and reply-to address settings.
- Validate campaign configuration before activation.

### Target segments

- Define target segments using filters such as user role, location, account status, signup date, and custom profile fields.
- Allow segment previews or estimated audience counts before sending.
- Support saved segments for reuse across multiple campaigns.
- Enable excluding specific users, segments, or suppression lists.

### Scheduling

- Enable campaigns to be sent immediately or scheduled for a future date and time.
- Store schedule settings and keep a record of planned campaign sends.
- Support optional recurring or batch sends if applicable.
- Provide clear status labels for draft, scheduled, sending, completed, or cancelled campaigns.

### Performance tracking

- Track key metrics for each campaign: sent count, delivered count, open rate, click-through rate, bounce rate, unsubscribe count, and spam complaint count.
- Record delivery events and failures with reason details.
- Provide a campaign summary dashboard with visual metrics and trends.
- Allow exporting campaign performance data for reporting.

### Campaign history and analytics

- Keep a log of sent campaigns with dates, targets, and status.
- Allow administrators to compare past campaign performance and identify top-performing segments.
- Surface engagement patterns to improve future targeting and scheduling decisions.
