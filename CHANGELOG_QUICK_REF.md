# Changelog Quick Reference

**Short guide for contributors on updating the changelog.**

---

## Quick Start: Adding an Entry

### Before Merging Your PR

1. Open `CHANGELOG.md` at project root
2. Find the `## [Unreleased]` section
3. Add your entry under the appropriate category
4. Include your PR number
5. Commit with your code changes

---

## Example Entries

### Feature (Added)
```markdown
### Added
- Email digest scheduling for daily/weekly property updates [#445](link)
```

### Bug Fix (Fixed)
```markdown
### Fixed
- Fixed race condition in document uploads [#456](link)
```

### Breaking Change (Removed + version bump)
```markdown
### Removed
- Dropped support for Node.js 14.x (minimum now 16.x)
```

### Security Patch (Security)
```markdown
### Security
- Patched SQL injection vulnerability in search queries [#457](link)
```

---

## Categories Reference

| Category | When to Use | Example |
|----------|------------|---------|
| **Added** | New feature or capability | "Email digest scheduling" |
| **Changed** | Modified existing behavior | "Updated auth to require MFA" |
| **Deprecated** | Scheduled for removal | "Legacy REST API v1" |
| **Removed** | Deleted functionality | "Removed password-only login" |
| **Fixed** | Bug fixes | "Fixed race condition in uploads" |
| **Security** | Vulnerability fixes | "Patched SQL injection" |

---

## Format Rules

- ✅ Use present tense: "Add feature", "Fix bug"
- ✅ Be specific: "Email digest scheduling" not "Updated system"
- ✅ Include PR link: `[#123](url)`
- ✅ User-focused: Explain the benefit
- ❌ Don't include code refactoring (internal only)
- ❌ Don't use commit messages as-is (too technical)

---

## Release Checklist (Release Manager)

When releasing version X.Y.Z:

- [ ] Review all `[Unreleased]` entries
- [ ] Update version in `package.json` to X.Y.Z
- [ ] Rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`
- [ ] Delete empty sections
- [ ] Create new `## [Unreleased]` section
- [ ] Commit: `git commit -m "Release vX.Y.Z"`
- [ ] Tag: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
- [ ] Push: `git push origin main --tags`

---

## Semantic Versioning Quick Reference

- **MAJOR** (X.0.0): Breaking changes → Use when removing features/APIs
- **MINOR** (1.X.0): New features (backward compatible)
- **PATCH** (1.0.X): Bug fixes (backward compatible)

Example: v1.2.3 = Major version 1, Minor version 2, Patch 3

---

## Need Help?

- Full guide: See [docs/CHANGELOG_GUIDE.md](../docs/CHANGELOG_GUIDE.md)
- Reference: [keepachangelog.com](https://keepachangelog.com/)
- Versioning: [semver.org](https://semver.org/)

