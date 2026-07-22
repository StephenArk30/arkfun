# Backend / Server Project Notes

Short reference for the tech-selection decisions that matter most on a backend project and are easy to get wrong silently. Consult this during Stage 0 / Stage 1 of `SKILL.md` before locking in choices. These decisions are especially expensive to reverse — data layers and storage tend to get deeply woven into business logic.

## Database selection

Pick the database deliberately based on the data shape and access patterns, not on "what I know". The common, safe defaults:

- **PostgreSQL** is the strong default for most general-purpose backends. It's a genuinely excellent relational DB — strict, feature-rich (JSONB, full-text search, extensions like PostGIS), and battle-tested. If you don't have a specific reason to pick something else, pick Postgres.
- **MySQL** is also fine and very widely deployed; choose it when the team/org standardizes on it.
- **SQLite** is excellent for single-node services, embedded use, local dev, and tests. Underrated. Not suitable for multi-writer horizontal scale.
- **MongoDB / document stores**: only when the data is genuinely document-shaped and joins are rare. Don't pick a document DB and then immediately need transactions and joins — that's the classic NoSQL regret.
- **Redis**: as a cache / queue / session store, not the primary system of record.
- **Specialized**: time-series (TimescaleDB, ClickHouse), graph (Neo4j), search (Elasticsearch, Meilisearch) — only when the access pattern actually demands it.

Ask the user about expected scale, data shape, and consistency requirements. Default to Postgres when the answer is "normal CRUD / business app".

## ORM selection

The ORM choice shapes how all data access code is written, so it's hard to reverse. The real tradeoff is **query ergonomics & safety vs. control & performance**:

- **Type-safe query builders / ORMs** are strongly preferred — they align with the "strong typing" principle and catch SQL bugs at compile time.
  - TypeScript/Node: **Prisma** (schema-first, great DX, type-safe), **Drizzle** (SQL-like, lighter, type-safe), **Kysely** (query builder, type-safe, no magic). TypeORM is older and more error-prone; prefer the others for new work.
  - Python: **SQLAlchemy** (the standard; use the 2.0 typed style), with **Alembic** for migrations.
  - Go: **sqlc** (generates typed Go from SQL — favored for control + type safety), **GORM** (more traditional ORM, heavier), **ent** (Facebook's codegen ORM).
  - Rust: **sqlx** (compile-time checked SQL), **SeaORM** / **diesel**.
- **Raw SQL / query builders** (e.g. `pg`, `knex`, Go `database/sql`): more control, less magic, but you lose type safety and have to write more boilerplate. Reasonable for perf-critical paths or when the ORM gets in the way — but don't default to raw SQL for a whole app; the type safety of a good ORM is worth a lot.

Regardless of choice, **set up migrations from day one** (Prisma migrate, Alembic, golang-migrate, sqlx migrate, etc.). Managing schema by hand-editing the DB is how production drifts from code and deployments break. Migrations should be version-controlled, reviewed, and runnable in both directions.

## Object / file storage

Decide early whether the project needs to store user-uploaded files or generated blobs (images, documents, exports, backups). Bolting storage on later means retrofitting upload paths, access control, and URLs through already-written code.

Questions to settle with the user:

- **Is there file storage at all?** Many backends never need it. If not, skip this.
- **Self-hosted object store**: **MinIO** is the standard S3-compatible self-hosted option. Good when you need control, on-prem, or want to avoid cloud egress costs. Runs in a container, speaks the S3 API so client code is portable.
- **Cloud object store**: AWS S3, Google Cloud Storage, Azure Blob — pick based on the cloud the project already runs on. S3 is the de facto standard and most tooling speaks its API.
- **Filesystem**: only acceptable for single-node, non-critical, non-shared state. Don't write uploaded files to local disk on a horizontally-scaled service — instances don't share filesystems and a restart can lose them.

Abstract behind a storage interface (a thin "ObjectStore" port) so the backend talks to S3/MinIO uniformly and the underlying implementation can swap. Since MinIO speaks the S3 API, you can develop against MinIO locally and run against S3 in prod with the same code — take advantage of this.

Also decide: signed URLs for direct client uploads (saves backend bandwidth) vs. proxied uploads through the backend (simpler auth, more backend load). For anything non-trivial, signed URLs are usually the right call.

## Other backend baseline considerations

Beyond storage, a few things worth setting up early because they're cheap now and annoying later:

- **Structured logging**: not `console.log` / `print`. JSON logs with request IDs. The framework/language has a standard library for this — use it.
- **Health & readiness endpoints**: needed by orchestrators (k8s, ECS) and by the smoke tests from `SKILL.md` Stage 2.
- **Config via env vars / config files**, not hardcoded values. Twelve-factor style.
- **A real HTTP framework** rather than hand-parsing requests — Express/Fastify (Node), FastAPI (Python), Gin/Echo/Fiber (Go), Axum/Actix (Rust). Don't hand-roll routing and middleware.

These aren't strictly "tech selection" but they're part of the baseline the startup skill is establishing, so set them during scaffolding.
