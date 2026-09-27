# API Versioning — Consumer Guide

## Overview

PropChain uses **URI path-based API versioning**. The current version is **v2** (active). **v1** is deprecated and will sunset on **2026-12-31**.

## Specifying a Version

### Required: URL Path

All API requests MUST include the version in the URL path:

```
GET /api/v2/properties
GET /api/v2/users/me
POST /api/v2/auth/login
```

**Note:** The version in the URL path is the authoritative source for API versioning. Header-based versioning is not supported for new implementations.

### Legacy Support

For backward compatibility with existing v1 consumers, the following legacy methods are still accepted but **should not be used for new integrations**:

- `API-Version` header: `API-Version: v2`
- `Accept` header: `Accept: application/vnd.propchain.v2+json`

These legacy methods will be removed when v1 is sunset on **2026-12-31**.

### Default Behavior

If no version is specified in the URL path, the request defaults to **v2** for security and stability reasons.

## Version Status

| Version | Status     | Released   | Sunset Date |
| ------- | ---------- | ---------- | ----------- |
| v1      | Deprecated | 2026-01-01 | 2026-12-31  |
| v2      | Active     | 2026-04-01 | —           |

## Deprecation Policy

When a version is deprecated:

1. **Response headers** include deprecation warnings:
   - `Deprecation: true`
   - `Sunset: <date>`
   - `Link: <next-version-docs>; rel="successor-version"`

2. **Console warnings** are logged on the server for deprecated-version requests.

3. A **6-month overlap** period exists where both versions remain functional.

## Breaking Changes

Breaking changes only occur in new major versions. Within a version:

- New fields may be added to responses ( additive )
- Existing fields will not be removed or renamed
- Response codes will not change for existing success paths
- New optional parameters may be added to requests

## v1 Response Freezing

To ensure backward compatibility until the sunset date, **v1 responses are frozen** as of 2026-09-27. This means:

- v1 endpoint responses are guaranteed to remain stable until 2026-12-31
- Any changes to response schemas will only affect v2 endpoints
- Automated CI tests detect drift between v1 and v2 responses
- v1 responses are snapshot-tested to prevent unintended changes

### Key Endpoints with Frozen v1 Responses

The following critical endpoints have frozen v1 response schemas:

- Authentication: `/api/v1/auth/login`, `/api/v1/auth/register`, `/api/v1/auth/refresh`
- Users: `/api/v1/users/me`, `/api/v1/users/me/profile`
- Properties: `/api/v1/properties`, `/api/v1/properties/:id`, `/api/v1/properties/search`
- Transactions: `/api/v1/transactions`, `/api/v1/transactions/:id`
- Search: `/api/v1/search/properties`, `/api/v1/search/suggestions`
- Dashboard: `/api/v1/dashboard`

If you need to add new fields or modify response structures, these changes MUST be version-specific:
- Add new fields only to v2 responses
- Use the `@ApiVersion` decorator to specify version-specific behavior
- Ensure v1 transformers in `backward-compatibility.service` strip v2-only fields

## Migration from v1 to v2

Key differences:

- **URI path versioning is now required** (no more header-based versioning)
- New fields may be present in v2 responses
- Response format standardized across all endpoints
- Enhanced error responses with detailed validation messages

To migrate, update your base URL:

```diff
- GET https://api.propchain.io/api/v1/properties
+ GET https://api.propchain.io/api/v2/properties
```

### Migration Checklist

- [ ] Update all API calls to include version in URL path
- [ ] Remove any `API-Version` or custom `Accept` headers
- [ ] Test your application with v2 endpoints
- [ ] Review v2 response schemas for new fields
- [ ] Update any code that depends on specific field ordering
- [ ] Plan to complete migration before 2026-12-31

## Monitoring Deprecated Usage

Check the URL path in your API calls. If you see `/api/v1/`, migrate to `/api/v2/` before the sunset date.

Additionally, deprecated endpoints return these response headers:
- `Deprecation: true`
- `Sunset: <date>`
- `Warning: 299 - "API version v1 is deprecated and will be sunset in X days"`

## Developer Guidelines

When modifying endpoints that support multiple versions:

1. **Always specify version support** using the `@ApiVersion` decorator
2. **Add new fields only to v2** - never modify v1 response shapes
3. **Use transformers** in `backward-compatibility.service` to strip v2 fields for v1
4. **Run snapshot tests** to ensure v1 responses remain stable
5. **Update this documentation** when adding version-specific behavior

Example of version-specific endpoint:

```typescript
@ApiVersion([ApiVersionEnum.V1, ApiVersionEnum.V2])
@Get('properties')
async getProperties(@GetVersion() version: ApiVersionEnum) {
  const properties = await this.propertiesService.findAll();
  // Return v1-shaped response for v1 requests
  if (version === ApiVersionEnum.V1) {
    return this.backwardCompatibilityService.transformV2ToV1(properties, 'property');
  }
  return properties; // v2 includes all fields
}
```

For questions, contact support@propchain.com.
