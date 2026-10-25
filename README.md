# Smart Study Planner

A study-management web application for students preparing for competitive examinations (SSC, UPSC, BPSC, JEE, NEET, CUET) and university courses. Students organize courses, work through structured syllabuses, build timetables, run focus sessions, track goals, and get AI-assisted help. Administrators manage accounts, courses, syllabus content, study materials, announcements, and platform analytics.

Built against [`prd.md`](./prd.md), which remains the authoritative requirements document.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 (plain JavaScript, `.jsx`), Vite 7, React Router 7, Recharts, axios |
| Backend | Python, Flask 3, Flask Blueprints (app factory pattern) |
| Database | SQLite via Flask-SQLAlchemy, schema managed by Flask-Migrate / Alembic |
| Auth | Flask-JWT-Extended, access + refresh tokens, server-enforced roles |
| Styling | Plain CSS with design tokens, light and dark themes |
| AI | Server-side provider integration with TF-IDF retrieval over uploaded documents |

The API is versioned under `/api/v1/`. The frontend calls relative `/api/v1/...` URLs, so the same build works behind a reverse proxy without an environment-specific base URL.

## Prerequisites

- Python 3.11 or newer (developed on 3.14)
- Node.js 20 or newer (developed on 24)
- npm 10 or newer

## Setup

The project path contains a space, so quote paths in shell commands.

### 1. Backend

```bash
cd "/home/abhi/Apps/Study planner/backend"

python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

cp .env.example .env
# Edit .env and replace SECRET_KEY and JWT_SECRET_KEY with long random strings.
```

Create the schema and load demo data:

```bash
.venv/bin/flask --app run.py db upgrade
.venv/bin/python seed.py
```

`seed.py` is idempotent, so it is safe to re-run. Use `.venv/bin/python seed.py --reset` to clear the demo rows and rebuild them from scratch. The equivalent Flask CLI command is `flask --app run.py seed`.

If you would rather skip migrations for a throwaway local database, `flask --app run.py init-db` creates every table directly. Prefer `db upgrade` for anything you intend to keep.

Start the API:

```bash
.venv/bin/python run.py
```

It listens on `http://127.0.0.1:5000`. Override with `FLASK_RUN_HOST` and `FLASK_RUN_PORT`.

### 2. Frontend

In a second terminal:

```bash
cd "/home/abhi/Apps/Study planner/frontend"

npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` to `http://127.0.0.1:5000`; point it elsewhere with `VITE_API_PROXY_TARGET`.

For a production bundle:

```bash
npm run build      # outputs to frontend/dist
npm run preview    # serves the bundle on port 4173, proxying /api
```

## Demo accounts

Created by the seed script. These are local development credentials only.

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@studyplanner.test` | `Admin@12345` |
| Student | `aarav@studyplanner.test` | `Student@123` |
| Student | `priya@studyplanner.test` | `Student@123` |
| Student | `rohan@studyplanner.test` | `Student@123` |

The seed also creates published courses with subjects, units, and topics, plus enrollments, progress records, tasks, sessions, goals, and notifications, so every page renders real data on first login. Login routes each account to the correct dashboard based on its server-verified role.

## Configuration

All backend configuration comes from environment variables; see [`backend/.env.example`](./backend/.env.example) for the full annotated list.

| Variable | Purpose |
|---|---|
| `SECRET_KEY`, `JWT_SECRET_KEY` | Signing secrets. Set both to distinct long random strings. |
| `DATABASE_URL` | Defaults to SQLite at `backend/instance/app.db`. |
| `JWT_ACCESS_TOKEN_EXPIRES`, `JWT_REFRESH_TOKEN_EXPIRES` | Token lifetimes in seconds. |
| `FRONTEND_ORIGIN` | Comma-separated CORS allowlist. |
| `UPLOAD_FOLDER`, `MAX_UPLOAD_MB` | Upload destination and size ceiling. |
| `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | AI provider selection and credentials. The provider is inferred from whichever key is set. |
| `AI_RATE_LIMIT`, `AI_TIMEOUT_SECONDS`, `AI_MAX_MESSAGE_CHARS`, `AI_RETRIEVAL_TOP_K` | AI guardrails. |
| `EXPOSE_DEV_TOKENS` | Returns email-verification and password-reset tokens in API responses so those flows are testable without SMTP. Keep `false` in production. |

### Running without an AI key

Leave every AI key blank and the application still runs. The assistant reports `ai_configured=false` and answers from your indexed study material instead of calling a provider. Nothing else in the app depends on it. API keys are read server-side only and are never returned to clients or referenced in frontend code.

