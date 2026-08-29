---
name: web-implementation
description: >-
  Implements APIs, workers, queues, and diagnostics for the Latex preview and
  ingestion service. Use when changing routes, jobs, media processing, or data.
---

# Web implementation

## Stack

- Next.js 15 App Router with TypeScript and Node.js
- Tailwind CSS for diagnostics
- PostgreSQL with Drizzle ORM
- Shared-secret authentication for Latex-to-worker calls
- pnpm; self-hosted under PM2

## Layout and conventions

- Route handlers: `src/app/api/`
- Domain logic: `src/lib/`
- Drizzle schema: `src/db/schema.ts`
- Validate every API boundary with Zod.
- Keep external binaries and LAN services behind focused `src/lib/` modules.
- Keep queue state durable in PostgreSQL and serialize non-concurrent services.
- Add environment variables to `.env.example`; never commit secrets.
- Apply schema changes with `pnpm db:push`.

## Verification

Read `.cursor/skills/web-testing/SKILL.md`, then run its checks before handoff.
