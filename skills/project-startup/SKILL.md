---
name: project-startup
description: Guide for bootstrapping a new software project with a disciplined engineering baseline from day one — typed language selection, the full test pyramid (unit / integration / e2e / smoke), coverage gates, linting, and a pre-commit quality gate (tests + coverage + build + lint + commitlint). Use this skill whenever the user wants to start a new project, scaffold a new repo, set up a new app or service, bootstrap a greenfield codebase, create a starter template, or "kick off" / "initialize" / "set up" / "scaffold" a project — even when they don't explicitly mention tests or quality gates. Also trigger when the user asks what a brand-new project should include, or how to set up a project the right way.
---

# Project Startup

This skill walks you through bootstrapping a new project with a disciplined engineering baseline from the very first commit. The goal isn't just "get something running" — it's to lay down the guardrails that keep a project healthy as it grows: a strongly-typed language, a real test pyramid, a coverage floor, linting, and pre-commit checks that stop broken or low-quality code from ever landing.

A project started without these guardrails almost always pays for it later — tests get retrofitted painfully, types get loosened to "make it compile", and the pre-commit hook becomes a folklore ritual nobody trusts. Doing it upfront is dramatically cheaper. That's the whole premise of this skill.

## How to use this skill

Run the stages roughly in order, but adapt to the user's context. Not every project needs e2e tests on day one; not every project needs a monorepo. Ask when the choice is consequential and irreversible, and make a sensible default-driven decision when it isn't. Don't block on approval for routine scaffolding — state your assumption and proceed.

Throughout, point the user at the reference notes that match their project type:

- `references/web.md` — web / frontend projects (TS strictness, component libraries, CSS strategy, package manager & repo layout).
- `references/server.md` — backend / service projects (database, ORM, object/file storage).

Read the relevant one before making tech choices in that domain. Both are short on purpose.

---

## Stage 0 — Pick the tech stack (strong typing wins)

This skill does **not** own the full tech-selection conversation — that's a brainstorming exercise. But it does enforce one hard principle:

