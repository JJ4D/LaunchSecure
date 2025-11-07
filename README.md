# LaunchSecure Platform

LaunchSecure is an experimental compliance automation platform that unifies infrastructure scanning, findings triage, and client collaboration into one workflow. The current MVP focuses on orchestrating [Steampipe](https://steampipe.io/) and [Powerpipe](https://steampipe.io/powerpipe) scans, persisting benchmark results, and exposing them through a multi-tenant dashboard.

## High-Level Architecture

The platform is organised as a set of Dockerised services (see `docker-compose.yml`):

- **Admin Panel (`platform/admin-panel`)** — Next.js 14 + Tailwind UI for super-admins and client users. Handles authentication, dashboards, findings review, and remediation updates.
- **Orchestrator API (`platform/orchestrator`)** — TypeScript Express service that manages tenants, credentials, scan execution, and reporting. Talks to the database and triggers Powerpipe runs.
- **Steampipe + Powerpipe (`platform/steampipe-powerpipe`)** — Executes compliance benchmarks against cloud providers, exposing Steampipe on port `9193`.
- **PostgreSQL (`platform/database`)** — Stores clients, credentials, scans, findings, and reporting metadata. Schema and migrations live in `platform/database`.

Additional documentation lives under `docs/` and captures roadmap, verification strategy, and implementation notes.

### Data Flow Snapshot

1. Admin triggers a compliance scan from the dashboard.
2. Orchestrator calls Powerpipe (via Docker) which uses Steampipe to query cloud resources.
3. Powerpipe emits benchmark JSON; orchestrator parses and persists results.
4. Findings and scan history surface in the Admin Panel for remediation tracking and reporting.

## Getting Started

### Prerequisites

- Docker Desktop (with Compose plugin)
- Node.js 20+ (for local development outside Docker)
- Git and GitHub CLI (recommended for repository management)

### Quick Start (Docker Compose)

```bash
git clone https://github.com/JJ4D/LaunchSecure.git
cd LaunchSecure
# create a .env file with your secrets if you need overrides
docker compose up --build
```

Services expose the following ports locally:

- Admin Panel: `http://localhost:3000`
- Orchestrator API: `http://localhost:3001`
- PostgreSQL: `localhost:5432`
- Steampipe service: `localhost:9193`

> **Note:** The orchestrator requires an `ENCRYPTION_KEY` environment variable for encrypting cloud credentials. Set one in your shell or `.env` before starting services (`openssl rand -hex 32` is a good default).

### Running Services Individually

Each service can be developed outside Docker:

```bash
# Admin Panel
cd platform/admin-panel
npm install
npm run dev

# Orchestrator API
cd platform/orchestrator
npm install
npm run dev
```

Ensure PostgreSQL and Steampipe/Powerpipe are reachable; the included Docker Compose is the simplest option.

## Key Features Implemented

- Multi-tenant client management with credential encryption (`platform/orchestrator/src/lib/crypto.ts`)
- Scan scheduling and Powerpipe benchmark execution (`platform/orchestrator/src/api/scans.ts`)
- Findings persistence, deduplication migrations, and remediation history
- Next.js dashboard flows for login, client views, findings detail, and trend visualisations (`platform/admin-panel/src/app`)
- Automated database bootstrapping via `platform/database/init.sql` and incremental migrations

## Environment & Secrets

- Application secrets (JWT signing keys, encryption keys, API tokens) must **not** be committed. Store them in `.env` files kept outside version control.
- For local development, use safe placeholder values; rotate and protect them in production (e.g. use GitHub Actions secrets or HashiCorp Vault).
- The Docker setup mounts the host Docker socket for scan execution. Restrict access to trusted users only.

## Testing & Tooling

- Admin Panel uses Next.js linting (`npm run lint`).
- Orchestrator exposes `npm run type-check` and unit testing can be added via Jest.
- `test-api.ps1` contains sample PowerShell probes for API smoke tests.

## Documentation Map

- `docs/PRODUCT_SPECIFICATION.md` — end-to-end product vision and MVP scope.
- `docs/SAFE_IMPLEMENTATION_PLAN.md` — security automation and maturity path.
- `docs/VERIFICATION_IMPLEMENTATION.md` — verification automation goals.
- `docs/CROSS_VERIFICATION_STRATEGY.md` — redundancy and control validation design.
- `docs/README_ENV_SETUP.md` — environment configuration walkthrough.
- `docs/HOT_RELOAD_SETUP.md` — dev hot reload guidance.
- `docs/FRAMEWORK_DB_DATA_SOURCES.md` & `docs/FRAMEWORK_COVERAGE_DB_IMPLEMENTATION.md` — database coverage details.
- `docs/VERIFICATION_STRATEGY.md` & `docs/VERIFICATION_FRAMEWORK.md` — compliance verification references.

## Contributing / Next Steps

1. Create feature branches off `main`.
2. Run linting + type checks before pushing.
3. Open Pull Requests with context and testing notes.
4. Use GitHub Issues or Projects for roadmap tracking as the MVP matures.

---

This README reflects the current MVP state and will evolve as LaunchSecure moves toward production readiness.


