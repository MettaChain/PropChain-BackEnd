# Changelog Maintenance Guide

## Overview

This guide explains how to maintain the project changelog for PropChain-BackEnd. The changelog documents all notable changes to the project, organized by release versions.

---

## 📍 Changelog Location

- **File**: `CHANGELOG.md` (root directory)
- **Format**: Markdown
- **Convention**: [Keep a Changelog](https://keepachangelog.com/) standard + [Semantic Versioning](https://semver.org/)

---

## 📋 Changelog Format

### File Structure

```markdown
# Changelog

All notable changes to PropChain-BackEnd are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- New features

### Changed
- Changes in existing functionality

### Deprecated
- Features marked for removal

### Removed
- Features removed in this version

### Fixed
- Bug fixes

### Security
- Security vulnerability fixes

## [1.0.0] - 2026-06-01

### Added
- ...

### Fixed
- ...
```

### Section Definitions

| Section | Purpose | Example |
|---------|---------|---------|
| **Added** | New features and enhancements | "New blockchain integration for property transactions" |
| **Changed** | Changes to existing functionality | "Updated authentication flow to support OAuth" |
| **Deprecated** | Features marked for removal in future versions | "Legacy REST API endpoints deprecated in favor of GraphQL" |
| **Removed** | Removed functionality | "Removed v1 API endpoints" |
| **Fixed** | Bug fixes | "Fixed race condition in document upload" |
| **Security** | Security vulnerability fixes | "Fixed SQL injection vulnerability in search" |

---

## 🔄 Release Process & Workflow

### Step 1: Maintain Unreleased Section During Development

As features are developed and merged to `main` branch:

1. **Update Changelog Immediately After Merge**
   - Add entry to appropriate section under `[Unreleased]`
   - Use clear, user-friendly language (not commit messages)
   - Group related changes

2. **Example During Development**
   ```markdown
   ## [Unreleased]

   ### Added
   - Blockchain transaction recording with hash generation
   - Email digest scheduling system
   - Document metadata search indexing

   ### Fixed
   - Race condition in concurrent document uploads
   - Incorrect user role checks in disputes controller
   ```

### Step 2: Prepare Release

When preparing a release (typically triggered by release branch or tag):

1. **Decide Version Number**
   - Use Semantic Versioning: `MAJOR.MINOR.PATCH`
   - `MAJOR`: Breaking changes
   - `MINOR`: New features (backward compatible)
   - `PATCH`: Bug fixes (backward compatible)

2. **Rename [Unreleased] to Version & Date**
   ```markdown
   ## [1.1.0] - 2026-06-15
   ```
   - Use ISO 8601 date format: `YYYY-MM-DD`

3. **Remove Empty Sections**
   - Only include sections with entries
   - Remove sections with no changes

4. **Create New [Unreleased] Section**
   ```markdown
   ## [Unreleased]

   ### Added

   ### Changed

   ### Deprecated

   ### Removed

   ### Fixed

   ### Security
   ```

### Step 3: Commit Release

```bash
# Update changelog with new version
git add CHANGELOG.md

# Create commit with version tag
git commit -m "Release v1.1.0: changelog update"

# Tag the release
git tag -a v1.1.0 -m "Release version 1.1.0"

# Push changes and tags
git push origin main --tags
```

---

## 📝 Writing Guidelines

### Do's ✅

- **Be specific**: "Added email digest scheduling for user notifications" ✅
- **Use present tense**: "Add feature" not "Added feature" ✅
- **Focus on user impact**: Explain what users/developers benefit from
- **Group by category**: All features together, all fixes together
- **Link to PRs**: Reference PR numbers: "Fixed issue [#123](link)"
- **Be consistent**: Use same terminology and voice throughout

### Don'ts ❌

- **Use commit messages as-is**: Too technical ❌
  - Bad: "refactor: optimize db queries in user service"
  - Good: "Improved performance of user search queries by 40%"

- **Include internal refactoring**: Unless it impacts functionality ❌
  - Bad: "Moved utilities from utils.ts to helpers.ts"
  - Good: (Omit this)

- **Make it too verbose**: Keep entries concise ❌
  - Bad: "After careful consideration of multiple approaches and extensive testing, we have implemented a comprehensive new system..."
  - Good: "Implemented new transaction verification system with blockchain confirmation checking"

- **Mix versions**: Each version gets its own section ❌

---

## 📚 Examples

### Example 1: Simple Feature Addition

```markdown
### Added
- New property comparison feature allowing users to compare up to 5 properties side-by-side
- Email digest scheduling for daily/weekly property updates
```

### Example 2: Bug Fix with Security Implications

```markdown
### Fixed
- Fixed race condition in concurrent document uploads that could corrupt file metadata
- Prevented unauthorized access to document previews via URL manipulation [#456](https://github.com/MettaChain/PropChain-BackEnd/pull/456)

### Security
- Validated all file type uploads to prevent malicious script execution
```

### Example 3: Deprecation Notice

```markdown
### Deprecated
- Legacy REST API endpoints `/api/v1/properties` - use GraphQL `/graphql` instead
- Password-based authentication without MFA - required for new accounts in v2.0.0

### Changed
- Improved MFA setup flow to guide users through phone verification
```

### Example 4: Major Release Update

```markdown
## [2.0.0] - 2026-09-01

### Added
- Graphql API with full query and mutation support
- Document encryption at rest with AES-256
- Advanced fraud detection system with ML-based anomaly detection

### Changed
- Migrated from REST to GraphQL as primary API
- Authentication now requires MFA for all users
- Database schema optimized for improved query performance

### Deprecated
- REST API v1 endpoints (will be removed in v3.0.0)

### Removed
- Support for Node.js 14.x (minimum now 16.x)
- Legacy password reset flow

### Fixed
- Memory leak in websocket connection handling
- Incorrect calculation of property tax estimates

### Security
- Updated all dependencies to address CVE vulnerabilities
- Implemented rate limiting on authentication endpoints (5 attempts/15 minutes)
```

---

## 🧑‍💻 Contributor Workflow

### For Feature Developers

1. **During Development**
   - Create feature branch: `git checkout -b feat/new-feature`
   - Implement feature with tests
   - Do NOT modify CHANGELOG.md yet

2. **Before Opening PR**
   - Update CHANGELOG.md in the `[Unreleased]` section
   - Add entry under appropriate category (Added, Changed, etc.)
   - Include PR number: `[#123]`
   - Example:
     ```markdown
     ### Added
     - New email digest scheduling system [#445](https://github.com/MettaChain/PropChain-BackEnd/pull/445)
     ```

3. **PR Checklist**
   - [ ] Code changes committed
   - [ ] Tests added/updated
   - [ ] CHANGELOG.md updated
   - [ ] PR title follows convention: `feat:`, `fix:`, `docs:`, etc.
   - [ ] PR description includes acceptance criteria

4. **After PR Merge**
   - Changelog is automatically included in next release
   - No additional action needed

### For Release Managers

1. **Planning Release**
   - Review all entries in `[Unreleased]` section
   - Verify entries are user-focused and clear
   - Plan release date based on feature completeness

2. **Executing Release**
   - [ ] Update version in `package.json`
   - [ ] Rename `[Unreleased]` to `[VERSION] - YYYY-MM-DD`
   - [ ] Remove empty sections
   - [ ] Create fresh `[Unreleased]` section
   - [ ] Commit: `git commit -m "Release vX.Y.Z"`
   - [ ] Tag: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
   - [ ] Push: `git push origin main --tags`
   - [ ] Update GitHub releases page with changelog content

3. **Post-Release**
   - Verify tag created correctly: `git tag -l vX.Y.Z`
   - Verify CI/CD pipeline triggered
   - Monitor for issues and patches

---

## 🚀 Automation & Tools (Optional)

### Git Hooks (Pre-commit)

You can add a pre-commit hook to validate changelog format:

**File**: `.git/hooks/pre-commit`
```bash
#!/bin/bash

# Validate CHANGELOG.md exists and contains [Unreleased] section
if [ -f "CHANGELOG.md" ]; then
    if ! grep -q "^## \[Unreleased\]$" CHANGELOG.md; then
        echo "Error: CHANGELOG.md missing [Unreleased] section"
        exit 1
    fi
fi

exit 0
```

### Conventional Commits Integration

Link commit messages to changelog entries:
- Commits starting with `feat:` → Added section
- Commits starting with `fix:` → Fixed section
- Commits starting with `docs:` → (skip changelog)
- Commits starting with `chore:` → (skip changelog)

Example:
```bash
git commit -m "feat: add email digest scheduling system"
# Then add to CHANGELOG.md: "- Email digest scheduling for user notifications"
```

---

## 📖 References

- [Keep a Changelog](https://keepachangelog.com/)
- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)

---

## 🔗 Related Documentation

- [Release Process Documentation](./IMPLEMENTATION_SUMMARY.md)
- [Git Workflow & Branching](./README.md)
- [Version Management](../package.json)

---

## FAQ

**Q: Should I update CHANGELOG.md in a separate commit from code changes?**
A: No - include changelog updates in the same commit/PR as the feature. This keeps related changes together.

**Q: What if a feature is reverted?**
A: Remove the entry from `[Unreleased]` when it's reverted. No explanation needed in changelog.

**Q: How do I document breaking changes?**
A: Use the `Removed` section for removed features, and `Changed` section for modified functionality. Consider `MAJOR` version bump for breaking changes.

**Q: Can I modify released changelog entries?**
A: Only for typos/clarity. Never change what was released - it's historical documentation.

**Q: Should I add entries for internal refactoring?**
A: Only if it affects user experience, performance, or API. Pure code refactoring is not changelog-worthy.

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-06-01 | 1.0 | Initial changelog guide documentation |

