# Lead Platform — Backend (Express + MongoDB)

A JSON API for a small sales team's lead management app: a public capture endpoint,
role-based (admin/member) authenticated access, a lead status pipeline, notes, and
an activity trail.

## Stack

- Node.js + Express
- MongoDB + Mongoose
- JWT auth (`jsonwebtoken`), password hashing (`bcryptjs`)
- Validation (`express-validator`)
- Tests: Jest + Supertest + `mongodb-memory-server` (in-memory Mongo, no external DB needed to run tests)

## Getting started

```bash
cp .env.example .env
# edit .env: set MONGODB_URI and JWT_SECRET

npm install
npm run seed   # creates an admin + member account and 3 sample leads
npm run dev    # http://localhost:4000
```

Seeded credentials (override via .env before seeding):

| Role   | Email               | Password       |
|--------|---------------------|----------------|
| admin  | admin@example.com   | Admin12345!    |
| member | member@example.com  | Member12345!   |

## Running tests

```bash
npm test
```

Tests spin up an in-memory MongoDB instance automatically — no separate database
needed. (First run downloads a MongoDB binary; it's cached after that.)

## Data model

- **User**: `name, email, password (hashed), role (admin|member), isActive`
- **Lead**: `name, email, phone, company, source, message, status, assignedTo, createdBy, timestamps`
  - `status` pipeline: `new → contacted → qualified → proposal → won|lost`
- **Note**: `lead, author, text, createdAt` — a timestamped note thread per lead
- **ActivityLog**: `lead, actor, action, meta, createdAt` — append-only audit trail
  (`lead.captured`, `status.changed`, `lead.assigned`, `lead.updated`, `note.added`)

## Auth & permissions

- Auth is a JWT bearer token (`Authorization: Bearer <token>`), obtained via `POST /api/auth/login`.
- There is **no public self-registration**. An admin provisions accounts via `POST /api/auth/users`.
- **Admin**: full access — see/edit/delete any lead, reassign leads, manage users.
- **Member**: can only see and act on leads **assigned to them**. Can change a lead's
  `status` and add notes, but cannot reassign a lead, edit its core fields, or delete it.
  This is enforced **server-side** in the controller (not just hidden in the UI) —
  a member's list/detail requests are scoped to `assignedTo: <their id>` regardless of
  query params, and a member's `PATCH` request is rejected with `403` if it touches a
  field outside `["status"]`.

## API reference

Base URL: `/api`

All authenticated routes require `Authorization: Bearer <token>`. Error responses look like:
```json
{ "error": "ErrorType", "message": "human readable reason" }
```

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | none | `{ email, password }` → `{ token, user }` |
| GET | `/auth/me` | any | Returns the current user |
| GET | `/auth/users` | admin | List active users |
| POST | `/auth/users` | admin | Create a user: `{ name, email, password, role }` |

### Leads

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/leads/capture` | none (rate-limited) | Public capture form: `{ name, email, phone?, company?, source?, message? }` → `201 { message, leadId }` |
| GET | `/leads` | any | List leads, paginated + filtered (see below) |
| GET | `/leads/:id` | any (scoped) | Get one lead |
| PATCH | `/leads/:id` | any (scoped) | Update a lead (fields allowed vary by role) |
| DELETE | `/leads/:id` | admin | Delete a lead (and its notes/activity) |
| GET | `/leads/:id/notes` | any (scoped) | List notes for a lead, newest first |
| POST | `/leads/:id/notes` | any (scoped) | Add a note: `{ text }` |
| GET | `/leads/:id/activity` | any (scoped) | List the activity trail for a lead, newest first |

**List query params** (`GET /leads`):
- `page` (default 1), `limit` (default 20, max 100)
- `status` — one of `new, contacted, qualified, proposal, won, lost`
- `assignedTo` — admin only; a user id, or `unassigned`
- `q` — free-text search across name/email/company

Response shape:
```json
{
  "data": [ { "_id": "...", "name": "...", "status": "new", "assignedTo": { "_id": "...", "name": "..." }, ... } ],
  "pagination": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
}
```

**PATCH `/leads/:id`** — allowed body fields by role:
- admin: `status, assignedTo, name, email, phone, company, source`
- member: `status` only (and only if the lead is assigned to them)

### Status codes used

- `200` OK, `201` Created, `204` No Content (delete)
- `400` validation error / bad query param
- `401` missing/invalid/expired token, or bad login credentials
- `403` authenticated but not permitted (wrong role, or lead not assigned to this member)
- `404` lead/route not found
- `409` conflict (e.g. duplicate email on user creation)

## Deployment (free tier)

1. **Database**: create a free MongoDB Atlas cluster, get the connection string.
2. **API host**: Render, Railway, or Fly.io free tier.
   - Build command: `npm install`
   - Start command: `npm start`
   - Env vars: `MONGODB_URI`, `JWT_SECRET`, `CORS_ORIGIN` (your frontend's deployed URL), `PORT` (usually provided by the host)
3. After deploy, run the seed script once (e.g. via a one-off shell/job on the host, or
   temporarily run `npm run seed` locally pointed at the production `MONGODB_URI`) to create
   the initial admin account.
