# API Versioning — Consumer Guide

## Overview

PropChain uses URL-based API versioning. The current version is **v2** (active). **v1** is deprecated and will sunset on **2026-12-31**.

## Specifying a Version

### Option 1: URL Path (Recommended)

```
GET /api/v2/properties
GET /api/v2/users/me
```

### Option 2: Accept Header

```
Accept: application/vnd.propchain.v2+json
```

### Option 3: Custom Header

```
X-API-Version: v2
```

If no version is specified, the request defaults to **v2**.

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

## Migration from v1 to v2

Key differences:

- Versioning headers now included in all responses
- New endpoint decorators available: `@ApiVersion('v2')`
- Response format standardized across all endpoints

To migrate, update your base URL:

```diff
- GET https://api.propchain.io/api/v1/properties
+ GET https://api.propchain.io/api/v2/properties
```

## Monitoring Deprecated Usage

Check the `X-API-Version` header in your requests. If you see `v1`, migrate to `v2` before the sunset date.

For questions, contact support@propchain.com.