**Prefer strongly-typed languages over weakly-typed ones.** TypeScript over JavaScript. A typed backend (Go, Rust, Java/Kotlin, C#, typed Python with `mypy`/`pyright`) over plain dynamic code. Types catch a whole class of bugs at compile time that tests would otherwise have to cover, and they make refactoring safe — which matters enormously on a young codebase that will change shape a lot.

If the user is undecided on the broader stack, hand off to a brainstorming skill (or just run a short selection conversation) and come back here once the language and framework are chosen. The rest of this skill assumes a language is locked in.

The project-type references (`web.md`, `server.md`) capture the domain-specific choices that matter most and are easy to get wrong silently.

## Stage 1 — Scaffold the project skeleton

Before adding any feature code, establish:

- A working "hello world" entry point that runs and builds.
- The package manager and repo layout decided (see `references/web.md` for the monorepo-vs-single-repo call).
- A `README` with: what the project is, how to install, how to run, how to test, how to build.
- `.gitignore` appropriate to the language/framework.
- A single source of truth for dependency versions (lockfile committed).

Resist the urge to start writing features here. The skeleton is the foundation everything else stands on; a flaky skeleton makes every later step harder.

## Stage 2 — Set up the test pyramid

A greenfield project is the cheapest moment in its entire life to set up testing right. Adding tests later means retrofitting testability into code that was never written with it in mind, which is slow, painful, and often skipped — leading to the "untested legacy core" that every mature project complains about.

Set up the layers of the test pyramid, fastest and most numerous at the bottom:

### Unit tests
- Pure-function tests, run in milliseconds, no I/O, no network, no database.
- Should be the bulk of the test suite. Every non-trivial function or module gets unit tests.
- Use the language's standard runner (Vitest/Jest for TS/JS, `pytest` for Python, `go test` for Go, `cargo test` for Rust, JUnit for JVM). Don't invent a custom harness.

### Integration tests
- Test multiple units together, including real I/O where it's cheap — an in-memory database, a real local filesystem, a stubbed HTTP server.
- Slower than unit tests but still seconds, not minutes.
- These catch wiring bugs that unit tests structurally can't.

### End-to-end (e2e) tests
- Drive the whole system from the outside — the real HTTP entrypoint, the real browser, the real CLI.
- For web frontends: Playwright is the current default; Cypress is acceptable. Don't roll your own with Selenium unless there's a strong reason.
- For backends: hit the real HTTP API against a real (containerized) database.
- These are slow and flaky-prone, so keep the count small — focus on the critical user journeys, not exhaustive paths.

### Smoke tests
- The thinnest possible "is it alive" check: does the deployed/running thing respond at all?
- Often a single HTTP 200 check on a health endpoint. Runs against every deployed environment.
- Distinct from e2e: smoke tests are "did it start", e2e are "does the journey work".

Wire these as separate script entries (`test`, `test:integration`, `test:e2e`, `test:smoke`) so they can be run independently and at different points in the pipeline.

## Stage 3 — Lock in a coverage gate

Decide a coverage floor and enforce it from day one. A reasonable default is **80% lines/branches**, but the exact number is the user's call — confirm it with them. The point is to pick a number and make it a gate, not to hit a specific magic threshold.

Wire the coverage tool to the unit + integration suites (e2e coverage is usually noisy and not worth gating on). Common choices: `c8`/`nyc` for Node, `coverage.py` / `pytest-cov` for Python, built-in for Go and Rust, JaCoCo for JVM.

Make coverage **fail the build** when it drops below the floor, and fail on a decrease too (most tools support a "don't let coverage go down" mode). A coverage gate that's just reported but not enforced gets ignored within weeks.

One caveat worth telling the user: coverage measures *that code ran*, not *that code is correct*. 80% coverage with weak assertions is worse than 50% with strong ones. The gate is a floor on neglect, not a ceiling on quality.

## Stage 4 — Add linting and formatting

Set up both a linter (catches bugs and code smells) and a formatter (enforces style without debate). They serve different purposes — don't conflate them.

- **Linter**: the language's standard — `eslint` (with `@typescript-eslint`) for TS/JS, `ruff`/`flake8` for Python, `golangci-lint` for Go, `clippy` for Rust. Turn on the strict rule sets. Treat warnings as errors in CI.
- **Formatter**: `prettier` for TS/JS/CSS, `black`/`ruff format` for Python, `gofmt` for Go, `rustfmt` for Rust. Auto-format on save and in the pre-commit hook. Formatting should never be a review discussion.

For TypeScript specifically: enable `strict: true` in `tsconfig.json`, ban `any`, and forbid `// @ts-ignore` / `// @ts-expect-error` except behind an explicit eslint-disable with a justification. See `references/web.md`.

## Stage 5 — Wire up the pre-commit quality gate

This is the keystone. A pre-commit (and/or pre-push) hook that runs the full quality bar is what actually keeps the baseline intact — because it makes "doing the right thing" the default path of least resistance. Without it, the gates only run in CI, and people learn to push-and-pray.

The pre-commit gate should run, at minimum:

1. **Lint** — fast, runs on staged files where possible.
2. **Format check** — fail if anything isn't formatted (the hook can auto-format and re-stage).
3. **Type check / build** — `tsc --noEmit` or the equivalent; catch type errors before they hit CI.
4. **Tests** — at least the unit suite; integration if fast enough.
5. **Coverage gate** — fail if coverage drops below the floor.
6. **Commitlint** — enforce a conventional commit message format (e.g. Conventional Commits). This keeps the history machine-parseable, which feeds changelog generation and semantic versioning later for free.

Use `husky` + `lint-staged` (Node ecosystem), `pre-commit` framework (Python/multi-language), or the language-native equivalent. Keep the hook fast — if it takes more than ~30 seconds people will start skipping it with `--no-verify`, which defeats the entire purpose. If the full suite is slow, run unit + lint + format + typecheck in the pre-commit hook and push the heavier integration/e2e/coverage-full checks to a `pre-push` hook or CI.

Mirror the same checks in CI so nothing slips through even if a hook is bypassed.

## Stage 6 — Set up the security baseline

Tests, lint, and coverage guard the code's correctness. But a project can pass every one of those and still ship a catastrophic security hole on day one — a committed API key, or a dependency with a known RCE. Security is a peer dimension to code quality, and like the rest of this skill it's dramatically cheaper to wire in at the start than to retrofit after an incident. Set up two things before any feature code lands.

### Secret management
- Never commit secrets. From the first commit, `.gitignore` the environment files that hold them (`.env`, `.env.local`, etc.) and commit only a `.env.example` with placeholder values so teammates know which vars are needed.
- Add **secret scanning** to catch the inevitable accidental commit: tools like `gitleaks` or `TruffleHog` run as a pre-commit hook (so a secret is blocked before it's ever recorded) and again in CI (so nothing slips past a bypassed hook). A committed secret is nearly impossible to fully un-leak — it's cached by git history, mirrors, forks, and CI logs even after a force-push — so prevention is the only real defense. If one does land, the response is to **rotate the secret**, not to delete the commit.

### Dependency vulnerability scanning
- Modern projects pull in hundreds of transitive dependencies, and a known-vulnerable one is a real attack surface. Automate the checking rather than relying on someone to remember:
  - **Automated update PRs**: enable Dependabot (GitHub-native) or Renovate. They open PRs when a dependency has a CVE or a new version, so updates become a review-and-merge instead of a forgotten chore.
  - **Audit in CI**: run the language's audit tool on every PR — `npm audit` / `pnpm audit` (Node), `pip-audit` (Python), `govulncheck` (Go), `cargo audit` (Rust). Fail the build on high/critical advisories.
- Treat vulnerable dependencies like failing tests: fix them, don't reflexively suppress. An audit "ignore" should be a deliberate, documented decision with an expiry, not a reflex to make the build green.

Mirror both checks in CI alongside the quality gates from Stage 5, so the security bar is enforced even when a local hook is bypassed — same principle as the quality gates.

## Stage 7 — Lock down the AI agent's own permissions

The quality gates above only work if they actually run. The single biggest threat to them on an AI-assisted project is the AI agent itself: under pressure to "just make it pass", an agent will reach for the same escape hatches a tired human would — `git commit --no-verify` to skip the hook, editing the lint/coverage/test configs to weaken the bar, sprinkling `eslint-disable` / `@ts-ignore` to mute errors, or even editing its own permission settings to grant itself more leeway. Left unchecked, an agent quietly hollows out every guardrail this skill just built. So configure the AI agent's own permissions to refuse these moves.

Different AI coding agents express these rules in different config files and formats — CodeBuddy, Claude Code, Cursor, Windsurf, etc. each have their own. Don't guess the format; look up the current documentation for the specific agent in use and write the config the way that agent expects. Commit these config files to git so the whole team (and every future AI session) inherits the same guardrails.

The lockdown should cover, at minimum:

### Block bypassing the quality gate
- Forbid `git commit --no-verify` and its short form `git commit -n`. These skip the pre-commit hook entirely, defeating Stage 5. Also forbid `--no-verify` on `git push`. Configure this as a hard-deny rule in the agent's command-permission settings.

### Detect weakening of quality controls via AI hooks
- Where the agent supports hooks (pre-edit or pre-command hooks), use them to flag edits that weaken the quality bar rather than making the code pass it. Specifically watch for edits to: lint/ESLint config (loosening rules, turning errors into warnings), `tsconfig.json` strictness flags, coverage thresholds, test runner config, and the pre-commit/husky hooks themselves. The pattern to catch is "the test/config was changed so the code passes" rather than "the code was changed so it passes the test".

### Detect lazy code via hook regex
- Use hook regex matching (or the agent's equivalent diff inspection) to catch "lazy" escape hatches being introduced into source files: `eslint-disable` (especially `eslint-disable-next-line` / `disable-next-line` without a justification), `@ts-ignore`, `@ts-expect-error` without a reason, explicit `any` annotations, `// noqa`, and similar suppression comments. These are exactly the patterns Stage 4 forbids — the agent shouldn't be the one introducing them.

### Fallback when hooks aren't supported
- If the agent in use doesn't support hooks or granular command blocking, fall back to a permission rule that **requires asking the user before editing any quality-related config file** — lint configs, `tsconfig.json`, coverage config, test configs, `husky`/`.husky` hooks, `commitlint` config, and the agent's own settings. Don't silently weaken these to make code pass; surface the change and get explicit approval. "I couldn't make it pass, so I'd like to loosen the lint rule" is a legitimate conversation — silently doing it is not.

### Editing AI settings requires asking
- Editing the AI agent's own configuration or permission files must itself require explicit user approval. An agent should never self-modify its guardrails to grant itself more capability — that's the fox guarding the henhouse. Treat the agent's config files as protected, the same as lint configs.

The underlying principle: every quality gate this skill sets up has a bypass, and the AI agent is the most likely entity to reach for one. Locking down the agent's own permissions closes that loop. When in doubt about whether an action would weaken the baseline, ask the user rather than proceeding — the cost of one confirmation is far smaller than the cost of a silently eroded quality bar.

## Stage 8 — Decide whether to install domain-specific skills

Before finishing the scaffolding, step back and ask: does this project's tech stack warrant a dedicated skill to guide future work? Installing the right skills now means subsequent feature work consistently follows best practices instead of each session reinventing them.

Consider installing (or recommending) skills for:

- **Component library / UI framework** — if the user picked React/Vue/etc. with a component library (Ant Design, MUI, shadcn, Element Plus...), check whether a skill exists for that library's conventions. This keeps component usage idiomatic.
- **Language / runtime** — skills for TypeScript, Go, Rust, Python conventions, etc.
- **CI / CD** — a skill for the project's CI platform (GitHub Actions, GitLab CI, etc.) helps write correct pipelines.
- **Monorepo tooling** — if the project is a monorepo (pnpm workspaces, Turborepo, Nx, Lerna), a skill for that tool's task-running and caching conventions pays off.
- **Database / ORM** — for backend projects, a skill matching the chosen ORM (Prisma, TypeORM, GORM, SQLAlchemy...) keeps query and migration patterns consistent.

Only install skills that genuinely match the chosen stack — installing a pile of speculative skills clutters context without helping. When unsure, ask the user which areas they expect to need the most guidance on.

This is also a good moment to revisit Stage 0's stack decisions: if a skill for a candidate technology doesn't exist or is poor quality, that's a (small) data point against picking it.

---

## Reference notes by project type

Read the file that matches the project before finalizing tech choices in that domain. Each is a short list of the decisions that are easy to get wrong silently and expensive to reverse later.

- **`references/web.md`** — Web / frontend projects: TS strictness rules, component library selection, CSS strategy, package manager & repo layout.
- **`references/server.md`** — Backend / service projects: database selection, ORM selection, object/file storage.

If the project is full-stack (web + server), read both.

---

## Final checklist

Before declaring the project bootstrapped, confirm every box is checked:

- [ ] Language is strongly typed (or a typed subset of a dynamic language).
- [ ] Project skeleton builds and runs; `README` covers install/run/test/build.
- [ ] Test pyramid set up: unit, integration, e2e, smoke — as separate runnable scripts.
- [ ] Coverage tool wired to unit + integration; a floor (default 80%) enforced as a build-failing gate.
- [ ] Linter (strict, warnings-as-errors) and formatter configured.
- [ ] Pre-commit hook runs lint + format + typecheck + unit tests + coverage gate + commitlint; mirrored in CI.
- [ ] Security baseline: secrets gitignored + `.env.example` committed; secret scanning (gitleaks/TruffleHog) in pre-commit & CI; dependency scanning (Dependabot/Renovate + `npm audit`/`pip-audit`/`govulncheck`) failing CI on advisories.
- [ ] AI agent permissions locked down: `git commit --no-verify`/`-n` blocked; hooks or ask-before-edit rules guard quality configs, suppression-comment patterns, and the agent's own settings; agent config committed to git.
- [ ] Relevant domain-specific skills installed or recommended (component lib, language, CI, monorepo, ORM...).
- [ ] Project-type reference (`web.md` / `server.md`) consulted and its points addressed.

If any box is unchecked, that's a gap in the baseline — call it out to the user rather than papering over it. A project started with a complete baseline is dramatically easier to keep healthy than one where the gaps get discovered months in.