## Features

### Student

Dashboard with metrics computed from stored records, course browsing and multi-course enrollment, expandable syllabus tree with per-topic status, time spent, notes, priority and revision dates, timetable and study sessions with overlap detection, tasks with priorities and recurrence, deterministic smart-timetable generation, a focus timer whose sessions are validated server-side and whose state survives a page refresh, goals and achievements guarded against duplicate awards, progress analytics, study materials with private uploads, a notification center, and profile and settings.

### Administrator

Platform dashboard, searchable and paginated student management with activate/suspend, course lifecycle (draft, published, archived), subject management, syllabus management with reordering, CSV bulk import, and versioning that migrates student progress forward instead of discarding it, study-material management, announcements, reports and analytics, and audit logs for significant administrative actions.

### Dark mode

Every screen ships in light and dark. The switch sits in the top bar of both the student and admin shells and on the login screen, so the preference can be set before signing in. Profile & Settings has an Appearance card with the full three-way choice:

- **Light** and **Dark** pin the theme.
- **System** follows the device setting and keeps following it, so the app switches when the OS does.

The choice is stored per browser in `localStorage` under `sp-theme` and is not part of the account, so it is not synced across devices. An inline script in `index.html` applies the saved theme before first paint, which avoids a light flash when reloading in dark mode.

Implementation lives in three places: `src/styles/tokens.css` holds both palettes as CSS custom properties, with the dark set overriding the light set under `[data-theme='dark']`; `src/context/ThemeContext.jsx` owns the preference and writes `data-theme` onto `<html>`; `src/components/ui/ThemeToggle.jsx` renders the control. Components never reference a theme — they read tokens, so both palettes come from one file. Solid accent and status fills use separate `--c-*-fill` tokens, kept deep enough in dark mode that white label text still clears AA while links and icons brighten.

## Project structure

```text
backend/
├── app/
│   ├── __init__.py          app factory, CLI commands, error handlers
│   ├── extensions.py
│   ├── models/              26 tables covering PRD section 7
│   ├── auth/                register, login, refresh, verify, reset
│   ├── student/             dashboard, enrollments, profile, settings
│   ├── courses/             published course catalog
│   ├── syllabus/            syllabus tree and topic progress
│   ├── planner/             tasks, study sessions, focus sessions, goals
│   ├── analytics/           student analytics aggregates
│   ├── resources/           study materials and uploads
│   ├── notifications/       notification center
│   ├── ai_assistant/        chat, conversations, document retrieval
│   ├── admin/               all nine admin areas
│   ├── common/              validators, authorization, shared helpers
│   └── seed.py
├── migrations/              Alembic migration history
├── instance/                SQLite database (gitignored)
├── uploads/                 uploaded files (gitignored)
├── config.py
├── requirements.txt
├── run.py
└── seed.py

frontend/
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── app/                 router and route guards
│   ├── context/             auth and theme contexts
│   ├── components/          layouts and shared UI primitives
│   ├── features/            per-domain pages for student and admin
│   ├── services/            axios client and API modules
│   ├── hooks/
│   ├── utils/
│   └── styles/              design tokens (light + dark) and global CSS
├── vite.config.js
└── package.json
```

## Security notes

- Passwords are hashed with Werkzeug's PBKDF2 implementation; plaintext is never stored or returned.
- Role and object-level authorization is enforced in Flask on every protected endpoint. Students can read and write only their own records.
- Student registration cannot create an administrator account under any payload.
- Revoked tokens are rejected, and the frontend transparently refreshes on a 401.
- Uploads are validated by type and size and are served through non-guessable access tokens rather than predictable paths.
- Authentication and AI endpoints are rate limited via Flask-Limiter.
- Significant administrative actions are written to the audit log.
- Secrets live in `.env`, which is gitignored; only `.env.example` is committed.

Use HTTPS, a non-SQLite database if you expect concurrency, `EXPOSE_DEV_TOKENS=false`, and real secrets before deploying anywhere public.

## Troubleshooting

**`npm run dev` loads but every request 401s or fails** — the Flask API is not running, or it is not on port 5000. Start it, or set `VITE_API_PROXY_TARGET`.

**Login rejects the demo credentials** — the seed has not run against the database the app is using. Re-run `.venv/bin/python seed.py`.

**`flask db upgrade` reports no such command** — run it with the app flag from the `backend/` directory: `.venv/bin/flask --app run.py db upgrade`.

**Email verification or password reset is unreachable** — no SMTP provider is configured. With `EXPOSE_DEV_TOKENS=true`, the token is returned in the API response so you can complete the flow manually.
