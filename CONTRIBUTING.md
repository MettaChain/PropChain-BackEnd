# Contributing to PropChain BackEnd

Thank you for helping improve PropChain! This guide explains how to contribute issues and pull requests, what we expect from branches and PRs, and how to run tests and lint locally.

## 1. Report an Issue

If you find a bug or want to request a feature:

1. Search existing issues first to avoid duplicates.
2. Open a new issue with:
   - Clear title
   - Description of the problem or enhancement
   - Steps to reproduce (for bugs)
   - Expected vs actual behavior
   - Relevant environment, logs, or screenshots

## 2. Start a Branch

Create branches from `main` and use a descriptive, consistent branch name:

- `feature/<ticket-number>-<short-description>`
- `bugfix/<ticket-number>-<short-description>`
- `fix/<ticket-number>-<short-description>`
- `chore/<short-description>`

Examples:

- `feature/123-add-login-rate-limiting`
- `bugfix/456-fix-dispute-controller-roles`
- `chore/update-prisma-schema`

Branch names should be lowercase, use hyphens, and briefly describe the change.

## 3. Work on Your Change

Use the existing repo scripts and conventions:

- Install dependencies: `npm install`
- Start development mode: `npm run start:dev`
- Generate Prisma client: `npm run db:generate`
- Run migrations locally: `npm run migrate`
- Reset migrations when needed: `npm run migrate:reset`

Keep each PR focused on a single issue or feature whenever possible.

## 4. Run Tests and Lint Locally

Before opening a PR, run the relevant checks:

- Run all tests: `npm test`
- Run tests in watch mode: `npm run test:watch`
- Run test coverage: `npm run test:cov`
- Run lint and apply automatic fixes: `npm run lint`
- Format code: `npm run format`

If your change touches database schema or Prisma models, update the schema and run:

```bash
npm run db:generate
npm run migrate
```

## 5. Pull Request Expectations

When you open a PR, please include:

- A descriptive title
- A short summary of the change
- Related issue number(s)
- Testing steps and commands run locally
- Any setup notes such as environment variables or migrations
- Screenshots or API request examples when relevant

A good PR should be:

- Small and focused
- Based on an up-to-date `main`
- Passing tests and lint checks
- Clear about the problem and the solution

## 6. Review and Feedback

- Link the PR to the related issue when available.
- Keep discussion in the PR thread.
- Address feedback promptly by updating the branch.
- Rebase or merge `main` if needed to resolve conflicts.

## 7. Code Style and Standards

This repository uses ESLint and Prettier.

- Follow existing code patterns and module boundaries.
- Keep naming clear and consistent.
- Prefer small, testable changes.
- Avoid commented-out code in production commits.

## 8. Additional Notes

- If your change involves database migrations, include migration details in the PR.
- If you add or update docs, link them from the PR description.
- Make sure environment variables are not committed.

Thank you for contributing to PropChain!
