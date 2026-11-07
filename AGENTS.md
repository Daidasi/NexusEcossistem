# NexusEcosystem engineering contract

- Work only in this repository; preserve other projects and main. Use a feature branch and PR; never merge automatically.
- Modules: NexusCore (domain/orchestration), NexusBridge (official provider adapters), NexusMemory (context/provenance/permissions), NexusInterface (React), storage and identity as explicit backend boundaries.
- Never commit secrets, local databases, sessions, API outputs containing personal data, or .env files. Never log SDK errors or request bodies.
- Consumer ChatGPT/Claude/Gemini accounts and their memories are not API connections. Never fake native account integration.
- Provider simulations are test-only dependency injection. No production mock mode, sample AI replies, automatic spending, or test credentials.
- Every operation authorizes its actor. Keep scope isolation, owner-specific credentials, bounded costs, auditable recipient context and revocation/history filtering intact.
- Run lint, typecheck, build, unit/integration/adversarial tests. Execute PostgreSQL concurrency tests and desktop/mobile browser tests when infrastructure permits. Record what was not verified.
- Critically review architecture, security, privacy, UX, costs and reliability. Fix substantive findings before recommending merge. A claimed quality score cannot substitute for evidence.
- Record checkpoints and remaining blockers in docs/VALIDATION.md. Never assert live provider or physical Android verification without actual execution.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
