# Build log

## backend-core

Phase 1 of the plan: backend scaffold, config, all PRD section 7 models, auth,
authorization layer, shared infrastructure, Flask-Migrate and the seed script.

### Environment / setup commands

```bash
mkdir -p "/home/abhi/Apps/Study planner/backend"
cd "/home/abhi/Apps/Study planner/backend"
python3 -m venv .venv                       # Python 3.14.4
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
```

### Migrations + database

```bash
cd "/home/abhi/Apps/Study planner/backend"
export FLASK_APP=run.py
.venv/bin/flask db init
.venv/bin/flask db migrate -m "initial schema"
.venv/bin/flask db upgrade
```

Result: `backend/instance/app.db` created with 27 tables:

```
achievements, ai_conversations, ai_messages, alembic_version, announcements,
audit_logs, course_subjects, courses, document_chunks, enrollments,
focus_sessions, goals, notifications, platform_settings, resource_bookmarks,
resource_permissions, resources, study_sessions, subjects, syllabus_units,
syllabus_versions, tasks, token_blocklist, topic_progress, topics,
user_achievements, users
```

### Seed

```bash
cd "/home/abhi/Apps/Study planner/backend"
export FLASK_APP=run.py
.venv/bin/flask seed            # or: .venv/bin/python seed.py
.venv/bin/flask seed --reset    # clears demo rows first
```

Output of the first run:

```
Seed summary
------------
  admin accounts     : 1 (created)
  student accounts   : 3
  courses            : 3 (published, syllabus version 1)
  syllabus topics    : 70
  enrollments added  : 6
  progress rows      : 60
  study sessions     : 105
  focus sessions     : 59
  tasks              : 24
  goals              : 12
  achievements award : 6
  notifications      : 9
  resources          : 9
  announcements      : 2
  platform settings  : 4

Login credentials
-----------------
  ADMIN    admin@studyplanner.test      Admin@12345
  STUDENT  aarav@studyplanner.test      Student@123
  STUDENT  priya@studyplanner.test      Student@123
  STUDENT  rohan@studyplanner.test      Student@123
```

Second run (idempotency check) created 0 new rows:

```
  admin accounts     : 1 (existing)
  student accounts   : 3
  courses            : 3 (published, syllabus version 1)
  syllabus topics    : 70
  enrollments added  : 0
  progress rows      : 0
  study sessions     : 0
  focus sessions     : 0
  tasks              : 0
  goals              : 0
  achievements award : 0
  notifications      : 0
  resources          : 0
  announcements      : 0
  platform settings  : 0
```

### Seeded credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@studyplanner.test` | `Admin@12345` |
| Student | `aarav@studyplanner.test` | `Student@123` |
| Student | `priya@studyplanner.test` | `Student@123` |
| Student | `rohan@studyplanner.test` | `Student@123` |

### Running the API (background, never in the foreground)

```bash
cd "/home/abhi/Apps/Study planner/backend"
nohup .venv/bin/python run.py > /tmp/flask.log 2>&1 &
tail -f /tmp/flask.log
```

Boot log, zero import errors:

```
2026-10-24 19:14:45,707 INFO     app: Smart Study Planner API ready (env=development, db=sqlite:////home/abhi/Apps/Study planner/backend/instance/app.db)
 * Serving Flask app 'app'
 * Debug mode: on
2026-10-24 19:14:45,731 INFO     werkzeug: WARNING: This is a development server. Do not use it in a production deployment. Use a production WSGI server instead.
 * Running on http://127.0.0.1:5000
2026-10-24 19:14:45,731 INFO     werkzeug: Press CTRL+C to quit
```

Registered routes after this phase:

```
GET   /
GET   /api/v1/health
POST  /api/v1/auth/register
POST  /api/v1/auth/login
POST  /api/v1/auth/logout
POST  /api/v1/auth/refresh
POST  /api/v1/auth/verify-email
POST  /api/v1/auth/resend-verification
POST  /api/v1/auth/forgot-password
POST  /api/v1/auth/reset-password
POST  /api/v1/auth/change-password
GET   /api/v1/auth/me
GET   /api/v1/admin/audit-logs
GET   /api/v1/admin/health
```

### curl evidence

`$B` = `http://127.0.0.1:5000/api/v1`. Script: `bash /tmp/verify.sh`. JWT strings
in the bodies below are truncated for readability; everything else is the
verbatim response. Each block shows the command, the response body, then the
HTTP status.

```
### 1. Health check
$ curl -s $B/health
{
  "db": "ok",
  "service": "smart-study-planner-api",
  "status": "ok",
  "version": "v1"
}

HTTP 200

### 2. Register a new student (payload also sends role=admin, which must be ignored)
$ curl -s -X POST $B/auth/register -H 'Content-Type: application/json' -d '{"full_name":"Test Student","email":"test.student@example.com","password":"TestPass123","role":"admin"}'
{
  "dev_note": "No email provider is configured, so this token is returned for testing and also written to the server log.",
  "message": "Account created. Verify your email address to activate it.",
  "user": {
    "avatar_url": null,
    "email": "test.student@example.com",
    "email_verified": false,
    "full_name": "Test Student",
    "id": 5,
    "role": "student",
    "status": "pending_verification"
  },
  "verification_token": "eMqujc0z5RIhWtQt3rs4WOUlhKr0vHfY2B7AZ-sy7_U"
}

HTTP 201

### 3. Duplicate email is rejected
$ curl -s -X POST $B/auth/register -H 'Content-Type: application/json' -d '{"full_name":"Test Student","email":"test.student@example.com","password":"TestPass123"}'
{
  "error": {
    "code": "CONFLICT",
    "message": "An account with this email address already exists."
  }
}

HTTP 409

### 4. Weak password is rejected
$ curl -s -X POST $B/auth/register -H 'Content-Type: application/json' -d '{"full_name":"Weak","email":"weak@example.com","password":"abc"}'
{
  "error": {
    "code": "VALIDATION_ERROR",
    "fields": {
      "password": "The password must contain at least 8 characters, one number."
    },
    "message": "Password is too weak."
  }
}

HTTP 422

### 5. Malformed email is rejected
$ curl -s -X POST $B/auth/register -H 'Content-Type: application/json' -d '{"full_name":"Bad Email","email":"not-an-email","password":"TestPass123"}'
{
  "error": {
    "code": "VALIDATION_ERROR",
    "fields": {
      "email": "An email address must have an @-sign."
    },
    "message": "Invalid email address."
  }
}

HTTP 422

### 6. Log in as the new student
$ curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"test.student@example.com","password":"TestPass123"}'
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR...<truncated jwt>",
  "expires_in": 3600,
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR...<truncated jwt>",
  "token_type": "Bearer",
  "user": {
    "avatar_url": null,
    "email": "test.student@example.com",
    "email_verified": false,
    "full_name": "Test Student",
    "id": 5,
    "role": "student",
    "status": "pending_verification"
  }
}

HTTP 200

### 7. GET /auth/me with the student access token
$ curl -s $B/auth/me -H "Authorization: Bearer $STUDENT_ACCESS_TOKEN"
{
  "user": {
    "avatar_url": null,
    "created_at": "2026-10-24T13:43:27.102927",
    "email": "test.student@example.com",
    "email_verified": false,
    "full_name": "Test Student",
    "id": 5,
    "language": "en",
    "last_login_at": "2026-10-24T13:43:27.724792",
    "preferences": {
      "accessibility": {},
      "availability": {},
      "daily_target_minutes": 240,
      "focus_duration_minutes": 25,
      "long_break_minutes": 15,
      "notifications": {},
      "short_break_minutes": 5,
      "weekly_target_minutes": 1500
    },
    "role": "student",
    "status": "pending_verification",
    "timezone": "Asia/Kolkata",
    "updated_at": "2026-10-24T13:43:27.725453"
  }
}

HTTP 200

### 8. Protected route with NO token
$ curl -s $B/auth/me
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication is required. Send an Authorization: Bearer <token> header."
  }
}

HTTP 401

### 9. Protected route with a garbage token
$ curl -s $B/auth/me -H 'Authorization: Bearer not.a.real.token'
{
  "error": {
    "code": "INVALID_TOKEN",
    "message": "The token is invalid: Invalid header padding"
  }
}

HTTP 401

### 10. Student token on the admin-only route (must be 403)
$ curl -s $B/admin/audit-logs -H "Authorization: Bearer $STUDENT_ACCESS_TOKEN"
{
  "error": {
    "code": "FORBIDDEN",
    "message": "This endpoint requires the admin role."
  }
}

HTTP 403

### 11. Log in as the seeded admin
$ curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@studyplanner.test","password":"Admin@12345"}'
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR...<truncated jwt>",
  "expires_in": 3600,
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR...<truncated jwt>",
  "token_type": "Bearer",
  "user": {
    "avatar_url": null,
    "email": "admin@studyplanner.test",
    "email_verified": true,
    "full_name": "Ananya Rao",
    "id": 1,
    "role": "admin",
    "status": "active"
  }
}

HTTP 200

### 12. Admin token on the admin-only route (must be 200)
$ curl -s "$B/admin/audit-logs?per_page=3" -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN"
{
  "has_next": false,
  "has_prev": false,
  "items": [
    {
      "action": "auth.registered",
      "actor_email": "test.student@example.com",
      "actor_id": 5,
      "created_at": "2026-10-24T13:43:27.104244",
      "detail": null,
      "entity_id": 5,
      "entity_type": "user",
      "id": 3,
      "ip_address": "127.0.0.1"
    },
    {
      "action": "auth.registered",
      "actor_email": null,
      "actor_id": null,
      "created_at": "2026-10-24T13:42:19.892435",
      "detail": null,
      "entity_id": 5,
      "entity_type": "user",
      "id": 2,
      "ip_address": "127.0.0.1"
    },
    {
      "action": "seed.demo_data",
      "actor_email": "admin@studyplanner.test",
      "actor_id": 1,
      "created_at": "2026-10-24T13:33:00.980487",
      "detail": {
        "courses": 3,
        "students": 3
      },
      "entity_id": null,
      "entity_type": "platform",
      "id": 1,
      "ip_address": null
    }
  ],
  "page": 1,
  "pages": 1,
  "per_page": 3,
  "total": 3
}

HTTP 200

### 13. Admin health endpoint
$ curl -s $B/admin/health -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN"
{
  "ai_provider": "missing",
  "db": "ok",
  "environment": "development",
  "storage": {
    "file_count": 1,
    "root": "/home/abhi/Apps/Study planner/backend/uploads",
    "total_bytes": 0
  }
}

HTTP 200

### 14. Log in as a seeded student
$ curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"aarav@studyplanner.test","password":"Student@123"}'
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR...<truncated jwt>",
  "expires_in": 3600,
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR...<truncated jwt>",
  "token_type": "Bearer",
  "user": {
    "avatar_url": null,
    "email": "aarav@studyplanner.test",
    "email_verified": true,
    "full_name": "Aarav Sharma",
    "id": 2,
    "role": "student",
    "status": "active"
  }
}

HTTP 200

### 15. Email verification flow (token returned because no SMTP is configured)
$ curl -s -X POST $B/auth/resend-verification -H 'Content-Type: application/json' -d '{"email":"test.student@example.com"}'
{
  "dev_note": "No email provider is configured, so this token is returned for testing and also written to the server log.",
  "message": "If an unverified account exists for that email address, a new verification token has been issued.",
  "verification_token": "hmQNYyOqnp7XKQnkTxY2ghP50ltaICB1cI5n5S9KUOM"
}

### 15b. Verify the email with that token
$ curl -s -X POST $B/auth/verify-email -H 'Content-Type: application/json' -d '{"token":"$VERIFICATION_TOKEN"}'
{
  "message": "Email address verified. Your account is now active.",
  "user": {
    "avatar_url": null,
    "email": "test.student@example.com",
    "email_verified": true,
    "full_name": "Test Student",
    "id": 5,
    "role": "student",
    "status": "active"
  }
}

HTTP 200

### 16. Forgot password
$ curl -s -X POST $B/auth/forgot-password -H 'Content-Type: application/json' -d '{"email":"test.student@example.com"}'
{
  "dev_note": "No email provider is configured, so this token is returned for testing and also written to the server log.",
  "message": "If an account exists for that email address, recovery instructions have been issued.",
  "reset_token": "zccgwklEsJZwaEwOoOBoLG3Ze2LD87rUtYEUDFIP74A"
}

### 16b. Reset the password with that token
$ curl -s -X POST $B/auth/reset-password -H 'Content-Type: application/json' -d '{"token":"$RESET_TOKEN","new_password":"NewPass456"}'
{
  "message": "Password updated. You can now sign in."
}

HTTP 200

### 16c. Log in with the new password
$ curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"test.student@example.com","password":"NewPass456"}'
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR...<truncated jwt>",
  "expires_in": 3600,
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR...<truncated jwt>",
  "token_type": "Bearer",
  "user": {
    "avatar_url": null,
    "email": "test.student@example.com",
    "email_verified": true,
    "full_name": "Test Student",
    "id": 5,
    "role": "student",
    "status": "active"
  }
}

HTTP 200

### 17. Change password while authenticated
$ curl -s -X POST $B/auth/change-password -H "Authorization: Bearer $STUDENT_ACCESS_TOKEN" -H 'Content-Type: application/json' -d '{"current_password":"NewPass456","new_password":"Changed789"}'
{
  "message": "Password changed."
}

HTTP 200

### 18. Refresh the access token with the refresh token
$ curl -s -X POST $B/auth/refresh -H "Authorization: Bearer $STUDENT_REFRESH_TOKEN"
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR...<truncated jwt>",
  "expires_in": 3600,
  "token_type": "Bearer",
  "user": {
    "avatar_url": null,
    "email": "test.student@example.com",
    "email_verified": true,
    "full_name": "Test Student",
    "id": 5,
    "role": "student",
    "status": "active"
  }
}

HTTP 200

### 19. Log out (revokes the presented token)
$ curl -s -X POST $B/auth/logout -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN"
{
  "message": "Signed out. The token has been revoked."
}

HTTP 200

### 19b. Reuse the revoked admin token (must be 401)
$ curl -s $B/admin/audit-logs -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN"
{
  "error": {
    "code": "TOKEN_REVOKED",
    "message": "This token has been revoked."
  }
}

HTTP 401
```

### Summary of the authorization checks

| Check | Result |
|---|---|
| Registration ignores a `role: "admin"` field in the payload | account created with `"role": "student"` (step 2) |
| Duplicate email | 409 `CONFLICT` (step 3) |
| Weak password | 422 `VALIDATION_ERROR` with a `fields.password` message (step 4) |
| Malformed email | 422 `VALIDATION_ERROR` with a `fields.email` message (step 5) |
| Student token on `/api/v1/admin/audit-logs` | 403 `FORBIDDEN` (step 10) |
| Admin token on `/api/v1/admin/audit-logs` | 200 with real audit rows (step 12) |
| No token on a protected route | 401 `UNAUTHORIZED` (step 8) |
| Garbage token on a protected route | 401 `INVALID_TOKEN` (step 9) |
| Revoked token after logout | 401 `TOKEN_REVOKED` (step 19b) |
| Email verification / forgot / reset / change password | all 200, tokens returned in the response because no SMTP is configured (steps 15-17) |
| Refresh token issues a new access token | 200 (step 18) |

No tracebacks appeared in `/tmp/flask.log` during the run.

## backend-student

Phase 2 of the plan: every student-facing endpoint built on the existing app
factory, models, auth decorators, error envelope, pagination and audit helpers.
Seven new blueprints (`student`, `courses`, `syllabus`, `planner`, `analytics`,
`materials`, `notifications`) plus the shared `progress` / `streaks` /
`achievements` / `notifications` / `access` helpers and the deterministic
scheduler.

### New modules

```
app/common/access.py            enrollment + topic authorization helpers
app/common/progress.py          completion math (unweighted + weighted)
app/common/streaks.py           per-day activity, streaks, consistency
app/common/achievements.py      server-side evaluation, duplicate-proof
app/common/notifications.py     create_notification + on-read reminders
app/student/                    dashboard, profile/settings, enrollments
app/courses/                    published catalog, search, detail, categories
app/syllabus/                   syllabus tree, topic progress, revision queue
app/planner/                    timetable, tasks, focus timer, goals,
                                scheduler.py, conflicts.py, recurrence.py,
                                goals_service.py, link_service.py
app/analytics/                  queries.py, insights.py, routes.py
app/resources/                  student materials (browse/upload/download)
app/notifications/              notification centre + announcements
```

### Migration

One column was added (`resources.access_token`) so a stored file is reachable
only through an opaque, unguessable handle. Existing rows were backfilled
inside the migration.

```bash
cd "/home/abhi/Apps/Study planner/backend"
export FLASK_APP=run.py
.venv/bin/flask db migrate -m "resource access token"
.venv/bin/flask db upgrade
```

```
INFO  [alembic.autogenerate.compare.tables] Detected added column 'resources.access_token'
INFO  [alembic.runtime.migration] Running upgrade 944b10eda376 -> 6c14e2618786, resource access token
```

Backfill check (9 resources, 9 tokens):

```bash
$ .venv/bin/python -c "import sqlite3; con=sqlite3.connect('instance/app.db'); \
    print(con.execute('select count(*), count(access_token) from resources').fetchone())"
(9, 9)
```

### Re-seed (schema changed, so the demo data was rebuilt)

```bash
cd "/home/abhi/Apps/Study planner/backend"
export FLASK_APP=run.py
.venv/bin/flask seed --reset
```

```
Clearing existing rows...

Seed summary
------------
  admin accounts     : 1 (created)
  student accounts   : 3
  courses            : 3 (published, syllabus version 1)
  syllabus topics    : 70
  enrollments added  : 6
  progress rows      : 60
  study sessions     : 105
  focus sessions     : 59
  tasks              : 24
  goals              : 12
  achievements award : 6
  notifications      : 9
  resources          : 9
  announcements      : 2
  platform settings  : 4
```

### Boot (background, never foregrounded)

```bash
cd "/home/abhi/Apps/Study planner/backend"
nohup .venv/bin/python run.py > /tmp/flask.log 2>&1 &
tail -f /tmp/flask.log
```

```
2026-10-24 21:00:47,350 INFO     app: Smart Study Planner API ready (env=development, db=sqlite:////home/abhi/Apps/Study planner/backend/instance/app.db)
 * Serving Flask app 'app'
 * Debug mode: on
2026-10-24 21:00:47,371 INFO     werkzeug: WARNING: This is a development server. Do not use it in a production deployment. Use a production WSGI server instead.
 * Running on http://127.0.0.1:5000
2026-10-24 21:00:47,372 INFO     werkzeug: Press CTRL+C to quit
```

Clean boot, no import errors. After the full verification run below,
`grep -Ei "traceback|500 |exception" /tmp/flask.log` returned nothing.

### Student routes registered by this phase (60)

```
GET           /api/v1/courses                                              courses
GET           /api/v1/courses/                                             courses
GET           /api/v1/courses/<int:course_id>                              courses
GET           /api/v1/courses/categories                                   courses
GET           /api/v1/student/achievements                                 planner
POST          /api/v1/student/achievements/evaluate                        planner
GET           /api/v1/student/analytics                                    analytics
GET           /api/v1/student/analytics/summary                            analytics
GET           /api/v1/student/announcements                                notifications
GET           /api/v1/student/courses/<int:course_id>/syllabus             syllabus
GET           /api/v1/student/dashboard                                    student
GET           /api/v1/student/enrollments                                  student
POST          /api/v1/student/enrollments                                  student
DELETE        /api/v1/student/enrollments/<int:enrollment_id>              student
PATCH         /api/v1/student/enrollments/<int:enrollment_id>              student
GET           /api/v1/student/focus-sessions                               planner
POST          /api/v1/student/focus-sessions                               planner
PATCH         /api/v1/student/focus-sessions/<int:session_id>              planner
GET           /api/v1/student/focus-sessions/active                        planner
GET           /api/v1/student/focus-sessions/summary                       planner
GET           /api/v1/student/goals                                        planner
POST          /api/v1/student/goals                                        planner
DELETE        /api/v1/student/goals/<int:goal_id>                          planner
GET           /api/v1/student/goals/<int:goal_id>                          planner
PATCH         /api/v1/student/goals/<int:goal_id>                          planner
POST          /api/v1/student/goals/<int:goal_id>/progress                 planner
GET           /api/v1/student/notifications                                notifications
DELETE        /api/v1/student/notifications/<int:notification_id>          notifications
PATCH         /api/v1/student/notifications/<int:notification_id>/read     notifications
POST          /api/v1/student/notifications/read-all                       notifications
GET           /api/v1/student/notifications/unread-count                   notifications
GET           /api/v1/student/profile                                      student
PATCH         /api/v1/student/profile                                      student
POST          /api/v1/student/profile/password                             student
GET           /api/v1/student/resources                                    materials
POST          /api/v1/student/resources                                    materials
DELETE        /api/v1/student/resources/<int:resource_id>                  materials
GET           /api/v1/student/resources/<int:resource_id>                  materials
POST          /api/v1/student/resources/<int:resource_id>/bookmark         materials
GET           /api/v1/student/resources/<int:resource_id>/file             materials
GET           /api/v1/student/resources/file/<token>                       materials
GET           /api/v1/student/resources/recent                             materials
GET           /api/v1/student/revisions                                    syllabus
GET           /api/v1/student/study-sessions                               planner
POST          /api/v1/student/study-sessions                               planner
DELETE        /api/v1/student/study-sessions/<int:session_id>              planner
GET           /api/v1/student/study-sessions/<int:session_id>              planner
PATCH         /api/v1/student/study-sessions/<int:session_id>              planner
POST          /api/v1/student/study-sessions/<int:session_id>/attendance   planner
POST          /api/v1/student/study-sessions/<int:session_id>/reschedule   planner
GET           /api/v1/student/tasks                                        planner
POST          /api/v1/student/tasks                                        planner
DELETE        /api/v1/student/tasks/<int:task_id>                          planner
GET           /api/v1/student/tasks/<int:task_id>                          planner
PATCH         /api/v1/student/tasks/<int:task_id>                          planner
GET           /api/v1/student/timetable                                    planner
POST          /api/v1/student/timetable/generate                           planner
POST          /api/v1/student/timetable/generate/save                      planner
GET           /api/v1/student/topics/<int:topic_id>/progress               syllabus
PATCH         /api/v1/student/topics/<int:topic_id>/progress               syllabus
```

### curl evidence

`$B` = `http://127.0.0.1:5000/api/v1`. `$A` / `$B_TOKEN` are the access tokens of the two seeded students (Aarav = student A, Priya = student B). Long bodies are truncated where marked; everything else is the verbatim response.

```
### 0. Log in as the two seeded students
$ curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"aarav@studyplanner.test","password":"Student@123"}'
{
  "user": {
    "avatar_url": null,
    "email": "aarav@studyplanner.test",
    "email_verified": true,
    "full_name": "Aarav Sharma",
    "id": 2,
    "role": "student",
    "status": "active"
  }
}

$ curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"priya@studyplanner.test","password":"Student@123"}'
{
  "user": {
    "avatar_url": null,
    "email": "priya@studyplanner.test",
    "email_verified": true,
    "full_name": "Priya Verma",
    "id": 3,
    "role": "student",
    "status": "active"
  }
}

HTTP 200 (both)

### 1. Student dashboard (every metric computed from stored rows)
$ curl -s -X GET $B/student/dashboard -H "Authorization: Bearer $A"
{
  "active_goals": [
    {
      "category": "weekly_hours",
      "completed_at": null,
      "course_id": null,
      "course_title": null,
      "created_at": "2026-10-24T15:30:04.172455",
      "current_value": 0.83,
      "deadline": "2026-10-26",
      "description": "Study 25 hours this week \u2014 tracked from stored activity.",
      "id": 2,
      "progress_percent": 3.32,
      "start_date": "2026-10-17",
      "status": "active",
      "target_value": 25.0,
      "title": "Study 25 hours this week",
      "unit": "hours",
      "updated_at": "2026-10-24T15:31:11.251299"
    },
    {
      "category": "study_streak",
      "completed_at": null,
      "course_id": null,
      "course_title": null,
      "created_at": "2026-10-24T15:30:04.172461",
      "current_value": 0.0,
      "deadline": "2026-11-14",
      "description": "Hold a 14 day study streak \u2014 tracked from stored activity.",
      "id": 3,
      "progress_percent": 0.0,
      "start_date": "2026-10-17",
      "status": "active",
      "target_value": 14.0,
      "title": "Hold a 14 day study streak",
      "unit": "days",
      "updated_at": "2026-10-24T15:31:11.255541"
    },
    {
      "category": "topics_count",
      "completed_at": null,
      "course_id": null,
      "course_title": null,
      "created_at": "2026-10-24T15:30:04.172465",
      "current_value": 5.0,
      "deadline": "2026-11-23",
      "description": "Complete 40 topics this month \u2014 tracked from stored activity.",
      "id": 4,
      "progress_percent": 12.5,
      "start_date": "2026-10-17",
      "status": "active",
      "target_value": 40.0,
      "title": "Complete 40 topics this month",
      "unit": "topics",
      "updated_at": "2026-10-24T15:31:11.261915"
    },
    {
      "category": "course_completion",
      "completed_at": null,
      "course_id": 1,
      "course_title": "UPSC Civil Services \u2014 Prelims",
      "created_at": "2026-10-24T15:30:04.172438",
      "current_value": 44.83,
      "deadline": "2027-02-21",
      "description": "Finish UPSC Civil Services \u2014 Prelims syllabus \u2014 tracked from stored activity.",
      "id": 1,
      "progress_percent": 44.83,
      "start_date": "2026-10-17",
      "status": "active",
      "target_value": 100.0,
... (319 more lines truncated)

HTTP 200

### 2. Browse published courses
$ curl -s -X GET $B/courses?per_page=5 -H "Authorization: Bearer $A"
{
  "has_next": false,
  "has_prev": false,
  "items": [
    {
      "category": "competitive_exam",
      "description": "Full JEE Main syllabus split into physics, chemistry and mathematics with chapter-level topics, estimated study time and difficulty.",
      "estimated_duration_weeks": 40,
      "id": 2,
      "is_enrolled": true,
      "level": "Intermediate",
      "progress_percent": 44.44,
      "slug": "jee-main-physics-chemistry-mathematics",
      "status": "published",
      "subject_count": 3,
      "thumbnail_url": null,
      "title": "JEE Main \u2014 Physics, Chemistry & Mathematics",
      "topic_count": 27
    },
    {
      "category": "competitive_exam",
      "description": "Quantitative aptitude, reasoning and English preparation for SSC CGL Tier I with short, revision-friendly topics.",
      "estimated_duration_weeks": 24,
      "id": 3,
      "is_enrolled": false,
      "level": "Beginner",
      "progress_percent": null,
      "slug": "ssc-cgl-tier-i-foundation",
      "status": "published",
      "subject_count": 3,
      "thumbnail_url": null,
      "title": "SSC CGL \u2014 Tier I Foundation",
      "topic_count": 14
    },
    {
      "category": "competitive_exam",
      "description": "Complete General Studies Paper I preparation covering polity, modern history, geography and economy, organised into a week-by-week syllabus.",
      "estimated_duration_weeks": 52,
      "id": 1,
      "is_enrolled": true,
      "level": "Advanced",
      "progress_percent": 44.83,
      "slug": "upsc-civil-services-prelims",
      "status": "published",
      "subject_count": 4,
      "thumbnail_url": null,
      "title": "UPSC Civil Services \u2014 Prelims",
      "topic_count": 29
    }
  ],
  "page": 1,
  "pages": 1,
  "per_page": 5,
  "total": 3
}

HTTP 200

### 3. Course detail
$ curl -s -X GET $B/courses/3 -H "Authorization: Bearer $A"
{
  "course": {
    "category": "competitive_exam",
    "created_at": "2026-10-24T15:30:03.948328",
    "created_by": 1,
    "description": "Quantitative aptitude, reasoning and English preparation for SSC CGL Tier I with short, revision-friendly topics.",
    "enrolled_students": 2,
    "estimated_duration_weeks": 24,
    "id": 3,
    "is_enrolled": false,
    "level": "Beginner",
    "slug": "ssc-cgl-tier-i-foundation",
    "status": "published",
    "subject_count": 3,
    "subjects": [
      {
        "course_weightage": 25.0,
        "description": "Quantitative Aptitude syllabus content, units and topics.",
        "display_order": 0,
        "id": 8,
        "name": "Quantitative Aptitude",
        "slug": "quantitative-aptitude",
        "status": "active",
        "topic_count": 6,
        "weightage": 25.0
      },
      {
        "course_weightage": 25.0,
        "description": "General Intelligence and Reasoning syllabus content, units and topics.",
        "display_order": 1,
        "id": 9,
        "name": "General Intelligence and Reasoning",
        "slug": "general-intelligence-and-reasoning",
        "status": "active",
        "topic_count": 4,
        "weightage": 25.0
      },
      {
        "course_weightage": 25.0,
        "description": "English Language syllabus content, units and topics.",
        "display_order": 2,
        "id": 10,
        "name": "English Language",
        "slug": "english-language",
        "status": "active",
        "topic_count": 4,
        "weightage": 25.0
      }
    ],
    "syllabus_version": {
      "id": 3,
      "published_at": "2026-10-24T15:30:03.949294",
      "version_number": 1
    },
    "target_audience": "Graduates preparing for SSC Combined Graduate Level Tier I",
    "thumbnail_url": null,
    "title": "SSC CGL \u2014 Tier I Foundation",
    "topic_count": 14,
    "updated_at": "2026-10-24T15:30:03.948333"
  }
}

HTTP 200

### 4. Enroll in a published course
$ curl -s -X POST $B/student/enrollments -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"course_id": 3, "priority": "high", "target_completion_date": "2027-01-22"}'
{
  "enrollment": {
    "course": {
      "category": "competitive_exam",
      "estimated_duration_weeks": 24,
      "id": 3,
      "level": "Beginner",
      "slug": "ssc-cgl-tier-i-foundation",
      "status": "published",
      "thumbnail_url": null,
      "title": "SSC CGL \u2014 Tier I Foundation"
    },
    "course_id": 3,
    "difficulty": "medium",
    "enrolled_at": "2026-10-24T15:31:11.557068",
    "id": 7,
    "last_accessed_at": "2026-10-24T15:31:11.552347",
    "priority": "high",
    "status": "active",
    "target_completion_date": "2027-01-22"
  }
}

HTTP 201

### 5. Duplicate enrollment is rejected
$ curl -s -X POST $B/student/enrollments -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"course_id": 3}'
{
  "error": {
    "code": "CONFLICT",
    "message": "You are already enrolled in this course."
  }
}

HTTP 409

### 6. Enrolling in an unknown/unpublished course is rejected
$ curl -s -X POST $B/student/enrollments -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"course_id": 99999}'
{
  "error": {
    "code": "NOT_FOUND",
    "message": "That course was not found."
  }
}

HTTP 404

### 7. My courses (enrollments with computed progress)
$ curl -s -X GET $B/student/enrollments -H "Authorization: Bearer $A"
{
  "items": [
    {
      "course": {
        "category": "competitive_exam",
        "estimated_duration_weeks": 24,
        "id": 3,
        "level": "Beginner",
        "slug": "ssc-cgl-tier-i-foundation",
        "status": "published",
        "thumbnail_url": null,
        "title": "SSC CGL \u2014 Tier I Foundation"
      },
      "course_id": 3,
      "difficulty": "medium",
      "enrolled_at": "2026-10-24T15:31:11.557068",
      "id": 7,
      "last_accessed_at": "2026-10-24T15:31:11.552347",
      "priority": "high",
      "progress": {
        "completed_topics": 0,
        "completion_percent": 0.0,
        "estimated_minutes": 870,
        "in_progress_topics": 0,
        "not_started_topics": 14,
        "time_spent_minutes": 0,
        "total_topics": 14,
        "weighted_completion_percent": 0.0
      },
      "progress_percent": 0.0,
      "status": "active",
      "target_completion_date": "2027-01-22"
    },
    {
      "course": {
        "category": "competitive_exam",
        "estimated_duration_weeks": 40,
        "id": 2,
        "level": "Intermediate",
        "slug": "jee-main-physics-chemistry-mathematics",
        "status": "published",
        "thumbnail_url": null,
        "title": "JEE Main \u2014 Physics, Chemistry & Mathematics"
      },
      "course_id": 2,
      "difficulty": "medium",
      "enrolled_at": "2026-10-24T15:30:04.002448",
      "id": 2,
      "last_accessed_at": "2026-10-24T08:30:04.002035",
      "priority": "medium",
      "progress": {
        "completed_topics": 12,
        "completion_percent": 44.44,
        "estimated_minutes": 2405,
        "in_progress_topics": 3,
        "not_started_topics": 12,
        "time_spent_minutes": 1155,
        "total_topics": 27,
        "weighted_completion_percent": 44.07
      },
      "progress_percent": 44.44,
      "status": "active",
      "target_completion_date": "2027-05-22"
    },
    {
      "course": {
        "category": "competitive_exam",
        "estimated_duration_weeks": 52,
        "id": 1,
        "level": "Advanced",
... (28 more lines truncated)

HTTP 200

### 8. Syllabus tree for the enrolled course
$ curl -s -X GET $B/student/courses/3/syllabus -H "Authorization: Bearer $A"
{
  "course": {
    "category": "competitive_exam",
    "id": 3,
    "slug": "ssc-cgl-tier-i-foundation",
    "status": "published",
    "title": "SSC CGL \u2014 Tier I Foundation"
  },
  "enrollment": {
    "difficulty": "medium",
    "id": 7,
    "priority": "high",
    "status": "active",
    "target_completion_date": "2027-01-22"
  },
  "filters_applied": {},
  "subjects": [
    {
      "display_order": 0,
      "id": 8,
      "name": "Quantitative Aptitude",
      "progress": {
        "completed_topics": 0,
        "completion_percent": 0.0,
        "estimated_minutes": 425,
        "in_progress_topics": 0,
        "not_started_topics": 6,
        "time_spent_minutes": 0,
        "total_topics": 6,
        "weighted_completion_percent": 0.0
      },
      "progress_percent": 0.0,
      "slug": "quantitative-aptitude",
      "units": [
        {
          "children": [
            {
              "children": [],
              "description": null,
              "display_order": 0,
              "id": 41,
              "parent_id": 40,
              "progress": {
                "completed_topics": 0,
                "completion_percent": 0.0,
                "estimated_minutes": 135,
                "in_progress_topics": 0,
                "not_started_topics": 2,
                "time_spent_minutes": 0,
                "total_topics": 2,
                "weighted_completion_percent": 0.0
              },
              "progress_percent": 0.0,
              "subject_id": 8,
              "title": "Numbers and Percentages",
              "topics": [
                {
                  "description": "Number system and divisibility rules \u2014 part of Numbers and Percentages (Quantitative Aptitude).",
                  "difficulty": "easy",
                  "display_order": 0,
                  "estimated_minutes": 60,
                  "id": 57,
                  "importance": "high",
                  "progress": {
                    "completed_at": null,
                    "needs_revision": false,
                    "next_revision_date": null,
                    "notes": null,
                    "priority": "medium",
                    "status": "not_started",
... (572 more lines truncated)

HTTP 200

### 9. Update a topic's progress (upsert + rolled-up percentages)
$ curl -s -X PATCH $B/student/topics/57/progress -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"status": "completed", "time_spent_minutes": 75, "notes": "Finished with revision notes.", "priority": "high", "needs_revision": true, "next_revision_date": "2026-10-29"}'
{
  "achievements_earned": [],
  "course_id": 3,
  "progress": {
    "completed_at": "2026-10-24T15:31:11.942236",
    "id": 61,
    "needs_revision": true,
    "next_revision_date": "2026-10-29",
    "notes": "Finished with revision notes.",
    "priority": "high",
    "status": "completed",
    "target_date": null,
    "time_spent_minutes": 75,
    "topic_id": 57,
    "updated_at": "2026-10-24T15:31:11.946982"
  },
  "rollup": {
    "chapter": {
      "completed_topics": 1,
      "completion_percent": 50.0,
      "estimated_minutes": 135,
      "in_progress_topics": 0,
      "not_started_topics": 1,
      "time_spent_minutes": 75,
      "total_topics": 2,
      "weighted_completion_percent": 44.44
    },
    "chapter_id": 41,
    "course": {
      "completed_topics": 1,
      "completion_percent": 7.14,
      "estimated_minutes": 870,
      "in_progress_topics": 0,
      "not_started_topics": 13,
      "time_spent_minutes": 75,
      "total_topics": 14,
      "weighted_completion_percent": 6.9
    },
    "course_id": 3,
    "subject": {
      "completed_topics": 1,
      "completion_percent": 16.67,
      "estimated_minutes": 425,
      "in_progress_topics": 0,
      "not_started_topics": 5,
      "time_spent_minutes": 75,
      "total_topics": 6,
      "weighted_completion_percent": 14.12
    },
    "subject_id": 8,
    "unit": {
      "completed_topics": 1,
      "completion_percent": 25.0,
      "estimated_minutes": 270,
      "in_progress_topics": 0,
      "not_started_topics": 3,
      "time_spent_minutes": 75,
      "total_topics": 4,
      "weighted_completion_percent": 22.22
    },
    "unit_id": 40
  }
}

HTTP 200

### 10. Revision queue reflects the flagged topic
$ curl -s -X GET $B/student/revisions -H "Authorization: Bearer $A"
{
  "items": [
    {
      "course_id": 2,
      "difficulty": "easy",
      "estimated_minutes": 70,
      "importance": "medium",
      "is_overdue": true,
      "next_revision_date": "2026-10-21",
      "progress": {
        "completed_at": "2026-10-08T15:30:04.019373",
        "id": 17,
        "needs_revision": true,
        "next_revision_date": "2026-10-21",
        "notes": "Revise formula sheet before the next mock test.",
        "priority": "low",
        "status": "completed",
        "target_date": "2026-11-29",
        "time_spent_minutes": 80,
        "topic_id": 30,
        "updated_at": "2026-10-24T15:30:04.021399"
      },
      "subject_id": 5,
      "subject_name": "Physics",
      "title": "Motion in a straight line",
      "topic_id": 30
    },
    {
      "course_id": 2,
      "difficulty": "hard",
      "estimated_minutes": 90,
      "importance": "medium",
      "is_overdue": false,
      "next_revision_date": "2026-10-24",
      "progress": {
        "completed_at": "2026-09-27T15:30:04.019756",
        "id": 21,
        "needs_revision": true,
        "next_revision_date": "2026-10-24",
        "notes": null,
        "priority": "high",
        "status": "completed",
        "target_date": "2026-11-10",
        "time_spent_minutes": 83,
        "topic_id": 38,
        "updated_at": "2026-10-24T15:30:04.021408"
      },
      "subject_id": 5,
      "subject_name": "Physics",
      "title": "Capacitors and dielectrics",
      "topic_id": 38
    },
    {
      "course_id": 1,
      "difficulty": "easy",
      "estimated_minutes": 60,
      "importance": "high",
      "is_overdue": false,
      "next_revision_date": "2026-10-26",
      "progress": {
        "completed_at": "2026-10-13T15:30:04.010556",
        "id": 5,
        "needs_revision": true,
        "next_revision_date": "2026-10-26",
        "notes": null,
        "priority": "medium",
        "status": "completed",
        "target_date": "2026-11-23",
        "time_spent_minutes": 59,
        "topic_id": 3,
... (136 more lines truncated)

HTTP 200

### 11. Create a task
$ curl -s -X POST $B/student/tasks -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"title": "Attempt sectional mock test", "priority": "high", "due_date": "2026-10-26", "due_time": "19:30", "estimated_minutes": 90, "course_id": 3, "topic_id": 57, "recurrence_rule": "weekly:MO,TH"}'
{
  "achievements_earned": [],
  "task": {
    "completed_at": null,
    "course_id": 3,
    "course_title": "SSC CGL \u2014 Tier I Foundation",
    "created_at": "2026-10-24T15:31:12.269463",
    "description": null,
    "due_date": "2026-10-26",
    "due_time": "19:30:00",
    "estimated_minutes": 90,
    "id": 25,
    "priority": "high",
    "recurrence_rule": "weekly:MO,TH",
    "reminder_at": null,
    "status": "pending",
    "subject_id": 8,
    "subject_name": "Quantitative Aptitude",
    "title": "Attempt sectional mock test",
    "topic_id": 57,
    "topic_title": "Number system and divisibility rules",
    "updated_at": "2026-10-24T15:31:12.269473"
  }
}

HTTP 201

### 12. Filter and sort tasks
$ curl -s -X GET $B/student/tasks?status=pending,in_progress&sort=priority&per_page=3 -H "Authorization: Bearer $A"
{
  "counts": {
    "cancelled": 0,
    "completed": 2,
    "due_today": 1,
    "in_progress": 1,
    "overdue": 1,
    "pending": 6
  },
  "has_next": true,
  "has_prev": false,
  "items": [
    {
      "completed_at": null,
      "course_id": 1,
      "course_title": "UPSC Civil Services \u2014 Prelims",
      "created_at": "2026-10-24T15:30:04.149323",
      "description": "Attempt full-length mock test for UPSC Civil Services \u2014 Prelims.",
      "due_date": "2026-10-25",
      "due_time": "20:00:00",
      "estimated_minutes": 180,
      "id": 3,
      "priority": "high",
      "recurrence_rule": null,
      "reminder_at": "2026-10-25T18:00:00",
      "status": "pending",
      "subject_id": 1,
      "subject_name": "Indian Polity",
      "title": "Attempt full-length mock test",
      "topic_id": 9,
      "topic_title": "Classification of directive principles",
      "updated_at": "2026-10-24T15:30:04.149330"
    },
    {
      "completed_at": null,
      "course_id": 1,
      "course_title": "UPSC Civil Services \u2014 Prelims",
      "created_at": "2026-10-24T15:30:04.154113",
      "description": "Review mock test mistakes for UPSC Civil Services \u2014 Prelims.",
      "due_date": "2026-10-27",
      "due_time": "20:00:00",
      "estimated_minutes": 90,
      "id": 5,
      "priority": "high",
      "recurrence_rule": null,
      "reminder_at": "2026-10-27T18:00:00",
      "status": "pending",
      "subject_id": 4,
      "subject_name": "Indian Economy",
      "title": "Review mock test mistakes",
      "topic_id": 26,
      "topic_title": "GDP, GNP and national income accounting",
      "updated_at": "2026-10-24T15:30:04.154119"
    },
    {
      "completed_at": null,
      "course_id": 3,
      "course_title": "SSC CGL \u2014 Tier I Foundation",
      "created_at": "2026-10-24T15:31:12.269463",
      "description": null,
      "due_date": "2026-10-26",
      "due_time": "19:30:00",
      "estimated_minutes": 90,
      "id": 25,
      "priority": "high",
      "recurrence_rule": "weekly:MO,TH",
      "reminder_at": null,
      "status": "pending",
      "subject_id": 8,
      "subject_name": "Quantitative Aptitude",
... (11 more lines truncated)

HTTP 200

### 13. Update the task
$ curl -s -X PATCH $B/student/tasks/25 -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"status": "in_progress", "priority": "medium"}'
{
  "achievements_earned": [],
  "task": {
    "completed_at": null,
    "course_id": 3,
    "course_title": "SSC CGL \u2014 Tier I Foundation",
    "created_at": "2026-10-24T15:31:12.269463",
    "description": null,
    "due_date": "2026-10-26",
    "due_time": "19:30:00",
    "estimated_minutes": 90,
    "id": 25,
    "priority": "medium",
    "recurrence_rule": "weekly:MO,TH",
    "reminder_at": null,
    "status": "in_progress",
    "subject_id": 8,
    "subject_name": "Quantitative Aptitude",
    "title": "Attempt sectional mock test",
    "topic_id": 57,
    "topic_title": "Number system and divisibility rules",
    "updated_at": "2026-10-24T15:31:12.374537"
  }
}

HTTP 200

### 14. Generate a smart timetable (deterministic, nothing persisted)
$ curl -s -X POST $B/student/timetable/generate -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"from": "2026-10-24", "to": "2026-10-27", "include_breaks": true, "include_revision": true, "include_tasks": true}'
{
  "batch_id": "9c97e936-ba90-4e68-99e9-90ec49cccd53",
  "from": "2026-10-24",
  "persisted": false,
  "sessions": [
    {
      "course_id": 2,
      "end_at": "2026-10-24T16:20:00",
      "generated_batch_id": "9c97e936-ba90-4e68-99e9-90ec49cccd53",
      "planned_minutes": 35,
      "session_type": "revision",
      "source": "revision",
      "start_at": "2026-10-24T15:45:00",
      "status": "planned",
      "subject_id": 5,
      "task_id": null,
      "title": "Revision: Motion in a straight line",
      "topic_id": 30
    },
    {
      "course_id": null,
      "end_at": "2026-10-24T16:25:00",
      "generated_batch_id": "9c97e936-ba90-4e68-99e9-90ec49cccd53",
      "planned_minutes": 5,
      "session_type": "break",
      "source": "break",
      "start_at": "2026-10-24T16:20:00",
      "status": "planned",
      "subject_id": null,
      "task_id": null,
      "title": "Break",
      "topic_id": null
    },
    {
      "course_id": 1,
      "end_at": "2026-10-24T17:15:00",
      "generated_batch_id": "9c97e936-ba90-4e68-99e9-90ec49cccd53",
      "planned_minutes": 50,
      "session_type": "study",
      "source": "task",
      "start_at": "2026-10-24T16:25:00",
      "status": "planned",
      "subject_id": 1,
      "task_id": 3,
      "title": "Task: Attempt full-length mock test (1/4)",
      "topic_id": 9
    },
    {
      "course_id": null,
      "end_at": "2026-10-24T17:20:00",
      "generated_batch_id": "9c97e936-ba90-4e68-99e9-90ec49cccd53",
      "planned_minutes": 5,
      "session_type": "break",
      "source": "break",
      "start_at": "2026-10-24T17:15:00",
      "status": "planned",
      "subject_id": null,
      "task_id": null,
      "title": "Break",
      "topic_id": null
    },
    {
      "course_id": 1,
      "end_at": "2026-10-24T17:50:00",
      "generated_batch_id": "9c97e936-ba90-4e68-99e9-90ec49cccd53",
      "planned_minutes": 30,
      "session_type": "study",
      "source": "task",
      "start_at": "2026-10-24T17:20:00",
      "status": "planned",
... (997 more lines truncated)

HTTP 200

### 15. Re-run the generator with the same inputs (determinism)
$ curl -s -X POST $B/student/timetable/generate -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"from": "2026-10-24", "to": "2026-10-27", "include_breaks": true, "include_revision": true, "include_tasks": true}'
{
  "batch_id_differs": true,
  "first_run_sessions": 40,
  "second_run_sessions": 40,
  "session_plan_identical": true
}

HTTP 200

### 16. Persist the generated draft (all-or-nothing, re-checked)
$ curl -s -X POST $B/student/timetable/generate/save -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"batch_id": "9c97e936-ba90-4e68-99e9-90ec49cccd53", "sessions": [{"course_id": 2, "end_at": "2026-10-24T16:20:00", "session_type": "revision", "start_at": "2026-10-24T15:45:00", "subject_id": 5, "title": "Revision: Motion in a straight line", "topic_id": 30}, {"course_id": null, "end_at": "2026-10-24T16:25:00", "session_type": "break", "start_at": "2026-10-24T16:20:00", "subject_id": null, "title": "Break", "topic_id": null}, {"course_id": 1, "end_at": "2026-10-24T17:15:00", "session_type": "study", "start_at": "2026-10-24T16:25:00", "subject_id": 1, "title": "Task: Attempt full-length mock test (1/4)", "topic_id": 9}]}'
{
  "batch_id": "9c97e936-ba90-4e68-99e9-90ec49cccd53",
  "created": 3,
  "sessions": [
    {
      "actual_minutes": 0,
      "course_id": 2,
      "course_title": "JEE Main \u2014 Physics, Chemistry & Mathematics",
      "created_at": "2026-10-24T15:31:12.804637",
      "end_at": "2026-10-24T16:20:00",
      "generated_batch_id": "9c97e936-ba90-4e68-99e9-90ec49cccd53",
      "id": 106,
      "notes": null,
      "planned_minutes": 35,
      "recurrence_parent_id": null,
      "recurrence_rule": null,
      "rescheduled_from_id": null,
      "session_type": "revision",
      "start_at": "2026-10-24T15:45:00",
      "status": "planned",
      "subject_id": 5,
      "subject_name": "Physics",
      "title": "Revision: Motion in a straight line",
      "topic_id": 30,
      "topic_title": "Motion in a straight line",
      "updated_at": "2026-10-24T15:31:12.804664"
    },
    {
      "actual_minutes": 0,
      "course_id": null,
      "course_title": null,
      "created_at": "2026-10-24T15:31:12.804673",
      "end_at": "2026-10-24T16:25:00",
      "generated_batch_id": "9c97e936-ba90-4e68-99e9-90ec49cccd53",
      "id": 107,
      "notes": null,
      "planned_minutes": 5,
      "recurrence_parent_id": null,
      "recurrence_rule": null,
      "rescheduled_from_id": null,
      "session_type": "break",
      "start_at": "2026-10-24T16:20:00",
      "status": "planned",
      "subject_id": null,
      "subject_name": null,
      "title": "Break",
      "topic_id": null,
      "topic_title": null,
      "updated_at": "2026-10-24T15:31:12.804679"
    },
    {
      "actual_minutes": 0,
      "course_id": 1,
      "course_title": "UPSC Civil Services \u2014 Prelims",
      "created_at": "2026-10-24T15:31:12.804686",
      "end_at": "2026-10-24T17:15:00",
      "generated_batch_id": "9c97e936-ba90-4e68-99e9-90ec49cccd53",
      "id": 108,
      "notes": null,
      "planned_minutes": 50,
      "recurrence_parent_id": null,
      "recurrence_rule": null,
      "rescheduled_from_id": null,
      "session_type": "study",
      "start_at": "2026-10-24T16:25:00",
      "status": "planned",
      "subject_id": 1,
      "subject_name": "Indian Polity",
      "title": "Task: Attempt full-length mock test (1/4)",
      "topic_id": 9,
... (5 more lines truncated)

HTTP 201

### 17. Create a study session
$ curl -s -X POST $B/student/study-sessions -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"title": "Polity revision block", "start_at": "2026-11-13T10:00:00", "end_at": "2026-11-13T11:30:00", "course_id": 3, "topic_id": 57, "session_type": "study"}'
{
  "recurrence_children": [],
  "session": {
    "actual_minutes": 0,
    "course_id": 3,
    "course_title": "SSC CGL \u2014 Tier I Foundation",
    "created_at": "2026-10-24T15:31:12.913204",
    "end_at": "2026-11-13T11:30:00",
    "generated_batch_id": null,
    "id": 109,
    "notes": null,
    "planned_minutes": 90,
    "recurrence_parent_id": null,
    "recurrence_rule": null,
    "rescheduled_from_id": null,
    "session_type": "study",
    "start_at": "2026-11-13T10:00:00",
    "status": "planned",
    "subject_id": 8,
    "subject_name": "Quantitative Aptitude",
    "title": "Polity revision block",
    "topic_id": 57,
    "topic_title": "Number system and divisibility rules",
    "updated_at": "2026-10-24T15:31:12.913231"
  },
  "skipped_occurrences": []
}

HTTP 201

### 18. Overlapping study session is REJECTED (server-side check)
$ curl -s -X POST $B/student/study-sessions -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"title": "Overlapping block", "start_at": "2026-11-13T11:00:00", "end_at": "2026-11-13T12:00:00"}'
{
  "error": {
    "code": "SCHEDULE_CONFLICT",
    "conflicts": [
      {
        "end_at": "2026-11-13T11:30:00",
        "id": 109,
        "start_at": "2026-11-13T10:00:00",
        "title": "Polity revision block"
      }
    ],
    "message": "This slot overlaps an existing session."
  }
}

HTTP 409

### 19. The same slot with ?force=true is stored and still reports the conflict
$ curl -s -X POST $B/student/study-sessions?force=true -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"title": "Overlapping block (forced)", "start_at": "2026-11-13T11:00:00", "end_at": "2026-11-13T12:00:00"}'
{
  "forced_over_conflicts": [
    {
      "end_at": "2026-11-13T11:30:00",
      "id": 109,
      "start_at": "2026-11-13T10:00:00",
      "title": "Polity revision block"
    }
  ],
  "recurrence_children": [],
  "session": {
    "actual_minutes": 0,
    "course_id": null,
    "course_title": null,
    "created_at": "2026-10-24T15:31:13.041999",
    "end_at": "2026-11-13T12:00:00",
    "generated_batch_id": null,
    "id": 110,
    "notes": null,
    "planned_minutes": 60,
    "recurrence_parent_id": null,
    "recurrence_rule": null,
    "rescheduled_from_id": null,
    "session_type": "study",
    "start_at": "2026-11-13T11:00:00",
    "status": "planned",
    "subject_id": null,
    "subject_name": null,
    "title": "Overlapping block (forced)",
    "topic_id": null,
    "topic_title": null,
    "updated_at": "2026-10-24T15:31:13.042026"
  },
  "skipped_occurrences": []
}

HTTP 201

### 20. Week view with detected conflict pairs
$ curl -s -X GET $B/student/study-sessions?view=week&date=2026-11-13 -H "Authorization: Bearer $A"
{
  "conflicts": [
    [
      109,
      110
    ]
  ],
  "days": [
    {
      "date": "2026-11-09",
      "sessions": []
    },
    {
      "date": "2026-11-10",
      "sessions": []
    },
    {
      "date": "2026-11-11",
      "sessions": []
    },
    {
      "date": "2026-11-12",
      "sessions": []
    },
    {
      "date": "2026-11-13",
      "sessions": [
        {
          "actual_minutes": 0,
          "course_id": 3,
          "course_title": "SSC CGL \u2014 Tier I Foundation",
          "created_at": "2026-10-24T15:31:12.913204",
          "end_at": "2026-11-13T11:30:00",
          "generated_batch_id": null,
          "id": 109,
          "notes": null,
          "planned_minutes": 90,
          "recurrence_parent_id": null,
          "recurrence_rule": null,
          "rescheduled_from_id": null,
          "session_type": "study",
          "start_at": "2026-11-13T10:00:00",
          "status": "planned",
          "subject_id": 8,
          "subject_name": "Quantitative Aptitude",
          "title": "Polity revision block",
          "topic_id": 57,
          "topic_title": "Number system and divisibility rules",
          "updated_at": "2026-10-24T15:31:12.913231"
        },
        {
          "actual_minutes": 0,
          "course_id": null,
          "course_title": null,
          "created_at": "2026-10-24T15:31:13.041999",
          "end_at": "2026-11-13T12:00:00",
          "generated_batch_id": null,
          "id": 110,
          "notes": null,
          "planned_minutes": 60,
          "recurrence_parent_id": null,
          "recurrence_rule": null,
          "rescheduled_from_id": null,
          "session_type": "study",
          "start_at": "2026-11-13T11:00:00",
          "status": "planned",
          "subject_id": null,
          "subject_name": null,
          "title": "Overlapping block (forced)",
          "topic_id": null,
... (74 more lines truncated)

HTTP 200

### 21. Mark the session attended
$ curl -s -X POST $B/student/study-sessions/109/attendance -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"attended": true, "actual_minutes": 80}'
{
  "session": {
    "actual_minutes": 80,
    "course_id": 3,
    "course_title": "SSC CGL \u2014 Tier I Foundation",
    "created_at": "2026-10-24T15:31:12.913204",
    "end_at": "2026-11-13T11:30:00",
    "generated_batch_id": null,
    "id": 109,
    "notes": null,
    "planned_minutes": 90,
    "recurrence_parent_id": null,
    "recurrence_rule": null,
    "rescheduled_from_id": null,
    "session_type": "study",
    "start_at": "2026-11-13T10:00:00",
    "status": "partially_completed",
    "subject_id": 8,
    "subject_name": "Quantitative Aptitude",
    "title": "Polity revision block",
    "topic_id": 57,
    "topic_title": "Number system and divisibility rules",
    "updated_at": "2026-10-24T15:31:13.192681"
  }
}

HTTP 200

### 22. Reschedule a session (idempotent, no duplicates)
$ curl -s -X POST $B/student/study-sessions/109/reschedule -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"start_at": "2026-11-13T15:00:00", "end_at": "2026-11-13T16:30:00"}'
{
  "already_rescheduled": false,
  "original": {
    "actual_minutes": 80,
    "course_id": 3,
    "course_title": "SSC CGL \u2014 Tier I Foundation",
    "created_at": "2026-10-24T15:31:12.913204",
    "end_at": "2026-11-13T11:30:00",
    "generated_batch_id": null,
    "id": 109,
    "notes": null,
    "planned_minutes": 90,
    "recurrence_parent_id": null,
    "recurrence_rule": null,
    "rescheduled_from_id": null,
    "session_type": "study",
    "start_at": "2026-11-13T10:00:00",
    "status": "skipped",
    "subject_id": 8,
    "subject_name": "Quantitative Aptitude",
    "title": "Polity revision block",
    "topic_id": 57,
    "topic_title": "Number system and divisibility rules",
    "updated_at": "2026-10-24T15:31:13.285497"
  },
  "session": {
    "actual_minutes": 0,
    "course_id": 3,
    "course_title": "SSC CGL \u2014 Tier I Foundation",
    "created_at": "2026-10-24T15:31:13.287017",
    "end_at": "2026-11-13T16:30:00",
    "generated_batch_id": null,
    "id": 111,
    "notes": null,
    "planned_minutes": 90,
    "recurrence_parent_id": null,
    "recurrence_rule": null,
    "rescheduled_from_id": 109,
    "session_type": "study",
    "start_at": "2026-11-13T15:00:00",
    "status": "planned",
    "subject_id": 8,
    "subject_name": "Quantitative Aptitude",
    "title": "Polity revision block",
    "topic_id": 57,
    "topic_title": "Number system and divisibility rules",
    "updated_at": "2026-10-24T15:31:13.287035"
  }
}

HTTP 201

### 23. Start a live focus session (server sets started_at)
$ curl -s -X POST $B/student/focus-sessions -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"mode": "pomodoro", "target_minutes": 25, "course_id": 3, "topic_id": 57}'
{
  "server_time": "2026-10-24T15:31:13.373496",
  "session": {
    "break_minutes": 0,
    "course_id": 3,
    "course_title": "SSC CGL \u2014 Tier I Foundation",
    "created_at": "2026-10-24T15:31:13.390301",
    "cycles_completed": 0,
    "elapsed_seconds": 0,
    "ended_at": null,
    "focus_minutes": 0,
    "id": 60,
    "mode": "pomodoro",
    "paused_accumulated_seconds": 0,
    "paused_at": null,
    "remaining_seconds": 1500,
    "started_at": "2026-10-24T15:31:13.373496",
    "status": "running",
    "subject_id": 8,
    "target_minutes": 25,
    "topic_id": 57,
    "topic_title": "Number system and divisibility rules",
    "updated_at": "2026-10-24T15:31:13.390324"
  }
}

HTTP 201

### 24. Active-session recovery endpoint (UI rebuilds after refresh)
$ curl -s -X GET $B/student/focus-sessions/active -H "Authorization: Bearer $A"
{
  "server_time": "2026-10-24T15:31:13.477841",
  "session": {
    "break_minutes": 0,
    "course_id": 3,
    "course_title": "SSC CGL \u2014 Tier I Foundation",
    "created_at": "2026-10-24T15:31:13.390301",
    "cycles_completed": 0,
    "elapsed_seconds": 0,
    "ended_at": null,
    "focus_minutes": 0,
    "id": 60,
    "mode": "pomodoro",
    "paused_accumulated_seconds": 0,
    "paused_at": null,
    "remaining_seconds": 1500,
    "started_at": "2026-10-24T15:31:13.373496",
    "status": "running",
    "subject_id": 8,
    "target_minutes": 25,
    "topic_id": 57,
    "topic_title": "Number system and divisibility rules",
    "updated_at": "2026-10-24T15:31:13.390324"
  }
}

HTTP 200

### 25. A second concurrent timer is rejected
$ curl -s -X POST $B/student/focus-sessions -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"mode": "pomodoro", "target_minutes": 25}'
{
  "error": {
    "code": "FOCUS_SESSION_ACTIVE",
    "message": "A focus session is already running.",
    "session": {
      "break_minutes": 0,
      "course_id": 3,
      "course_title": "SSC CGL \u2014 Tier I Foundation",
      "created_at": "2026-10-24T15:31:13.390301",
      "cycles_completed": 0,
      "elapsed_seconds": 0,
      "ended_at": null,
      "focus_minutes": 0,
      "id": 60,
      "mode": "pomodoro",
      "paused_accumulated_seconds": 0,
      "paused_at": null,
      "remaining_seconds": 1500,
      "started_at": "2026-10-24T15:31:13.373496",
      "status": "running",
      "subject_id": 8,
      "target_minutes": 25,
      "topic_id": 57,
      "topic_title": "Number system and divisibility rules",
      "updated_at": "2026-10-24T15:31:13.390324"
    }
  }
}

HTTP 409

### 26. Pause then resume
$ curl -s -X PATCH $B/student/focus-sessions/60 -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"action": "pause"}'
{
  "achievements_earned": [],
  "server_time": "2026-10-24T15:31:13.583351",
  "session": {
    "break_minutes": 0,
    "course_id": 3,
    "course_title": "SSC CGL \u2014 Tier I Foundation",
    "created_at": "2026-10-24T15:31:13.390301",
    "cycles_completed": 0,
    "elapsed_seconds": 0,
    "ended_at": null,
    "focus_minutes": 0,
    "id": 60,
    "mode": "pomodoro",
    "paused_accumulated_seconds": 0,
    "paused_at": "2026-10-24T15:31:13.583351",
    "remaining_seconds": 1500,
    "started_at": "2026-10-24T15:31:13.373496",
    "status": "paused",
    "subject_id": 8,
    "target_minutes": 25,
    "topic_id": 57,
    "topic_title": "Number system and divisibility rules",
    "updated_at": "2026-10-24T15:31:13.586786"
  }
}

HTTP 200

### 27. Resume accumulates the pause server side
$ curl -s -X PATCH $B/student/focus-sessions/60 -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"action": "resume"}'
{
  "achievements_earned": [],
  "server_time": "2026-10-24T15:31:13.650857",
  "session": {
    "break_minutes": 0,
    "course_id": 3,
    "course_title": "SSC CGL \u2014 Tier I Foundation",
    "created_at": "2026-10-24T15:31:13.390301",
    "cycles_completed": 0,
    "elapsed_seconds": 0,
    "ended_at": null,
    "focus_minutes": 0,
    "id": 60,
    "mode": "pomodoro",
    "paused_accumulated_seconds": 0,
    "paused_at": null,
    "remaining_seconds": 1500,
    "started_at": "2026-10-24T15:31:13.373496",
    "status": "running",
    "subject_id": 8,
    "target_minutes": 25,
    "topic_id": 57,
    "topic_title": "Number system and divisibility rules",
    "updated_at": "2026-10-24T15:31:13.652181"
  }
}

HTTP 200

### 28. Stop: duration derived from timestamps, not from the client
$ curl -s -X PATCH $B/student/focus-sessions/60 -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"action": "complete"}'
{
  "achievements_earned": [],
  "server_time": "2026-10-24T15:31:13.718114",
  "session": {
    "break_minutes": 0,
    "course_id": 3,
    "course_title": "SSC CGL \u2014 Tier I Foundation",
    "created_at": "2026-10-24T15:31:13.390301",
    "cycles_completed": 0,
    "elapsed_seconds": 0,
    "ended_at": "2026-10-24T15:31:13.718114",
    "focus_minutes": 0,
    "id": 60,
    "mode": "pomodoro",
    "paused_accumulated_seconds": 0,
    "paused_at": null,
    "remaining_seconds": 1500,
    "started_at": "2026-10-24T15:31:13.373496",
    "status": "interrupted",
    "subject_id": 8,
    "target_minutes": 25,
    "topic_id": 57,
    "topic_title": "Number system and divisibility rules",
    "updated_at": "2026-10-24T15:31:13.722005"
  }
}

HTTP 200

### 29. Record a completed focus session (server validates the window)
$ curl -s -X POST $B/student/focus-sessions -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"mode": "pomodoro", "target_minutes": 25, "started_at": "2026-10-24T15:01:13", "ended_at": "2026-10-24T15:29:13", "focus_minutes": 25, "course_id": 3, "topic_id": 57}'
{
  "achievements_earned": [],
  "server_validated": true,
  "session": {
    "break_minutes": 0,
    "course_id": 3,
    "course_title": "SSC CGL \u2014 Tier I Foundation",
    "created_at": "2026-10-24T15:31:13.876130",
    "cycles_completed": 1,
    "elapsed_seconds": 1500,
    "ended_at": "2026-10-24T15:29:13",
    "focus_minutes": 25,
    "id": 61,
    "mode": "pomodoro",
    "paused_accumulated_seconds": 180,
    "paused_at": null,
    "remaining_seconds": 0,
    "started_at": "2026-10-24T15:01:13",
    "status": "completed",
    "subject_id": 8,
    "target_minutes": 25,
    "topic_id": 57,
    "topic_title": "Number system and divisibility rules",
    "updated_at": "2026-10-24T15:31:13.876166"
  }
}

HTTP 201

### 30. Impossible claimed duration is REJECTED
$ curl -s -X POST $B/student/focus-sessions -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"mode": "custom", "target_minutes": 120, "started_at": "2026-10-24T15:21:13", "ended_at": "2026-10-24T15:31:13", "focus_minutes": 120}'
{
  "error": {
    "code": "IMPOSSIBLE_DURATION",
    "fields": {
      "focus_minutes": "At most 10 minutes elapsed between the supplied timestamps."
    },
    "message": "The reported focus time is longer than the session window."
  }
}

HTTP 422

### 31. Focus history and daily totals
$ curl -s -X GET $B/student/focus-sessions?per_page=2 -H "Authorization: Bearer $A"
{
  "has_next": true,
  "has_prev": false,
  "items": [
    {
      "break_minutes": 0,
      "course_id": 3,
      "course_title": "SSC CGL \u2014 Tier I Foundation",
      "created_at": "2026-10-24T15:31:13.390301",
      "cycles_completed": 0,
      "ended_at": "2026-10-24T15:31:13.718114",
      "focus_minutes": 0,
      "id": 60,
      "mode": "pomodoro",
      "paused_accumulated_seconds": 0,
      "paused_at": null,
      "started_at": "2026-10-24T15:31:13.373496",
      "status": "interrupted",
      "subject_id": 8,
      "target_minutes": 25,
      "topic_id": 57,
      "topic_title": "Number system and divisibility rules",
      "updated_at": "2026-10-24T15:31:13.722005"
    },
    {
      "break_minutes": 0,
      "course_id": 3,
      "course_title": "SSC CGL \u2014 Tier I Foundation",
      "created_at": "2026-10-24T15:31:13.876130",
      "cycles_completed": 1,
      "ended_at": "2026-10-24T15:29:13",
      "focus_minutes": 25,
      "id": 61,
      "mode": "pomodoro",
      "paused_accumulated_seconds": 180,
      "paused_at": null,
      "started_at": "2026-10-24T15:01:13",
      "status": "completed",
      "subject_id": 8,
      "target_minutes": 25,
      "topic_id": 57,
      "topic_title": "Number system and divisibility rules",
      "updated_at": "2026-10-24T15:31:13.876166"
    }
  ],
  "page": 1,
  "pages": 10,
  "per_page": 2,
  "total": 19,
  "totals": {
    "cycles_completed": 36,
    "session_count": 19,
    "today_minutes": 25,
    "total_minutes": 900
  }
}

HTTP 200

### 32. Create a goal (progress is computed server side)
$ curl -s -X POST $B/student/goals -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"title": "Finish 20 topics this month", "category": "topics_count", "target_value": 20, "unit": "topics", "deadline": "2026-11-18"}'
{
  "goal": {
    "category": "topics_count",
    "completed_at": null,
    "course_id": null,
    "course_title": null,
    "created_at": "2026-10-24T15:31:14.196665",
    "current_value": 1.0,
    "deadline": "2026-11-18",
    "description": null,
    "id": 13,
    "progress_percent": 5.0,
    "start_date": "2026-10-24",
    "status": "active",
    "target_value": 20.0,
    "title": "Finish 20 topics this month",
    "unit": "topics",
    "updated_at": "2026-10-24T15:31:14.206930"
  }
}

HTTP 201

### 33. Goals list with recomputed progress
$ curl -s -X GET $B/student/goals -H "Authorization: Bearer $A"
{
  "counts": {
    "active": 5,
    "completed": 0,
    "overdue": 0,
    "paused": 0
  },
  "items": [
    {
      "category": "weekly_hours",
      "completed_at": null,
      "course_id": null,
      "course_title": null,
      "created_at": "2026-10-24T15:30:04.172455",
      "current_value": 1.25,
      "deadline": "2026-10-26",
      "description": "Study 25 hours this week \u2014 tracked from stored activity.",
      "id": 2,
      "progress_percent": 5.0,
      "start_date": "2026-10-17",
      "status": "active",
      "target_value": 25.0,
      "title": "Study 25 hours this week",
      "unit": "hours",
      "updated_at": "2026-10-24T15:31:14.320356"
    },
    {
      "category": "study_streak",
      "completed_at": null,
      "course_id": null,
      "course_title": null,
      "created_at": "2026-10-24T15:30:04.172461",
      "current_value": 1.0,
      "deadline": "2026-11-14",
      "description": "Hold a 14 day study streak \u2014 tracked from stored activity.",
      "id": 3,
      "progress_percent": 7.14,
      "start_date": "2026-10-17",
      "status": "active",
      "target_value": 14.0,
      "title": "Hold a 14 day study streak",
      "unit": "days",
      "updated_at": "2026-10-24T15:31:14.331250"
    },
    {
      "category": "topics_count",
      "completed_at": null,
      "course_id": null,
      "course_title": null,
      "created_at": "2026-10-24T15:31:14.196665",
      "current_value": 1.0,
      "deadline": "2026-11-18",
      "description": null,
      "id": 13,
      "progress_percent": 5.0,
      "start_date": "2026-10-24",
      "status": "active",
      "target_value": 20.0,
      "title": "Finish 20 topics this month",
      "unit": "topics",
      "updated_at": "2026-10-24T15:31:14.206930"
    },
    {
      "category": "topics_count",
      "completed_at": null,
      "course_id": null,
      "course_title": null,
      "created_at": "2026-10-24T15:30:04.172465",
      "current_value": 6.0,
      "deadline": "2026-11-23",
... (31 more lines truncated)

HTTP 200

### 34. Achievements (evaluated server side)
$ curl -s -X GET $B/student/achievements -H "Authorization: Bearer $A"
{
  "available": [
    {
      "code": "streak_7",
      "current_value": 3,
      "description": "Studied on seven consecutive days.",
      "icon": "flame",
      "id": 3,
      "metric": "study_streak_days",
      "progress_percent": 42.86,
      "threshold": 7,
      "title": "Seven Day Streak"
    },
    {
      "code": "first_course",
      "current_value": 0,
      "description": "Completed every topic in a course.",
      "icon": "award",
      "id": 4,
      "metric": "courses_completed",
      "progress_percent": 0.0,
      "threshold": 1,
      "title": "Course Finisher"
    },
    {
      "code": "weekly_target",
      "current_value": 0,
      "description": "Reached your weekly study target.",
      "icon": "target",
      "id": 5,
      "metric": "weekly_target_met",
      "progress_percent": 0.0,
      "threshold": 1,
      "title": "Weekly Target Hit"
    },
    {
      "code": "topics_100",
      "current_value": 26,
      "description": "Completed one hundred topics.",
      "icon": "layers",
      "id": 6,
      "metric": "topics_completed",
      "progress_percent": 26.0,
      "threshold": 100,
      "title": "Century of Topics"
    },
    {
      "code": "tasks_50",
      "current_value": 2,
      "description": "Completed fifty planned tasks.",
      "icon": "list-checks",
      "id": 7,
      "metric": "tasks_completed",
      "progress_percent": 4.0,
      "threshold": 50,
      "title": "Task Machine"
    },
    {
      "code": "focus_20h",
      "current_value": 900,
      "description": "Accumulated twenty hours of focus time.",
      "icon": "hourglass",
      "id": 8,
      "metric": "focus_minutes",
      "progress_percent": 75.0,
      "threshold": 1200,
      "title": "Twenty Focused Hours"
    }
  ],
  "earned": [
... (37 more lines truncated)

HTTP 200

### 35. Re-evaluate: no duplicate awards
$ curl -s -X POST $B/student/achievements/evaluate -H "Authorization: Bearer $A"
{
  "earned_total": 2,
  "newly_earned": []
}

HTTP 200

### 36. Analytics datasets (every PRD 3.8 chart)
$ curl -s -X GET $B/student/analytics?range=30d -H "Authorization: Bearer $A"
{
  "by_course": [
    {
      "course": "UPSC Civil Services \u2014 Prelims",
      "course_id": 1,
      "minutes": 480
    },
    {
      "course": "JEE Main \u2014 Physics, Chemistry & Mathematics",
      "course_id": 2,
      "minutes": 422
    }
  ],
  "by_subject": [
    {
      "minutes": 282,
      "subject": "Physics",
      "subject_id": 5
    },
    {
      "minutes": 230,
      "subject": "Modern Indian History",
      "subject_id": 2
    },
    {
      "minutes": 145,
      "subject": "Indian Polity",
      "subject_id": 1
    },
    {
      "minutes": 95,
      "subject": "Mathematics",
      "subject_id": 7
    },
    {
      "minutes": 60,
      "subject": "Indian and World Geography",
      "subject_id": 3
    },
    {
      "minutes": 45,
      "subject": "Indian Economy",
      "subject_id": 4
    },
    {
      "minutes": 45,
      "subject": "Chemistry",
      "subject_id": 6
    }
  ],
  "consistency_heatmap": [
    {
      "date": "2026-09-25",
      "level": 0,
      "minutes": 0
    },
    {
      "date": "2026-09-26",
      "level": 0,
      "minutes": 0
    },
    {
      "date": "2026-09-27",
      "level": 0,
      "minutes": 0
    },
    {
      "date": "2026-09-28",
      "level": 0,
      "minutes": 0
... (1190 more lines truncated)

HTTP 200

### 37. Analytics summary cards
$ curl -s -X GET $B/student/analytics/summary?period=week -H "Authorization: Bearer $A"
{
  "courses": 3,
  "last_week": {
    "active_days": 5,
    "focus_minutes": 375,
    "from": "2026-10-12",
    "planned_minutes": 460,
    "sessions_completed": 8,
    "studied_minutes": 470,
    "to": "2026-10-18"
  },
  "overdue_tasks": 1,
  "period": "week",
  "selected": {
    "active_days": 2,
    "focus_minutes": 75,
    "from": "2026-10-19",
    "percent": 4.17,
    "planned_minutes": 195,
    "sessions_completed": 1,
    "studied_minutes": 75,
    "target_minutes": 1800,
    "to": "2026-10-24"
  },
  "streak": {
    "active_days": 12,
    "current": 1,
    "last_active_date": "2026-10-24",
    "longest": 3
  },
  "syllabus_totals": {
    "completed_topics": 26,
    "completion_percent": 37.14,
    "estimated_minutes": 5570,
    "in_progress_topics": 6,
    "not_started_topics": 38,
    "time_spent_minutes": 2443,
    "total_topics": 70,
    "weighted_completion_percent": 37.79
  },
  "this_month": {
    "active_days": 12,
    "focus_minutes": 900,
    "from": "2026-10-01",
    "planned_minutes": 1185,
    "sessions_completed": 16,
    "studied_minutes": 1035,
    "to": "2026-10-24"
  },
  "this_week": {
    "active_days": 2,
    "focus_minutes": 75,
    "from": "2026-10-19",
    "planned_minutes": 195,
    "sessions_completed": 1,
    "studied_minutes": 75,
    "to": "2026-10-24"
  }
}

HTTP 200

### 38. Browse authorised study materials
$ curl -s -X GET $B/student/resources?per_page=3 -H "Authorization: Bearer $A"
{
  "has_next": true,
  "has_prev": false,
  "items": [
    {
      "course_id": 3,
      "course_title": "SSC CGL \u2014 Tier I Foundation",
      "created_at": "2026-10-24T15:30:04.601400",
      "description": "Formula and revision sheet curated for SSC CGL \u2014 Tier I Foundation.",
      "download_count": 0,
      "download_url": "",
      "external_url": null,
      "file_size_bytes": null,
      "has_file": false,
      "id": 9,
      "is_bookmarked": false,
      "is_owner_upload": false,
      "last_accessed_at": null,
      "mime_type": null,
      "resource_type": "revision_sheet",
      "status": "published",
      "subject_id": null,
      "tags": [
        "formulas",
        "revision"
      ],
      "title": "SSC CGL \u2014 Tier I Foundation: Formula and revision sheet",
      "topic_id": null,
      "visibility": "enrolled_only"
    },
    {
      "course_id": 3,
      "course_title": "SSC CGL \u2014 Tier I Foundation",
      "created_at": "2026-10-24T15:30:04.599940",
      "description": "Previous year question compilation curated for SSC CGL \u2014 Tier I Foundation.",
      "download_count": 0,
      "download_url": "",
      "external_url": null,
      "file_size_bytes": null,
      "has_file": false,
      "id": 8,
      "is_bookmarked": false,
      "is_owner_upload": false,
      "last_accessed_at": null,
      "mime_type": null,
      "resource_type": "practice_set",
      "status": "published",
      "subject_id": null,
      "tags": [
        "pyq",
        "practice"
      ],
      "title": "SSC CGL \u2014 Tier I Foundation: Previous year question compilation",
      "topic_id": null,
      "visibility": "enrolled_only"
    },
    {
      "course_id": 3,
      "course_title": "SSC CGL \u2014 Tier I Foundation",
      "created_at": "2026-10-24T15:30:04.598484",
      "description": "NCERT reference list for prelims curated for SSC CGL \u2014 Tier I Foundation.",
      "download_count": 0,
      "download_url": "",
      "external_url": "https://ncert.nic.in/textbook.php",
      "file_size_bytes": null,
      "has_file": false,
      "id": 7,
      "is_bookmarked": false,
      "is_owner_upload": false,
      "last_accessed_at": null,
... (19 more lines truncated)

HTTP 200

### 39. Upload a private note (type + size validated)
$ curl -s -X POST $B/student/resources -H "Authorization: Bearer $A" -F 'title=My private revision note' -F 'resource_type=note' -F 'description=Uploaded during verification' -F 'course_id=3' -F file=@/tmp/private-note.txt
{
  "max_upload_mb": 20,
  "resource": {
    "course_id": 3,
    "course_title": "SSC CGL \u2014 Tier I Foundation",
    "created_at": "2026-10-24T15:31:15.024372",
    "description": "Uploaded during verification",
    "download_count": 0,
    "download_url": "/api/v1/student/resources/file/-b5lMepL8-5Vc8oqND4y-wkhbEM1R5YO-_TJSQ_1HLo",
    "external_url": null,
    "file_size_bytes": 200,
    "has_file": true,
    "id": 10,
    "is_bookmarked": false,
    "is_owner_upload": true,
    "last_accessed_at": "2026-10-24T15:31:15.021595",
    "mime_type": "text/plain",
    "resource_type": "note",
    "status": "published",
    "subject_id": null,
    "tags": [],
    "title": "My private revision note",
    "topic_id": null,
    "visibility": "private"
  }
}

HTTP 201

### 40. Disallowed file type is rejected
$ curl -s -X POST $B/student/resources -H "Authorization: Bearer $A" -F 'title=Blocked upload' -F 'resource_type=note' -F file=@/tmp/blocked.exe
{
  "error": {
    "code": "VALIDATION_ERROR",
    "fields": {
      "file": "Allowed file types: csv, doc, docx, jpeg, jpg, md, pdf, png, txt."
    },
    "message": "Unsupported file type."
  }
}

HTTP 422

### 41. Download the note through its opaque token URL
$ curl -s -X GET $B/student/resources/file/-b5lMepL8-5Vc8oqND4y-wkhbEM1R5YO-_TJSQ_1HLo -H "Authorization: Bearer $A"
Private revision note for verification.
Private revision note for verification.
Private revision note for verification.
Private revision note for verification.
Private revision note for verification.


HTTP 200

### 42. Student B cannot download student A's private file (opaque token)
$ curl -s -X GET $B/student/resources/file/-b5lMepL8-5Vc8oqND4y-wkhbEM1R5YO-_TJSQ_1HLo -H "Authorization: Bearer $B_TOKEN"
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have access to this file."
  }
}

HTTP 403

### 43. Student B cannot read student A's private resource metadata
$ curl -s -X GET $B/student/resources/10 -H "Authorization: Bearer $B_TOKEN"
{
  "error": {
    "code": "NOT_FOUND",
    "message": "That resource was not found."
  }
}

HTTP 404

### 44. Bookmark toggle
$ curl -s -X POST $B/student/resources/10/bookmark -H "Authorization: Bearer $A"
{
  "bookmarked": true,
  "resource_id": 10
}

HTTP 201

### 45. Notification centre (reminders generated on read, deduped)
$ curl -s -X GET $B/student/notifications?per_page=3 -H "Authorization: Bearer $A"
{
  "has_next": true,
  "has_prev": false,
  "items": [
    {
      "body": "Starts at 24 Oct 16:25 for 50 minutes.",
      "created_at": "2026-10-24T15:31:15.244313",
      "id": 22,
      "is_read": false,
      "link": "/app/planner",
      "read_at": null,
      "title": "Study session: Task: Attempt full-length mock test (1/4)",
      "type": "session_upcoming"
    },
    {
      "body": "Starts at 24 Oct 15:45 for 35 minutes.",
      "created_at": "2026-10-24T15:31:15.231748",
      "id": 21,
      "is_read": false,
      "link": "/app/planner",
      "read_at": null,
      "title": "Study session: Revision: Motion in a straight line",
      "type": "session_upcoming"
    },
    {
      "body": "Moved to 13 Nov 15:00.",
      "created_at": "2026-10-24T15:31:13.294339",
      "id": 20,
      "is_read": false,
      "link": "/app/planner",
      "read_at": null,
      "title": "Session rescheduled: Polity revision block",
      "type": "plan_change"
    }
  ],
  "page": 1,
  "pages": 6,
  "per_page": 3,
  "total": 16,
  "unread_count": 15
}

HTTP 200

### 46. Unread count
$ curl -s -X GET $B/student/notifications/unread-count -H "Authorization: Bearer $A"
{
  "unread_count": 15
}

HTTP 200

### 47. Mark one notification read
$ curl -s -X PATCH $B/student/notifications/22/read -H "Authorization: Bearer $A"
{
  "notification": {
    "body": "Starts at 24 Oct 16:25 for 50 minutes.",
    "created_at": "2026-10-24T15:31:15.244313",
    "id": 22,
    "is_read": true,
    "link": "/app/planner",
    "read_at": "2026-10-24T15:31:15.452005",
    "title": "Study session: Task: Attempt full-length mock test (1/4)",
    "type": "session_upcoming"
  },
  "unread_count": 14
}

HTTP 200

### 48. Mark all read
$ curl -s -X POST $B/student/notifications/read-all -H "Authorization: Bearer $A"
{
  "unread_count": 0,
  "updated": 14
}

HTTP 200

### 49. Student announcements
$ curl -s -X GET $B/student/announcements -H "Authorization: Bearer $A"
{
  "items": [
    {
      "audience": "course",
      "body": "Version 1 of the syllabus is live. Your existing topic progress has been preserved.",
      "course_id": 1,
      "course_title": "UPSC Civil Services \u2014 Prelims",
      "created_at": "2026-10-24T15:30:04.609229",
      "expires_at": "2026-12-23T15:30:04.608342",
      "id": 2,
      "publish_at": "2026-10-23T15:30:04.608326",
      "title": "UPSC Civil Services \u2014 Prelims: revised syllabus published"
    },
    {
      "audience": "all",
      "body": "Set your daily study target in Profile & Settings, enroll in a course and generate your first timetable from the planner.",
      "course_id": null,
      "course_title": null,
      "created_at": "2026-10-24T15:30:04.606692",
      "expires_at": "2026-12-23T15:30:04.604462",
      "id": 1,
      "publish_at": "2026-10-23T15:30:04.604447",
      "title": "Welcome to Smart Study Planner"
    }
  ],
  "total": 2
}

HTTP 200

### 50. Update study preferences the dashboard and generator read
$ curl -s -X PATCH $B/student/profile -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d '{"daily_target_minutes": 200, "focus_duration_minutes": 30, "short_break_minutes": 5, "long_break_minutes": 20, "timezone": "Asia/Kolkata", "availability": {"mon": [{"start": "18:00", "end": "22:00"}], "sat": [{"start": "09:00", "end": "13:00"}]}}'
{
  "user": {
    "avatar_url": null,
    "created_at": "2026-10-24T15:30:02.699011",
    "email": "aarav@studyplanner.test",
    "email_verified": true,
    "full_name": "Aarav Sharma",
    "id": 2,
    "language": "en",
    "last_login_at": "2026-10-24T15:31:10.253455",
    "preferences": {
      "accessibility": {},
      "availability": {
        "mon": [
          {
            "end": "22:00",
            "start": "18:00"
          }
        ],
        "sat": [
          {
            "end": "13:00",
            "start": "09:00"
          }
        ]
      },
      "daily_target_minutes": 200,
      "focus_duration_minutes": 30,
      "long_break_minutes": 20,
      "notifications": {
        "announcement": true,
        "email_reminders": false,
        "goal_deadline": true,
        "new_resource": true,
        "revision_due": true,
        "session_upcoming": true,
        "task_due": true
      },
      "short_break_minutes": 5,
      "weekly_target_minutes": 1800
    },
    "role": "student",
    "status": "active",
    "timezone": "Asia/Kolkata",
    "updated_at": "2026-10-24T15:31:15.736750"
  }
}

HTTP 200

### 51. Dashboard now reads the updated daily target
$ curl -s -X GET $B/student/dashboard -H "Authorization: Bearer $A"
{
  "active_goals": [
    {
      "category": "weekly_hours",
      "completed_at": null,
      "course_id": null,
      "course_title": null,
      "created_at": "2026-10-24T15:30:04.172455",
      "current_value": 1.25,
      "deadline": "2026-10-26",
      "description": "Study 25 hours this week \u2014 tracked from stored activity.",
      "id": 2,
      "progress_percent": 5.0,
      "start_date": "2026-10-17",
      "status": "active",
      "target_value": 25.0,
      "title": "Study 25 hours this week",
      "unit": "hours",
      "updated_at": "2026-10-24T15:31:14.320356"
    },
    {
      "category": "study_streak",
      "completed_at": null,
      "course_id": null,
      "course_title": null,
      "created_at": "2026-10-24T15:30:04.172461",
      "current_value": 1.0,
      "deadline": "2026-11-14",
      "description": "Hold a 14 day study streak \u2014 tracked from stored activity.",
      "id": 3,
      "progress_percent": 7.14,
      "start_date": "2026-10-17",
      "status": "active",
      "target_value": 14.0,
      "title": "Hold a 14 day study streak",
      "unit": "days",
      "updated_at": "2026-10-24T15:31:14.331250"
    },
    {
      "category": "topics_count",
      "completed_at": null,
      "course_id": null,
      "course_title": null,
      "created_at": "2026-10-24T15:31:14.196665",
      "current_value": 1.0,
      "deadline": "2026-11-18",
      "description": null,
      "id": 13,
      "progress_percent": 5.0,
      "start_date": "2026-10-24",
      "status": "active",
      "target_value": 20.0,
      "title": "Finish 20 topics this month",
      "unit": "topics",
      "updated_at": "2026-10-24T15:31:14.206930"
    },
    {
      "category": "topics_count",
      "completed_at": null,
      "course_id": null,
      "course_title": null,
      "created_at": "2026-10-24T15:30:04.172465",
      "current_value": 6.0,
      "deadline": "2026-11-23",
      "description": "Complete 40 topics this month \u2014 tracked from stored activity.",
      "id": 4,
      "progress_percent": 15.0,
      "start_date": "2026-10-17",
      "status": "active",
      "target_value": 40.0,
... (369 more lines truncated)

HTTP 200

### 52. CROSS-STUDENT: B reads A's task -> not found
$ curl -s -X GET $B/student/tasks/25 -H "Authorization: Bearer $B_TOKEN"
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Task 25 was not found."
  }
}

HTTP 404

### 53. CROSS-STUDENT: B updates A's task -> not found
$ curl -s -X PATCH $B/student/tasks/25 -H "Authorization: Bearer $B_TOKEN" -H 'Content-Type: application/json' -d '{"status": "completed"}'
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Task 25 was not found."
  }
}

HTTP 404

### 54. CROSS-STUDENT: B reads A's goal -> not found
$ curl -s -X GET $B/student/goals/13 -H "Authorization: Bearer $B_TOKEN"
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Goal 13 was not found."
  }
}

HTTP 404

### 55. CROSS-STUDENT: B reads A's study session -> not found
$ curl -s -X GET $B/student/study-sessions/109 -H "Authorization: Bearer $B_TOKEN"
{
  "error": {
    "code": "NOT_FOUND",
    "message": "StudySession 109 was not found."
  }
}

HTTP 404

### 56. CROSS-STUDENT: B reads a syllabus for a course B is not enrolled in
$ curl -s -X GET $B/student/courses/1/syllabus -H "Authorization: Bearer $B_TOKEN"
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Enroll in this course before accessing its syllabus."
  }
}

HTTP 403

### 57. CROSS-STUDENT: B writes progress for that course's topic
$ curl -s -X PATCH $B/student/topics/1/progress -H "Authorization: Bearer $B_TOKEN" -H 'Content-Type: application/json' -d '{"status": "completed"}'
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Enroll in this course before accessing its syllabus."
  }
}

HTTP 403

### 58. No token on a student endpoint
$ curl -s -X GET $B/student/dashboard
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication is required. Send an Authorization: Bearer <token> header."
  }
}

HTTP 401

```

### Verification summary

| Check | Result |
|---|---|
| `GET /student/dashboard` | 200, every metric computed from stored rows (course completion 44.83 %, 5 topics this month, real streak and today/week totals) |
| `POST /student/enrollments` | 201 for a published course; 409 duplicate; 404 for unknown/unpublished |
| `GET /student/courses/:id/syllabus` | 200 nested subjects → units → chapters → topics with per-level roll-ups |
| `PATCH /student/topics/:id/progress` | 200 upsert, rolled-up chapter/unit/subject/course percentages returned |
| `POST /student/tasks` + filters | 201 / 200 with priority sort and status filters |
| `POST /student/timetable/generate` | 200 draft; re-run with the same inputs produced an identical plan (`session_plan_identical: true`); no internal overlaps; nothing persisted |
| `POST /student/timetable/generate/save` | 201, re-checks every row, all-or-nothing |
| **Overlapping study session** | **409 `SCHEDULE_CONFLICT`** with the conflicting session echoed back; `?force=true` stores it and still reports the conflict |
| Focus timer | server sets `started_at`; a stop after seconds stored `interrupted` with `focus_minutes: 0` despite a 25-minute claim; a second concurrent timer → 409; `/focus-sessions/active` recovers state |
| **Impossible claimed duration** | **422 `IMPOSSIBLE_DURATION`** (120 claimed minutes inside a 10-minute window) |
| Goals | `current_value` recomputed server side on every read/write |
| Achievements | repeat evaluation returned `newly_earned: []` — unique constraint + check, no duplicates |
| `GET /student/analytics` | 200 with all PRD 3.8 datasets (`daily_study`, `by_subject`, `course_completion`, `tasks_planned_vs_completed`, `focus_sessions`, `consistency_heatmap`, `streak`, `topics_donut`, `planned_vs_actual`, `overdue_tasks`, `upcoming_deadlines`, `insights`) |
| Materials | private upload 201; `.exe` rejected 422; download only through the opaque token URL |
| **Cross-student denial** | B → A's task 404 (read **and** write), A's goal 404, A's study session 404, A's private resource 404, A's file token 403, un-enrolled course syllabus 403, cross-student progress write 403 |
| No token | 401 `UNAUTHORIZED` |

58 verification steps, 0 failures.

## backend-admin

Phase 3 of the plan: every administrator endpoint of PRD section 4, built on the
existing app factory, models, `@admin_required` decorator, `paginate()`
envelope, `record_audit()` helper and the uniform error handler. 74 routes under
`/api/v1/admin/`, covering all nine PRD 4.1 navigation areas.

### New modules

```
app/admin/__init__.py            blueprint + module registration
app/admin/helpers.py             get_or_404, audit(), unique_slug(), csv_response()
app/admin/serializers.py         admin-facing shapes (no private student content)
app/admin/routes_dashboard.py    1. Dashboard
app/admin/routes_students.py     2. Student Management
app/admin/routes_courses.py      3. Course Management (lifecycle + subject links)
app/admin/routes_subjects.py     4. Subject Management
app/admin/routes_syllabus.py     5. Syllabus Management (units/chapters/topics)
app/admin/syllabus_service.py    versioning, progress migration, CSV import
app/admin/routes_resources.py    6. Study Material Management
app/admin/routes_announcements.py 7. Announcements & Notifications
app/admin/routes_reports.py      8. Reports & Analytics
app/admin/reports_service.py     the nine aggregate report builders
app/admin/routes_settings.py     9. Profile & Settings (+ admin accounts)
app/admin/routes_audit.py        audit log review + health (pre-existing)
```

### Migration

Four additive nullable columns were needed:

| Column | Purpose |
|---|---|
| `announcements.target_role` | role targeting (`audience='role'`) |
| `syllabus_versions.cloned_from_version_id` | version lineage |
| `syllabus_units.cloned_from_unit_id` | unit lineage for progress migration |
| `topics.cloned_from_topic_id` | **topic lineage — this is what carries student progress forward** |

```bash
cd "/home/abhi/Apps/Study planner/backend"
export FLASK_APP=run.py
.venv/bin/flask db migrate -m "admin: announcement role targeting and syllabus clone lineage"
.venv/bin/flask db upgrade
```

```
INFO  [alembic.autogenerate.compare.tables] Detected added column 'announcements.target_role'
INFO  [alembic.autogenerate.compare.tables] Detected added column 'syllabus_units.cloned_from_unit_id'
INFO  [alembic.autogenerate.compare.constraints] Detected added foreign key (cloned_from_unit_id)(id) on table syllabus_units
INFO  [alembic.autogenerate.compare.tables] Detected added column 'syllabus_versions.cloned_from_version_id'
INFO  [alembic.autogenerate.compare.constraints] Detected added foreign key (cloned_from_version_id)(id) on table syllabus_versions
INFO  [alembic.autogenerate.compare.tables] Detected added column 'topics.cloned_from_topic_id'
INFO  [alembic.autogenerate.compare.constraints] Detected added foreign key (cloned_from_topic_id)(id) on table topics
  Generating migrations/versions/125c14b95b85_admin_announcement_role_targeting_and_.py ... done
INFO  [alembic.runtime.migration] Running upgrade 6c14e2618786 -> 125c14b95b85, admin: announcement role targeting and syllabus clone lineage
```

### Re-seed (the schema changed)

```bash
cd "/home/abhi/Apps/Study planner/backend"
export FLASK_APP=run.py
.venv/bin/flask seed --reset
```

```
Clearing existing rows...
Seed summary
------------
  admin accounts     : 1 (created)
  student accounts   : 3
  courses            : 3 (published, syllabus version 1)
  syllabus topics    : 70
  enrollments added  : 6
  progress rows      : 60
  study sessions     : 105
  focus sessions     : 59
  tasks              : 24
  goals              : 12
  achievements award : 6
  notifications      : 9
  resources          : 9
  announcements      : 2
  platform settings  : 4

Login credentials
-----------------
  ADMIN    admin@studyplanner.test      Admin@12345
  STUDENT  aarav@studyplanner.test      Student@123
  STUDENT  priya@studyplanner.test      Student@123
  STUDENT  rohan@studyplanner.test      Student@123
```

### Boot (background, never foregrounded)

```bash
cd "/home/abhi/Apps/Study planner/backend"
pkill -f run.py; nohup .venv/bin/python run.py > /tmp/flask.log 2>&1 &
tail -f /tmp/flask.log
```

```
2026-10-24 21:52:38,179 INFO     app: Smart Study Planner API ready (env=development, db=sqlite:////home/abhi/Apps/Study planner/backend/instance/app.db)
 * Serving Flask app 'app'
 * Debug mode: on
2026-10-24 21:52:38,209 INFO     werkzeug: WARNING: This is a development server. Do not use it in a production deployment. Use a production WSGI server instead.
 * Running on http://127.0.0.1:5000
2026-10-24 21:52:38,210 INFO     werkzeug: Press CTRL+C to quit
```

Clean boot, zero import errors. After the whole verification run below,
`grep -nEi "traceback|exception|\" 500 " /tmp/flask.log` returned nothing.

### Syllabus versioning: how student progress survives a revision

`topic_progress` rows reference `topics.id`. Three rules keep them intact:

1. **Structural edits happen on a draft version.** `POST /admin/syllabus/versions`
   clones the published tree into a new `syllabus_versions` row plus new unit and
   topic rows. Students keep reading the published version while the draft is
   edited, so nothing they have done is touched.
2. **Publishing migrates progress forward instead of resetting it.** Each cloned
   row stores its ancestor (`cloned_from_unit_id` / `cloned_from_topic_id`).
   `POST /admin/syllabus/versions/:id/publish` copies every student's progress row
   from the ancestor topic onto the new topic — status, minutes spent, notes,
   priority, target date and revision schedule — skipping any row that already
   exists, so the migration is idempotent.
3. **The old version is archived, never deleted.** Its units and topics remain in
   the database, so the historical progress rows stay readable and auditable.

Direct metadata edits inside a published version (title, estimate, difficulty)
are allowed because they do not move a topic's identity. Deleting a unit or topic
that students have progress on is refused with 409 plus an impact count unless the
caller repeats the request with `force=true`.

Evidence in the transcript below: step 7 shows Aarav at 13/29 completed topics
(44.83 %) on course 1; step 7c publishes revision v2 and reports
`migrated_progress_rows: 24` with `archived_versions: [1]`; step 7d shows the
identical 13/29 and 44.83 % against the new version. Step 15b re-runs the
migration and creates 0 rows.

### Admin routes registered (74)

```
GET     /api/v1/admin/dashboard
GET     /api/v1/admin/students
GET     /api/v1/admin/students/export
GET     /api/v1/admin/students/<int:student_id>
GET     /api/v1/admin/students/<int:student_id>/progress
PATCH   /api/v1/admin/students/<int:student_id>/status
POST    /api/v1/admin/students/<int:student_id>/password-reset
POST    /api/v1/admin/students/bulk
GET     /api/v1/admin/courses
POST    /api/v1/admin/courses
GET     /api/v1/admin/courses/<int:course_id>
PATCH   /api/v1/admin/courses/<int:course_id>
DELETE  /api/v1/admin/courses/<int:course_id>
POST    /api/v1/admin/courses/<int:course_id>/publish
POST    /api/v1/admin/courses/<int:course_id>/unpublish
GET     /api/v1/admin/courses/<int:course_id>/preview
GET     /api/v1/admin/courses/<int:course_id>/enrollments
GET     /api/v1/admin/courses/<int:course_id>/subjects
POST    /api/v1/admin/courses/<int:course_id>/subjects
DELETE  /api/v1/admin/courses/<int:course_id>/subjects/<int:subject_id>
PATCH   /api/v1/admin/courses/<int:course_id>/subjects/reorder
GET     /api/v1/admin/subjects
POST    /api/v1/admin/subjects
GET     /api/v1/admin/subjects/<int:subject_id>
PATCH   /api/v1/admin/subjects/<int:subject_id>
DELETE  /api/v1/admin/subjects/<int:subject_id>
GET     /api/v1/admin/subjects/<int:subject_id>/units
PATCH   /api/v1/admin/subjects/reorder
GET     /api/v1/admin/syllabus
POST    /api/v1/admin/syllabus
PATCH   /api/v1/admin/syllabus/<int:item_id>
DELETE  /api/v1/admin/syllabus/<int:item_id>
PATCH   /api/v1/admin/syllabus/reorder
GET     /api/v1/admin/syllabus/preview
GET     /api/v1/admin/syllabus/versions
POST    /api/v1/admin/syllabus/versions
PATCH   /api/v1/admin/syllabus/versions/<int:version_id>
POST    /api/v1/admin/syllabus/versions/<int:version_id>/publish
POST    /api/v1/admin/syllabus/versions/<int:version_id>/migrate-progress
GET     /api/v1/admin/syllabus/versions/<int:version_id>/impact
POST    /api/v1/admin/syllabus/import
GET     /api/v1/admin/syllabus/import/template
GET     /api/v1/admin/resources
POST    /api/v1/admin/resources
GET     /api/v1/admin/resources/<int:resource_id>
PATCH   /api/v1/admin/resources/<int:resource_id>
DELETE  /api/v1/admin/resources/<int:resource_id>
GET     /api/v1/admin/resources/<int:resource_id>/file
POST    /api/v1/admin/resources/<int:resource_id>/publish
POST    /api/v1/admin/resources/<int:resource_id>/unpublish
GET     /api/v1/admin/resources/storage
GET     /api/v1/admin/announcements
POST    /api/v1/admin/announcements
GET     /api/v1/admin/announcements/<int:announcement_id>
PATCH   /api/v1/admin/announcements/<int:announcement_id>
DELETE  /api/v1/admin/announcements/<int:announcement_id>
POST    /api/v1/admin/announcements/<int:announcement_id>/publish
POST    /api/v1/admin/announcements/<int:announcement_id>/expire
GET     /api/v1/admin/announcements/<int:announcement_id>/recipients
GET     /api/v1/admin/reports
GET     /api/v1/admin/reports/summary
GET     /api/v1/admin/reports/export
GET     /api/v1/admin/audit-logs
GET     /api/v1/admin/profile
PATCH   /api/v1/admin/profile
POST    /api/v1/admin/profile/password
GET     /api/v1/admin/settings
PATCH   /api/v1/admin/settings
GET     /api/v1/admin/admins
POST    /api/v1/admin/admins
PATCH   /api/v1/admin/admins/<int:admin_id>
POST    /api/v1/admin/admins/<int:admin_id>/password-reset
POST    /api/v1/admin/admins/<int:admin_id>/resend-verification
GET     /api/v1/admin/health
```

### curl evidence

`$B` = `http://127.0.0.1:5000/api/v1`. `$ADMIN` / `$STUDENT` are the access tokens
of the seeded admin (`admin@studyplanner.test`) and a seeded student
(`aarav@studyplanner.test`). Scripts: `bash /tmp/verify_admin.sh`,
`bash /tmp/verify_admin2.sh`. Long bodies are truncated where marked; everything
else is the verbatim response, followed by the HTTP status.

```
admin token length: 415   student token length: 417

### 1. Admin dashboard statistics
$ curl -s "$B/admin/dashboard?from=2026-10-01&to=2026-10-24" -H "Authorization: Bearer $ADMIN"
{
    "activity": [
        {
            "active_students": 0,
            "date": "2026-10-01",
            "focus_minutes": 0,
            "focus_sessions": 0,
            "session_minutes": 0,
            "sessions": 0,
            "topics_completed": 0
        },
        {
            "active_students": 0,
            "date": "2026-10-02",
            "focus_minutes": 0,
            "focus_sessions": 0,
            "session_minutes": 0,
            "sessions": 0,
            "topics_completed": 2
        },
        {
            "active_students": 0,
            "date": "2026-10-03",
            "focus_minutes": 0,
            "focus_sessions": 0,
            "session_minutes": 0,
            "sessions": 0,
            "topics_completed": 2
        },
        {
            "active_students": 3,
            "date": "2026-10-04",
            "focus_minutes": 200,
            "focus_sessions": 5,
            "session_minutes": 315,
            "sessions": 5,
            "topics_completed": 0
        },
        {
            "active_students": 3,
... (435 more lines truncated)
HTTP 200
### 2. Students: search 'priya' + pagination
$ curl -s "$B/admin/students?q=priya&page=1&per_page=2" -H "Authorization: Bearer $ADMIN"
{
    "filters": {
        "course_id": null,
        "q": "priya",
        "status": null
    },
    "has_next": false,
    "has_prev": false,
    "items": [
        {
            "avatar_url": null,
            "completed_topics": 12,
            "created_at": "2026-10-24T16:22:04.703608",
            "email": "priya@studyplanner.test",
            "email_verified": true,
            "enrollment_count": 2,
            "full_name": "Priya Verma",
            "id": 3,
            "last_login_at": null,
            "role": "student",
            "status": "active",
            "timezone": "Asia/Kolkata"
        }
    ],
    "page": 1,
    "pages": 1,
    "per_page": 2,
    "total": 1
}

HTTP 200

### 2b. Students: page 2 of all students, per_page=2
$ curl -s "$B/admin/students?page=2&per_page=2&sort=email" -H "Authorization: Bearer $ADMIN"
{
    "filters": {
        "course_id": null,
        "q": null,
        "status": null
    },
    "has_next": false,
    "has_prev": true,
    "items": [
        {
            "avatar_url": null,
            "completed_topics": 7,
            "created_at": "2026-10-24T16:22:05.248685",
            "email": "rohan@studyplanner.test",
            "email_verified": true,
            "enrollment_count": 2,
            "full_name": "Rohan Iyer",
            "id": 4,
            "last_login_at": null,
            "role": "student",
            "status": "active",
            "timezone": "Asia/Kolkata"
        }
    ],
    "page": 2,
    "pages": 2,
    "per_page": 2,
    "total": 3
}

HTTP 200

### 2c. Student detail with activity (no private content)
$ curl -s $B/admin/students/3 -H "Authorization: Bearer $ADMIN"
{
    "account": {
        "created_at": "2026-10-24T16:22:04.703608",
        "daily_target_minutes": 240,
        "email_verified": true,
        "last_login_at": null,
        "status": "active",
        "timezone": "Asia/Kolkata"
    },
    "activity": {
        "active_goals": 4,
        "focus_minutes": 1225,
        "focus_sessions": 23,
        "planned_minutes": 2270,
        "private_uploads": 0,
        "studied_minutes": 1300,
        "study_sessions": 36,
        "tasks_by_status": {
            "completed": 2,
            "in_progress": 1,
            "pending": 5
        },
        "unread_notifications": 2,
        "window_days": 30
    },
    "enrollments": [
        {
            "course_id": 3,
            "course_title": "SSC CGL \u2014 Tier I Foundation",
            "difficulty": "medium",
            "enrolled_at": "2026-10-24T16:22:05.649662",
            "id": 4,
            "last_accessed_at": "2026-10-24T09:22:05.649259",
            "priority": "medium",
            "progress": {
                "completed_topics": 4,
                "completion_percent": 28.57,
                "estimated_minutes": 870,
                "in_progress_topics": 2,
                "not_started_topics": 8,
... (60 more lines truncated)
HTTP 200
### 3. Suspend student 3
$ curl -s -X PATCH $B/admin/students/3/status -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" -d "{\"status\":\"suspended\",\"reason\":\"Verification check\"}"
{
    "changed": true,
    "message": "Account status changed from active to suspended.",
    "previous_status": "active",
    "student": {
        "avatar_url": null,
        "completed_topics": 0,
        "created_at": "2026-10-24T16:22:04.703608",
        "email": "priya@studyplanner.test",
        "email_verified": true,
        "enrollment_count": 0,
        "full_name": "Priya Verma",
        "id": 3,
        "last_login_at": null,
        "role": "student",
        "status": "suspended",
        "timezone": "Asia/Kolkata"
    }
}

HTTP 200

### 3b. Suspended student's own token is now rejected
$ curl -s $B/student/dashboard -H "Authorization: Bearer $PRIYA"
{
    "error": {
        "code": "INVALID_TOKEN",
        "message": "The token is invalid: Bad Authorization header. Expected 'Authorization: Bearer <JWT>'"
    }
}

HTTP 401

### 3c. Activate student 3 again
$ curl -s -X PATCH $B/admin/students/3/status -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" -d "{\"status\":\"active\"}"
{
    "changed": true,
    "message": "Account status changed from suspended to active.",
    "previous_status": "suspended",
    "student": {
        "avatar_url": null,
        "completed_topics": 0,
        "created_at": "2026-10-24T16:22:04.703608",
        "email": "priya@studyplanner.test",
        "email_verified": true,
        "enrollment_count": 0,
        "full_name": "Priya Verma",
        "id": 3,
        "last_login_at": null,
        "role": "student",
        "status": "active",
        "timezone": "Asia/Kolkata"
    }
}

HTTP 200

### 4. Create a course
$ curl -s -X POST $B/admin/courses -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" -d @course.json
{
    "course": {
        "active_enrollment_count": 0,
        "category": "competitive_exam",
        "created_at": "2026-10-24T16:24:53.819248",
        "created_by": 1,
        "created_by_email": "admin@studyplanner.test",
        "description": "Bihar Public Service Commission prelims and mains preparation.",
        "enrollment_count": 0,
        "estimated_duration_weeks": 36,
        "id": 4,
        "level": "Advanced",
        "slug": "bpsc-combined-competitive-exam",
        "status": "draft",
        "subject_count": 0,
        "syllabus_version_count": 0,
        "target_audience": "BPSC aspirants",
        "thumbnail_url": null,
        "title": "BPSC Combined Competitive Exam",
        "topic_count": 0,
        "updated_at": "2026-10-24T16:24:53.819260"
    }
}

new course id = 4

### 4b. Publish the course
$ curl -s -X POST $B/admin/courses/$COURSE_ID/publish -H "Authorization: Bearer $ADMIN"
{
    "changed": true,
    "course": {
        "active_enrollment_count": 0,
        "category": "competitive_exam",
        "created_at": "2026-10-24T16:24:53.819248",
        "created_by": 1,
        "created_by_email": "admin@studyplanner.test",
        "description": "Bihar Public Service Commission prelims and mains preparation.",
        "enrollment_count": 0,
        "estimated_duration_weeks": 36,
        "id": 4,
        "level": "Advanced",
        "slug": "bpsc-combined-competitive-exam",
        "status": "published",
        "subject_count": 0,
        "syllabus_version_count": 0,
        "target_audience": "BPSC aspirants",
        "thumbnail_url": null,
        "title": "BPSC Combined Competitive Exam",
        "topic_count": 0,
        "updated_at": "2026-10-24T16:24:54.045424"
    },
    "previous_status": "draft",
    "published_syllabus_version": null,
    "warning": "This course has no published syllabus version yet."
}

HTTP 200

### 4c. Archiving a course with active enrollments is refused (409) without confirm
$ curl -s -X DELETE $B/admin/courses/1 -H "Authorization: Bearer $ADMIN"
{
    "error": {
        "code": "CONFLICT",
        "impact": {
            "active_enrollments": 2,
            "enrollments": 2,
            "students_with_records": 2,
            "topic_progress_preserved": true
        },
        "message": "2 student(s) are actively enrolled in 'UPSC Civil Services \u2014 Prelims'. Repeat the request with confirm=true to archive it. Existing enrollments and topic progress are preserved.",
        "requires_confirmation": true
    }
}

HTTP 409

### 5. Create a subject and link it to the new course
$ curl -s -X POST $B/admin/subjects -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" -d @subject.json
{
    "subject": {
        "course_count": 1,
        "course_id": 4,
        "course_weightage": 40.0,
        "created_at": "2026-10-24T16:24:54.382183",
        "description": "State specific general studies.",
        "display_order": 0,
        "id": 11,
        "name": "Bihar General Studies",
        "slug": "bihar-general-studies",
        "status": "active",
        "topic_count": 0,
        "unit_count": 0,
        "updated_at": "2026-10-24T16:24:54.382190",
        "weightage": 40.0
    }
}

### 5b. Create a draft syllabus version for the new course
$ curl -s -X POST $B/admin/syllabus/versions -H "Authorization: Bearer $ADMIN" -d "{\"course_id\":$COURSE_ID,\"clone\":false}"
{
    "cloned": {
        "cloned_from": null,
        "topics": 0,
        "units": 0
    },
    "message": "Draft version created. Students keep reading the published version until this draft is published.",
    "version": {
        "cloned_from_version_id": null,
        "course_id": 4,
        "created_at": "2026-10-24T16:24:54.566672",
        "id": 4,
        "notes": "First syllabus",
        "published_at": null,
        "status": "draft",
        "topic_count": 0,
        "unit_count": 0,
        "version_number": 1
    }
}

### 5c. Create a unit
$ curl -s -X POST $B/admin/syllabus -H "Authorization: Bearer $ADMIN" -d @unit.json
{
    "kind": "unit",
    "unit": {
        "cloned_from_unit_id": null,
        "created_at": "2026-10-24T16:24:54.738962",
        "description": "Ancient to modern Bihar.",
        "display_order": 0,
        "id": 51,
        "parent_id": null,
        "subject_id": 11,
        "subject_name": "Bihar General Studies",
        "syllabus_version_id": 4,
        "title": "Bihar History",
        "topic_count": 0,
        "unit_type": "unit",
        "updated_at": "2026-10-24T16:24:54.738970"
    }
}

### 5d. Create a chapter nested under the unit
$ curl -s -X POST $B/admin/syllabus -H "Authorization: Bearer $ADMIN" -d @chapter.json
{
    "kind": "chapter",
    "unit": {
        "cloned_from_unit_id": null,
        "created_at": "2026-10-24T16:24:54.933188",
        "description": null,
        "display_order": 0,
        "id": 52,
        "parent_id": 51,
        "subject_id": 11,
        "subject_name": "Bihar General Studies",
        "syllabus_version_id": 4,
        "title": "Magadha Empire",
        "topic_count": 0,
        "unit_type": "chapter",
        "updated_at": "2026-10-24T16:24:54.933199"
    }
}

### 5e. Create a topic under the chapter
$ curl -s -X POST $B/admin/syllabus -H "Authorization: Bearer $ADMIN" -d @topic.json
{
    "kind": "topic",
    "topic": {
        "cloned_from_topic_id": null,
        "created_at": "2026-10-24T16:24:55.109802",
        "description": null,
        "difficulty": "medium",
        "display_order": 0,
        "estimated_minutes": 75,
        "id": 71,
        "importance": "high",
        "title": "Rise of Magadha",
        "unit_id": 52,
        "updated_at": "2026-10-24T16:24:55.109810"
    }
}

HTTP 201

### 5f. Reorder: move the topic to position 5
$ curl -s -X PATCH $B/admin/syllabus/reorder -H "Authorization: Bearer $ADMIN" -d @reorder.json
{
    "ids": [
        51
    ],
    "kind": "unit",
    "updated": 1
}

HTTP 200

### 6. CSV bulk import (3 good rows, 3 deliberately broken rows)
$ cat /tmp/syllabus-import.csv
subject,unit,chapter,topic,estimated_minutes,difficulty,importance,description
Bihar General Studies,Bihar Geography,Rivers,Ganga basin in Bihar,60,medium,high,Course and tributaries
Bihar General Studies,Bihar Geography,Rivers,Kosi flood plains,45,hard,high,Flood management
Bihar General Studies,Bihar Economy,,Agriculture profile,90,medium,medium,Crops and irrigation
Bihar General Studies,Bihar Economy,,,30,easy,low,Missing topic title
Bihar General Studies,Bihar Polity,Local Bodies,Panchayati Raj in Bihar,abc,medium,high,Bad minutes value
Bihar General Studies,Bihar Polity,Local Bodies,Urban local bodies,50,extreme,high,Bad difficulty value

### 6b. POST the CSV
$ curl -s -X POST $B/admin/syllabus/import -H "Authorization: Bearer $ADMIN" -F "syllabus_version_id=$VERSION_ID" -F "file=@/tmp/syllabus-import.csv"
{
    "message": "Imported 3 topic(s) into draft version 1. Publish the version to roll it out to students.",
    "report": {
        "course_id": 4,
        "course_title": "BPSC Combined Competitive Exam",
        "created": {
            "chapters": 1,
            "subjects": 0,
            "topics": 3,
            "units": 2
        },
        "errors": [
            {
                "column": "topic",
                "message": "Topic is required.",
                "row": 5
            },
            {
                "column": "estimated_minutes",
                "message": "'abc' is not a number.",
                "row": 6
            },
            {
                "column": "difficulty",
                "message": "Must be one of: easy, medium, hard.",
                "row": 7
            }
        ],
        "linked_subjects": 0,
        "rows_read": 6,
        "rows_rejected": 3,
        "rows_valid": 3,
        "syllabus_version_id": 4
    },
    "version": {
        "cloned_from_version_id": null,
        "course_id": 4,
        "created_at": "2026-10-24T16:24:54.566672",
        "id": 4,
        "notes": "First syllabus",
... (8 more lines truncated)
HTTP 201
### 6c. The resulting admin syllabus tree
$ curl -s "$B/admin/syllabus?version_id=$VERSION_ID" -H "Authorization: Bearer $ADMIN"
{
    "course": {
        "id": 4,
        "slug": "bpsc-combined-competitive-exam",
        "status": "published",
        "title": "BPSC Combined Competitive Exam"
    },
    "student_impact": {
        "progress_rows": 0,
        "students": 0,
        "topics": 4
    },
    "subjects": [
        {
            "id": 11,
            "name": "Bihar General Studies",
            "slug": "bihar-general-studies",
            "status": "active",
            "units": [
                {
                    "children": [
                        {
                            "children": [],
                            "cloned_from_unit_id": null,
                            "created_at": "2026-10-24T16:24:54.933188",
                            "description": null,
                            "display_order": 0,
                            "id": 52,
                            "parent_id": 51,
                            "subject_id": 11,
                            "subject_name": "Bihar General Studies",
                            "syllabus_version_id": 4,
                            "title": "Magadha Empire",
                            "topic_count": 1,
                            "topics": [
                                {
                                    "cloned_from_topic_id": null,
                                    "created_at": "2026-10-24T16:24:55.109802",
                                    "description": null,
                                    "difficulty": "medium",
... (158 more lines truncated)
HTTP 200
### 6d. Publish the syllabus version
$ curl -s -X POST $B/admin/syllabus/versions/$VERSION_ID/publish -H "Authorization: Bearer $ADMIN"
{
    "publication": {
        "archived_versions": [],
        "migrated_progress_rows": 0,
        "note": "Progress rows were copied forward onto the new topics and the previous version was archived with its topics intact.",
        "student_progress_preserved": true,
        "topics": 4,
        "version_id": 4,
        "version_number": 1
    },
    "version": {
        "cloned_from_version_id": null,
        "course_id": 4,
        "created_at": "2026-10-24T16:24:54.566672",
        "id": 4,
        "notes": "First syllabus",
        "published_at": "2026-10-24T16:24:55.716325",
        "status": "published",
        "version_number": 1
    }
}

HTTP 200

### 7. Student progress on course 1 BEFORE a syllabus revision
$ curl -s $B/admin/students/2/progress -H "Authorization: Bearer $ADMIN"
{
    "courses": [
        {
            "course_id": 1,
            "course_title": "UPSC Civil Services \u2014 Prelims",
            "progress": {
                "completed_topics": 13,
                "completion_percent": 44.83,
                "estimated_minutes": 2295,
                "in_progress_topics": 3,
                "not_started_topics": 13,
                "time_spent_minutes": 1213,
                "total_topics": 29,
                "weighted_completion_percent": 42.92
            },
            "target_completion_date": "2027-03-23"
        },
        {
            "course_id": 2,
            "course_title": "JEE Main \u2014 Physics, Chemistry & Mathematics",
            "progress": {
                "completed_topics": 12,
                "completion_percent": 44.44,
                "estimated_minutes": 2405,
                "in_progress_topics": 3,
                "not_started_topics": 12,
                "time_spent_minutes": 1155,
                "total_topics": 27,
                "weighted_completion_percent": 44.07
            },
            "target_completion_date": "2027-05-22"
        }
    ],
    "student_id": 2
}

HTTP 200

### 7b. Clone course 1's published syllabus into a new draft version
$ curl -s -X POST $B/admin/syllabus/versions -H "Authorization: Bearer $ADMIN" -d "{\"course_id\":1,\"notes\":\"2027 revision\"}"
{
    "cloned": {
        "cloned_from": 1,
        "topics": 29,
        "units": 20
    },
    "message": "Draft version created. Students keep reading the published version until this draft is published.",
    "version": {
        "cloned_from_version_id": 1,
        "course_id": 1,
        "created_at": "2026-10-24T16:24:55.970333",
        "id": 5,
        "notes": "2027 revision",
        "published_at": null,
        "status": "draft",
        "topic_count": 29,
        "unit_count": 20,
        "version_number": 2
    }
}

### 7c. Publish the revision: progress rows are copied forward, old version archived
$ curl -s -X POST $B/admin/syllabus/versions/$REV_ID/publish -H "Authorization: Bearer $ADMIN"
{
    "publication": {
        "archived_versions": [
            1
        ],
        "migrated_progress_rows": 24,
        "note": "Progress rows were copied forward onto the new topics and the previous version was archived with its topics intact.",
        "student_progress_preserved": true,
        "topics": 29,
        "version_id": 5,
        "version_number": 2
    },
    "version": {
        "cloned_from_version_id": 1,
        "course_id": 1,
        "created_at": "2026-10-24T16:24:55.970333",
        "id": 5,
        "notes": "2027 revision",
        "published_at": "2026-10-24T16:24:56.171418",
        "status": "published",
        "version_number": 2
    }
}

HTTP 200

### 7d. Same student, same progress, AFTER the revision
$ curl -s $B/admin/students/2/progress -H "Authorization: Bearer $ADMIN"
{
    "courses": [
        {
            "course_id": 1,
            "course_title": "UPSC Civil Services \u2014 Prelims",
            "progress": {
                "completed_topics": 13,
                "completion_percent": 44.83,
                "estimated_minutes": 2295,
                "in_progress_topics": 3,
                "not_started_topics": 13,
                "time_spent_minutes": 1213,
                "total_topics": 29,
                "weighted_completion_percent": 42.92
            },
            "target_completion_date": "2027-03-23"
        },
        {
            "course_id": 2,
            "course_title": "JEE Main \u2014 Physics, Chemistry & Mathematics",
            "progress": {
                "completed_topics": 12,
                "completion_percent": 44.44,
                "estimated_minutes": 2405,
                "in_progress_topics": 3,
                "not_started_topics": 12,
                "time_spent_minutes": 1155,
                "total_topics": 27,
                "weighted_completion_percent": 44.07
            },
            "target_completion_date": "2027-05-22"
        }
    ],
    "student_id": 2
}

HTTP 200

### 7e. Deleting a topic students have progress on is refused (409)
$ curl -s -X DELETE "$B/admin/syllabus/1?kind=topic" -H "Authorization: Bearer $ADMIN"
{
    "error": {
        "code": "CONFLICT",
        "message": "This syllabus version is archived. Create a new draft version to make changes."
    }
}

HTTP 409

### 8. Upload a study material (multipart, published, enrolled_only)
$ curl -s -X POST $B/admin/resources -H "Authorization: Bearer $ADMIN" -F "title=BPSC Bihar GS Notes" -F "resource_type=document" -F "status=published" -F "visibility=enrolled_only" -F "course_id=$COURSE_ID" -F "file=@/tmp/material.txt"
{
    "max_upload_mb": 20,
    "notified_students": 0,
    "resource": {
        "course_id": 4,
        "course_title": "BPSC Combined Competitive Exam",
        "created_at": "2026-10-24T16:24:56.554352",
        "description": null,
        "download_count": 0,
        "download_url": "/api/v1/admin/resources/10/file",
        "external_url": null,
        "file_size_bytes": 80,
        "has_file": true,
        "id": 10,
        "last_accessed_at": null,
        "mime_type": "text/plain",
        "owner_id": null,
        "resource_type": "document",
        "status": "published",
        "subject_id": null,
        "subject_name": null,
        "tags": [
            "bpsc",
            "notes"
        ],
        "title": "BPSC Bihar GS Notes",
        "topic_id": null,
        "topic_title": null,
        "unit_id": null,
        "unit_title": null,
        "updated_at": "2026-10-24T16:24:56.554361",
        "uploaded_by": 1,
        "uploaded_by_email": "admin@studyplanner.test",
        "visibility": "enrolled_only"
    }
}

HTTP 201

### 8b. Oversized / wrong file type is rejected
$ curl -s -X POST $B/admin/resources -H "Authorization: Bearer $ADMIN" -F "title=Bad" -F "resource_type=image" -F "file=@/tmp/material.txt"
{
    "error": {
        "code": "VALIDATION_ERROR",
        "fields": {
            "file": "A image resource accepts: jpeg, jpg, png."
        },
        "message": "The file does not match the selected resource type."
    }
}

HTTP 422

### 8c. Storage usage
$ curl -s $B/admin/resources/storage -H "Authorization: Bearer $ADMIN"
{
    "allowed_extensions": [
        "csv",
        "doc",
        "docx",
        "jpeg",
        "jpg",
        "md",
        "pdf",
        "png",
        "txt"
    ],
    "by_type": [
        {
            "bytes": 80,
            "count": 1,
            "resource_type": "document"
        },
        {
            "bytes": 0,
            "count": 3,
            "resource_type": "link"
        },
        {
            "bytes": 0,
            "count": 3,
            "resource_type": "practice_set"
        },
        {
            "bytes": 0,
            "count": 3,
            "resource_type": "revision_sheet"
        }
    ],
    "disk": {
        "file_count": 3,
        "root": "/home/abhi/Apps/Study planner/backend/uploads",
        "total_bytes": 280
    },
    "failures": [],
... (8 more lines truncated)
HTTP 200
### 9. Create + publish a course-targeted announcement (fans out to notifications)
$ curl -s -X POST $B/admin/announcements -H "Authorization: Bearer $ADMIN" -d @announcement.json
{
    "announcement": {
        "audience": "course",
        "body": "The revised weekly timetable for UPSC Prelims is now available in your planner.",
        "course_id": 1,
        "course_title": "UPSC Civil Services \u2014 Prelims",
        "created_at": "2026-10-24T16:24:56.963019",
        "created_by": 1,
        "created_by_email": "admin@studyplanner.test",
        "delivery": {
            "delivered": 2,
            "read": 0,
            "read_percent": 0.0,
            "targeted": 2,
            "view_count": 0
        },
        "expires_at": "2026-12-31T23:59:00",
        "id": 3,
        "publish_at": "2026-10-24T16:24:56.961626",
        "status": "published",
        "target_role": null,
        "title": "UPSC prelims timetable published",
        "updated_at": "2026-10-24T16:24:56.963024",
        "view_count": 0
    },
    "fan_out": {
        "notifications_created": 2,
        "targeted": 2
    }
}

HTTP 201

### 9b. Role-targeted announcement
$ curl -s -X POST $B/admin/announcements -H "Authorization: Bearer $ADMIN" -d @role-announcement.json
{
    "announcement": {
        "audience": "role",
        "body": "The planner will be read-only on Sunday 02:00-03:00 IST.",
        "course_id": null,
        "course_title": null,
        "created_at": "2026-10-24T16:24:57.123121",
        "created_by": 1,
        "created_by_email": "admin@studyplanner.test",
        "delivery": {
            "delivered": 3,
            "read": 0,
            "read_percent": 0.0,
            "targeted": 3,
            "view_count": 0
        },
        "expires_at": null,
        "id": 4,
        "publish_at": "2026-10-24T16:24:57.122628",
        "status": "published",
        "target_role": "student",
        "title": "Platform maintenance window",
        "updated_at": "2026-10-24T16:24:57.123126",
        "view_count": 0
    },
    "fan_out": {
        "notifications_created": 3,
        "targeted": 3
    }
}

HTTP 201

### 9c. Announcement list with delivery statistics
$ curl -s "$B/admin/announcements?per_page=3" -H "Authorization: Bearer $ADMIN"
{
    "has_next": true,
    "has_prev": false,
    "items": [
        {
            "audience": "role",
            "body": "The planner will be read-only on Sunday 02:00-03:00 IST.",
            "course_id": null,
            "course_title": null,
            "created_at": "2026-10-24T16:24:57.123121",
            "created_by": 1,
            "created_by_email": "admin@studyplanner.test",
            "delivery": {
                "delivered": 3,
                "read": 0,
                "read_percent": 0.0,
                "targeted": 3,
                "view_count": 0
            },
            "expires_at": null,
            "id": 4,
            "publish_at": "2026-10-24T16:24:57.122628",
            "status": "published",
            "target_role": "student",
            "title": "Platform maintenance window",
            "updated_at": "2026-10-24T16:24:57.123126",
            "view_count": 0
        },
        {
            "audience": "course",
            "body": "The revised weekly timetable for UPSC Prelims is now available in your planner.",
            "course_id": 1,
            "course_title": "UPSC Civil Services \u2014 Prelims",
            "created_at": "2026-10-24T16:24:56.963019",
            "created_by": 1,
            "created_by_email": "admin@studyplanner.test",
            "delivery": {
                "delivered": 2,
                "read": 0,
                "read_percent": 0.0,
... (45 more lines truncated)
HTTP 200
### 9d. The targeted student now sees it in their notification centre
$ curl -s "$B/student/notifications?per_page=3" -H "Authorization: Bearer $STUDENT"
{
    "has_next": true,
    "has_prev": false,
    "items": [
        {
            "body": "Set your daily study target in Profile & Settings, enroll in a course and generate your first timetable from the planner.",
            "created_at": "2026-10-24T16:24:57.524893",
            "id": 23,
            "is_read": false,
            "link": "/app/notifications",
            "read_at": null,
            "title": "Welcome to Smart Study Planner",
            "type": "announcement"
        },
        {
            "body": "Version 1 of the syllabus is live. Your existing topic progress has been preserved.",
            "created_at": "2026-10-24T16:24:57.519007",
            "id": 22,
            "is_read": false,
            "link": "/app/notifications",
            "read_at": null,
            "title": "UPSC Civil Services \u2014 Prelims: revised syllabus published",
            "type": "announcement"
        },
        {
            "body": "Deadline 2026-10-26.",
            "created_at": "2026-10-24T16:24:57.506648",
            "id": 21,
            "is_read": false,
            "link": "/app/goals",
            "read_at": null,
            "title": "Goal deadline approaching: Study 25 hours this week",
            "type": "goal_deadline"
        }
    ],
    "page": 1,
    "pages": 5,
    "per_page": 3,
    "total": 14,
    "unread_count": 13
... (4 more lines truncated)
HTTP 200
### 10. Report: registrations
$ curl -s "$B/admin/reports?type=registrations&from=2026-10-18&to=2026-10-24" -H "Authorization: Bearer $ADMIN"
{
    "available_types": [
        "registrations",
        "active_users",
        "enrollments",
        "resources",
        "engagement",
        "progress",
        "focus",
        "notifications",
        "accounts"
    ],
    "columns": [
        "date",
        "registrations",
        "verified",
        "cumulative"
    ],
    "filters": {
        "course_id": null
    },
    "range": {
        "days": 7,
        "from": "2026-10-18",
        "to": "2026-10-24"
    },
    "series": [
        {
            "cumulative": 0,
            "date": "2026-10-18",
            "registrations": 0,
            "verified": 0
        },
        {
            "cumulative": 0,
            "date": "2026-10-19",
            "registrations": 0,
            "verified": 0
        },
        {
... (40 more lines truncated)
HTTP 200
### 10b. Report: engagement by course
$ curl -s "$B/admin/reports?type=engagement&from=2026-10-01&to=2026-10-24" -H "Authorization: Bearer $ADMIN"
{
    "available_types": [
        "registrations",
        "active_users",
        "enrollments",
        "resources",
        "engagement",
        "progress",
        "focus",
        "notifications",
        "accounts"
    ],
    "columns": [
        "course_id",
        "course",
        "enrolled_students",
        "active_students",
        "engagement_percent",
        "sessions",
        "studied_minutes",
        "planned_minutes",
        "plan_adherence_percent",
        "focus_sessions",
        "focus_minutes"
    ],
    "filters": {
        "course_id": null
    },
    "range": {
        "days": 24,
        "from": "2026-10-01",
        "to": "2026-10-24"
    },
    "series": [
        {
            "active_students": 2,
            "course": "SSC CGL \u2014 Tier I Foundation",
            "course_id": 3,
            "engagement_percent": 100.0,
            "enrolled_students": 2,
... (58 more lines truncated)
HTTP 200
### 10c. Report: aggregate syllabus progress
$ curl -s "$B/admin/reports?type=progress" -H "Authorization: Bearer $ADMIN"
{
    "available_types": [
        "registrations",
        "active_users",
        "enrollments",
        "resources",
        "engagement",
        "progress",
        "focus",
        "notifications",
        "accounts"
    ],
    "columns": [
        "course_id",
        "course",
        "subject_id",
        "subject",
        "topics",
        "enrolled_students",
        "completed_records",
        "in_progress_records",
        "expected_records",
        "aggregate_completion_percent",
        "time_spent_minutes"
    ],
    "filters": {
        "course_id": null
    },
    "range": {
        "days": 30,
        "from": "2026-09-25",
        "to": "2026-10-24"
    },
    "series": [
        {
            "aggregate_completion_percent": 0.0,
            "completed_records": 0,
            "course": "BPSC Combined Competitive Exam",
            "course_id": 4,
            "enrolled_students": 0,
... (150 more lines truncated)
HTTP 200
### 10d. Report: accounts
$ curl -s "$B/admin/reports?type=accounts&from=2026-10-01&to=2026-10-24" -H "Authorization: Bearer $ADMIN"
{
    "available_types": [
        "registrations",
        "active_users",
        "enrollments",
        "resources",
        "engagement",
        "progress",
        "focus",
        "notifications",
        "accounts"
    ],
    "columns": [
        "date",
        "status_changes"
    ],
    "filters": {
        "course_id": null
    },
    "range": {
        "days": 24,
        "from": "2026-10-01",
        "to": "2026-10-24"
    },
    "series": [
        {
            "date": "2026-10-01",
            "status_changes": 0
        },
        {
            "date": "2026-10-02",
            "status_changes": 0
        },
        {
            "date": "2026-10-03",
            "status_changes": 0
        },
        {
            "date": "2026-10-04",
            "status_changes": 0
... (98 more lines truncated)
HTTP 200
### 10e. Report summary (all nine report types)
$ curl -s "$B/admin/reports/summary?from=2026-10-01&to=2026-10-24" -H "Authorization: Bearer $ADMIN"
{
    "filters": {
        "course_id": null
    },
    "range": {
        "days": 24,
        "from": "2026-10-01",
        "to": "2026-10-24"
    },
    "summary": {
        "accounts": {
            "active": 3,
            "admins": 1,
            "pending_verification": 0,
            "status_changes_in_range": 2,
            "suspended": 0,
            "total_students": 3,
            "unverified": 0,
            "verification_rate_percent": 100.0,
            "verified": 3
        },
        "active_users": {
            "monthly_active": 3,
            "total_students": 3,
            "unique_active_in_range": 3,
            "weekly_active": 3
        },
        "engagement": {
            "focus_minutes": 2900,
            "planned_minutes": 4910,
            "sessions": 80,
            "studied_minutes": 3217
        },
        "enrollments": {
            "active": 6,
            "courses": 4,
            "enrollments": 6,
            "new_in_range": 6
        },
        "focus": {
... (35 more lines truncated)
HTTP 200
### 10f. CSV export of the enrollments report
$ curl -s -D- "$B/admin/reports/export?type=enrollments" -H "Authorization: Bearer $ADMIN"
HTTP/1.1 200 OK
Server: Werkzeug/3.1.9 Python/3.14.4
Date: Sat, 24 Oct 2026 16:24:58 GMT
Content-Disposition: attachment; filename="report-enrollments-2026-09-25-to-2026-10-24.csv"
Content-Length: 315
Content-Type: text/csv; charset=utf-8
Access-Control-Allow-Origin: http://127.0.0.1:5173
Access-Control-Expose-Headers: Content-Disposition
Access-Control-Allow-Credentials: true
Vary: Origin
Connection: close

course_id,course,course_status,enrollments,active,completed,dropped,new_in_range
2,"JEE Main — Physics, Chemistry & Mathematics",published,2,2,0,0,2
3,SSC CGL — Tier I Foundation,published,2,2,0,0,2
1,UPSC Civil Services — Prelims,published,2,2,0,0,2
4,BPSC Combined Competitive Exam,published,0,0,0,0,0

### 10g. CSV export of the student directory
$ curl -s "$B/admin/students/export" -H "Authorization: Bearer $ADMIN"
id,full_name,email,status,email_verified,created_at,last_login_at,enrollment_count,completed_topics
4,Rohan Iyer,rohan@studyplanner.test,active,yes,2026-10-24T16:22:05.248685,,2,12
3,Priya Verma,priya@studyplanner.test,active,yes,2026-10-24T16:22:04.703608,,2,12
2,Aarav Sharma,aarav@studyplanner.test,active,yes,2026-10-24T16:22:04.138152,2026-10-24T16:24:52.047077,2,38

### 11. Audit log: the entries the actions above wrote
$ curl -s "$B/admin/audit-logs?per_page=20" -H "Authorization: Bearer $ADMIN"
{
    "has_next": true,
    "has_prev": false,
    "items": [
        {
            "action": "student.exported",
            "actor_email": "admin@studyplanner.test",
            "actor_id": 1,
            "created_at": "2026-10-24T16:24:58.421747",
            "detail": {
                "filters": {},
                "rows": 3
            },
            "entity_id": null,
            "entity_type": "user",
            "id": 22,
            "ip_address": "127.0.0.1"
        },
        {
            "action": "report.exported",
            "actor_email": "admin@studyplanner.test",
            "actor_id": 1,
            "created_at": "2026-10-24T16:24:58.385927",
            "detail": {
                "from": "2026-09-25",
                "rows": 4,
                "to": "2026-10-24",
                "type": "enrollments"
            },
            "entity_id": null,
            "entity_type": "report",
            "id": 21,
            "ip_address": "127.0.0.1"
        },
        {
            "action": "announcement.published",
            "actor_email": "admin@studyplanner.test",
            "actor_id": 1,
            "created_at": "2026-10-24T16:24:57.148540",
            "detail": {
... (300 more lines truncated)
HTTP 200
### 11b. Audit log filtered by action
$ curl -s "$B/admin/audit-logs?action=syllabus&per_page=5" -H "Authorization: Bearer $ADMIN"
{
    "has_next": true,
    "has_prev": false,
    "items": [
        {
            "action": "syllabus.version_published",
            "actor_email": "admin@studyplanner.test",
            "actor_id": 1,
            "created_at": "2026-10-24T16:24:56.173581",
            "detail": {
                "archived_versions": [
                    1
                ],
                "migrated_progress_rows": 24,
                "note": "Progress rows were copied forward onto the new topics and the previous version was archived with its topics intact.",
                "student_progress_preserved": true,
                "topics": 29,
                "version_id": 5,
                "version_number": 2
            },
            "entity_id": 5,
            "entity_type": "syllabus_version",
            "id": 15,
            "ip_address": "127.0.0.1"
        },
        {
            "action": "syllabus.version_created",
            "actor_email": "admin@studyplanner.test",
            "actor_id": 1,
            "created_at": "2026-10-24T16:24:55.997358",
            "detail": {
                "cloned_from": 1,
                "course_id": 1,
                "topics": 29,
                "units": 20,
                "version": 2
            },
            "entity_id": 5,
            "entity_type": "syllabus_version",
            "id": 14,
... (68 more lines truncated)
HTTP 200
=== AUTHORIZATION: student token and anonymous requests on admin endpoints ===
GET  /api/v1/admin/dashboard                         student=403  anonymous=401
GET  /api/v1/admin/students                          student=403  anonymous=401
GET  /api/v1/admin/courses                           student=403  anonymous=401
GET  /api/v1/admin/syllabus?course_id=1              student=403  anonymous=401
GET  /api/v1/admin/resources                         student=403  anonymous=401
GET  /api/v1/admin/announcements                     student=403  anonymous=401
GET  /api/v1/admin/reports?type=registrations        student=403  anonymous=401
GET  /api/v1/admin/audit-logs                        student=403  anonymous=401
GET  /api/v1/admin/settings                          student=403  anonymous=401
GET  /api/v1/admin/profile                           student=403  anonymous=401
POST /api/v1/admin/courses                           student=403  anonymous=401
POST /api/v1/admin/subjects                          student=403  anonymous=401
POST /api/v1/admin/announcements                     student=403  anonymous=401
POST /api/v1/admin/syllabus                          student=403  anonymous=401
PATCH/api/v1/admin/students/3/status                 student=403  anonymous=401

### 12b. Student token body on /admin/dashboard
$ curl -s $B/admin/dashboard -H "Authorization: Bearer $STUDENT"
{
    "error": {
        "code": "FORBIDDEN",
        "message": "This endpoint requires the admin role."
    }
}

HTTP 403

### 12c. Student token body on /admin/students
$ curl -s $B/admin/students -H "Authorization: Bearer $STUDENT"
{
    "error": {
        "code": "FORBIDDEN",
        "message": "This endpoint requires the admin role."
    }
}

HTTP 403

### 12d. Anonymous request on /admin/audit-logs
$ curl -s $B/admin/audit-logs
{
    "error": {
        "code": "UNAUTHORIZED",
        "message": "Authentication is required. Send an Authorization: Bearer <token> header."
    }
}

HTTP 401

### 13. Platform settings
$ curl -s $B/admin/settings -H "Authorization: Bearer $ADMIN"
{
    "editable_keys": [
        "allowed_resource_types",
        "course_categories",
        "max_upload_mb",
        "notification_defaults"
    ],
    "other_settings": [],
    "runtime": {
        "ai_provider_configured": false,
        "allowed_upload_extensions": [
            "csv",
            "doc",
            "docx",
            "jpeg",
            "jpg",
            "md",
            "pdf",
            "png",
            "txt"
        ],
        "environment": "development",
        "max_upload_mb": 20,
        "require_email_verification": false
    },
    "settings": {
        "allowed_resource_types": {
            "description": "Resource types administrators may upload.",
            "key": "allowed_resource_types",
            "updated_at": "2026-10-24T16:22:06.016409",
            "updated_by": 1,
            "value": [
                "pdf",
                "document",
                "image",
                "link",
                "practice_set",
                "revision_sheet",
                "note"
            ]
... (39 more lines truncated)
HTTP 200
### 13b. Update a platform setting
$ curl -s -X PATCH $B/admin/settings -H "Authorization: Bearer $ADMIN" -d "{\"max_upload_mb\":25}"
{
    "updated": {
        "max_upload_mb": 25
    }
}

HTTP 200

### 13c. Admin health
$ curl -s $B/admin/health -H "Authorization: Bearer $ADMIN"
{
    "ai_provider": "missing",
    "db": "ok",
    "environment": "development",
    "storage": {
        "file_count": 3,
        "root": "/home/abhi/Apps/Study planner/backend/uploads",
        "total_bytes": 280
    }
}

HTTP 200

=== done ===

### 14. Deleting a LIVE topic that students have progress on is refused (409)
$ curl -s -X DELETE "$B/admin/syllabus/102?kind=topic" -H "Authorization: Bearer $ADMIN"
{
    "error": {
        "code": "CONFLICT",
        "impact": {
            "progress_rows": 2,
            "students": 2,
            "topics": 1
        },
        "message": "2 student(s) have progress on 'Writs and constitutional remedies'. Repeat with force=true to delete it and their progress rows.",
        "requires_force": true
    }
}

HTTP 409

### 14b. Editing that topic's metadata is allowed and keeps progress
$ curl -s -X PATCH $B/admin/syllabus/102 -H "Authorization: Bearer $ADMIN" -d "{\"kind\":\"topic\",\"title\":\"Writs and constitutional remedies (revised)\",\"estimated_minutes\":95}"
{
    "kind": "topic",
    "progress_preserved": true,
    "topic": {
        "cloned_from_topic_id": 8,
        "created_at": "2026-10-24T16:24:55.994459",
        "description": "Writs and constitutional remedies \u2014 part of Fundamental Rights (Indian Polity).",
        "difficulty": "hard",
        "display_order": 2,
        "estimated_minutes": 95,
        "id": 102,
        "importance": "high",
        "title": "Writs and constitutional remedies (revised)",
        "unit_id": 64,
        "updated_at": "2026-10-24T16:28:38.087104"
    }
}

HTTP 200

### 14c. Version impact report before a major change
$ curl -s $B/admin/syllabus/versions/5/impact -H "Authorization: Bearer $ADMIN"
{
    "enrollments": 2,
    "guidance": "Create a new draft version and publish it instead of editing a published structure; publishing copies progress forward.",
    "progress": {
        "progress_rows": 24,
        "students": 2,
        "topics": 29
    },
    "version": {
        "cloned_from_version_id": 1,
        "course_id": 1,
        "created_at": "2026-10-24T16:24:55.970333",
        "id": 5,
        "notes": "2027 revision",
        "published_at": "2026-10-24T16:24:56.171418",
        "status": "published",
        "version_number": 2
    }
}

HTTP 200

### 14d. Bulk suspend then the audit trail it wrote
$ curl -s -X POST $B/admin/students/bulk -H "Authorization: Bearer $ADMIN" -d "{\"ids\":[3,4],\"action\":\"suspend\",\"reason\":\"Bulk check\"}"
{
    "action": "suspend",
    "not_found": 0,
    "requested": 2,
    "skipped": 0,
    "status": "suspended",
    "updated": 2,
    "updated_ids": [
        3,
        4
    ]
}

HTTP 200

### 14e. Bulk activate again
$ curl -s -X POST $B/admin/students/bulk -H "Authorization: Bearer $ADMIN" -d "{\"ids\":[3,4],\"action\":\"activate\"}"
{
    "action": "activate",
    "not_found": 0,
    "requested": 2,
    "skipped": 0,
    "status": "active",
    "updated": 2,
    "updated_ids": [
        3,
        4
    ]
}

HTTP 200

### 14f. Issue a password recovery token for a student (password never shown)
$ curl -s -X POST $B/admin/students/3/password-reset -H "Authorization: Bearer $ADMIN"
{
    "dev_note": "No email provider is configured, so this token is returned for testing and also written to the server log.",
    "expires_at": "2026-10-24T17:28:38.596668",
    "message": "A password recovery token has been issued for priya@studyplanner.test. The password itself is never visible.",
    "reset_token": "7mPATxaObfYYnzpeohI0qs7WZNe-2DV5OZatUuvDn0I"
}

HTTP 200

### 14g. Student-facing published course list now includes the new course
$ curl -s "$B/courses?q=BPSC" -H "Authorization: Bearer $ADMIN"
{
    "has_next": false,
    "has_prev": false,
    "items": [
        {
            "category": "competitive_exam",
            "description": "Bihar Public Service Commission prelims and mains preparation.",
            "estimated_duration_weeks": 36,
            "id": 4,
            "is_enrolled": false,
            "level": "Advanced",
            "progress_percent": null,
            "slug": "bpsc-combined-competitive-exam",
            "status": "published",
            "subject_count": 1,
            "thumbnail_url": null,
            "title": "BPSC Combined Competitive Exam",
            "topic_count": 4
        }
    ],
    "page": 1,
    "pages": 1,
    "per_page": 20,
    "total": 1
}

HTTP 200

### 14h. Audit log, newest 12 entries
$ curl -s "$B/admin/audit-logs?per_page=12" -H "Authorization: Bearer $ADMIN"
{
    "has_next": true,
    "has_prev": false,
    "items": [
        {
            "action": "student.password_reset_issued",
            "actor_email": "admin@studyplanner.test",
            "actor_id": 1,
            "created_at": "2026-10-24T16:28:38.600025",
            "detail": {
                "email": "priya@studyplanner.test"
            },
            "entity_id": 3,
            "entity_type": "user",
            "id": 27,
            "ip_address": "127.0.0.1"
        },
        {
            "action": "student.bulk_status_changed",
            "actor_email": "admin@studyplanner.test",
            "actor_id": 1,
            "created_at": "2026-10-24T16:28:38.470343",
            "detail": {
                "action": "activate",
                "reason": null,
                "requested": 2,
                "status": "active",
                "updated_ids": [
                    3,
                    4
                ]
            },
            "entity_id": null,
            "entity_type": "user",
            "id": 26,
            "ip_address": "127.0.0.1"
        },
        {
            "action": "student.bulk_status_changed",
            "actor_email": "admin@studyplanner.test",
... (164 more lines truncated)
HTTP 200
### 14i. Distinct audit actions recorded during this build
  announcement.created                     2
  announcement.published                   2
  course.created                           1
  course.published                         1
  report.exported                          1
  resource.created                         1
  seed.demo_data                           1
  settings.updated                         1
  student.bulk_status_changed              2
  student.exported                         1
  student.password_reset_issued            1
  student.status_changed                   2
  subject.created                          1
  syllabus.imported                        1
  syllabus.reordered                       1
  syllabus.topic_created                   1
  syllabus.topic_updated                   1
  syllabus.unit_created                    2
  syllabus.version_created                 2
  syllabus.version_published               2

=== done ===

### 15. Expire an announcement
$ curl -s -X POST $B/admin/announcements/3/expire -H "Authorization: Bearer $ADMIN"
{
    "announcement": {
        "audience": "course",
        "body": "The revised weekly timetable for UPSC Prelims is now available in your planner.",
        "course_id": 1,
        "course_title": "UPSC Civil Services \u2014 Prelims",
        "created_at": "2026-10-24T16:24:56.963019",
        "created_by": 1,
        "created_by_email": "admin@studyplanner.test",
        "delivery": {
            "delivered": 2,
            "read": 0,
            "read_percent": 0.0,
            "targeted": 2,
            "view_count": 0
        },
        "expires_at": "2026-10-24T16:29:17.762997",
        "id": 3,
        "publish_at": "2026-10-24T16:24:56.961626",
        "status": "archived",
        "target_role": null,
        "title": "UPSC prelims timetable published",
        "updated_at": "2026-10-24T16:29:17.764580",
        "view_count": 0
    },
    "message": "The announcement is no longer visible to students."
}

### 15b. Re-running the progress migration is idempotent
$ curl -s -X POST $B/admin/syllabus/versions/5/migrate-progress -H "Authorization: Bearer $ADMIN"
{
    "created_progress_rows": 0,
    "message": "Existing rows were left untouched; only missing progress rows were copied forward.",
    "version_id": 5
}

### 15c. Stream an admin-managed file (headers only)
$ curl -s -D- -o /dev/null $B/admin/resources/10/file -H "Authorization: Bearer $ADMIN"
HTTP/1.1 200 OK
Server: Werkzeug/3.1.9 Python/3.14.4
Date: Sat, 24 Oct 2026 16:29:17 GMT
Content-Disposition: attachment; filename="BPSC Bihar GS Notes.txt"
Content-Type: text/plain; charset=utf-8
Content-Length: 80
Last-Modified: Sat, 24 Oct 2026 16:24:56 GMT
Cache-Control: no-cache, max-age=0

### 15d. A student private upload is NOT readable by an admin (403)
$ curl -s $B/admin/resources/9/file -H "Authorization: Bearer $ADMIN"
{
  "error": {
    "code": "NOT_FOUND",
    "message": "This resource has no stored file."
  }
}

HTTP 404

student private upload id = 11

### 15d. Admin GET /admin/resources/11 (metadata only, no download_url)
{
  "resource": {
    "course_id": null,
    "course_title": null,
    "created_at": "2026-10-24T16:30:41.208844",
    "description": null,
    "download_count": 0,
    "download_url": null,
    "external_url": null,
    "file_size_bytes": 26,
    "has_file": true,
    "id": 11,
    "last_accessed_at": "2026-10-24T16:30:41.208083",
    "mime_type": "text/plain",
    "note": "This is a student's private upload. Metadata only; the file is not readable through the admin API.",
    "owner_id": 2,
    "resource_type": "note",
    "status": "published",
    "subject_id": null,
    "subject_name": null,
    "tags": [],
    "title": "My private notes",
    "topic_id": null,
    "topic_title": null,
    "unit_id": null,
    "unit_title": null,
    "updated_at": "2026-10-24T16:30:41.208849",
    "uploaded_by": 2,
    "uploaded_by_email": "aarav@studyplanner.test",
    "visibility": "private"
  }
}

HTTP 200

### 15e. Admin GET /admin/resources/11/file must be 403
{
  "error": {
    "code": "FORBIDDEN",
    "message": "This is a student's private upload. Administrators may not open or edit it (PRD 3.10 / 2.3)."
  }
}

HTTP 403

### 15f. Admin PATCH on a student private upload must be 403
{
  "error": {
    "code": "FORBIDDEN",
    "message": "This is a student's private upload. Administrators may not open or edit it (PRD 3.10 / 2.3)."
  }
}

HTTP 403
```

### Verification summary

| Check | Result |
|---|---|
| Admin dashboard stats | 200, real counts: 3 students, 3 active, courses by status, 70 → 103 topics, enrollment distribution, 24-day activity + signup series, warnings, storage (step 1) |
| Students list with search + pagination | 200, `q=priya` → 1 match; `page=2&per_page=2` → page 2 of 3 (steps 2, 2b) |
| Student detail with activity | 200, enrollments + aggregate progress + 30-day activity, plus an explicit `privacy_note`; no topic notes, uploads or AI messages (step 2c) |
| Suspend then activate a student | 200 + 200, audited as `student.status_changed`; the suspended student's own token was rejected in between (steps 3, 3b, 3c) |
| Create a course and publish it | 201 then 200, `status: published`, audited as `course.created` / `course.published`; it then appeared in the student catalogue (steps 4, 4b, 14g) |
| Archiving a course with active enrollments | 409 `CONFLICT` with `impact.active_enrollments: 2` and `requires_confirmation: true` (step 4c) |
| Create subject / version / unit / chapter / topic | 201 ×5, chapter nested under the unit, topic under the chapter (steps 5–5e) |
| Reorder | 200 (step 5f), plus `PATCH /admin/syllabus/reorder` for topics and `/courses/:id/subjects/reorder` for subjects |
| CSV bulk import | 201, `rows_read: 6, rows_valid: 3, rows_rejected: 3`, per-row errors naming row **and** column (missing topic, `'abc' is not a number`, bad difficulty); 2 units + 1 chapter + 3 topics created (step 6b) |
| Syllabus versioning preserves progress | v2 cloned 20 units / 29 topics; publishing reported `migrated_progress_rows: 24`, `archived_versions: [1]`; the student's 13/29 completed topics and 44.83 % were identical before and after (steps 7–7d); re-running the migration created 0 rows (step 15b) |
| Deleting a topic students have progress on | 409 with `impact: {progress_rows: 2, students: 2}` and `requires_force: true` (step 14) |
| Editing a live topic's metadata | 200, `progress_preserved: true` (step 14b) |
| Study material upload | 201, stored under `uploads/admin/` with a randomised name, served only via `/admin/resources/:id/file` (steps 8, 15c) |
| File type validation | 422 — a `.txt` rejected for `resource_type=image` (step 8b) |
| Student private upload is off limits to admins | metadata 200 with `download_url: null`; `GET .../file` 403; `PATCH` 403 (steps 15d–15f) |
| Announcement create + publish with fan-out | 201, course-targeted → `targeted: 2, notifications_created: 2`; role-targeted → `targeted: 3, notifications_created: 3`; the student saw it in `/student/notifications` (steps 9–9d) |
| Announcement expire | 200, status `archived`, no longer visible to students (step 15) |
| Reports | registrations, engagement, progress, accounts and the nine-type summary all 200 with aggregate series + totals (steps 10–10e) |
| CSV exports | `/admin/reports/export` and `/admin/students/export` returned `text/csv` with `Content-Disposition: attachment` (steps 10f, 10g) |
| Audit log | 27 rows, 20 distinct actions, searchable by `action` and paginated; every create / update / publish / suspend / import / export in this run is present (steps 11, 11b, 14h, 14i) |
| **Student token on admin endpoints** | **403 `FORBIDDEN` on all 15 probed endpoints** (10 GET, 4 POST, 1 PATCH) — step 12 matrix, bodies in 12b/12c |
| **Anonymous request on admin endpoints** | **401 `UNAUTHORIZED` on all 15** — step 12 matrix, body in 12d |
| Platform settings | 200 read, 200 write with enum/range validation, audited as `settings.updated` (steps 13, 13b) |
| Server log | no traceback, no exception, no 500 across the whole run |

Distinct audit actions written during the verification run:

```
announcement.created            announcement.published
course.created                  course.published
report.exported                 resource.created
settings.updated                student.bulk_status_changed
student.exported                student.password_reset_issued
student.status_changed          subject.created
syllabus.imported               syllabus.reordered
syllabus.topic_created          syllabus.topic_updated
syllabus.unit_created           syllabus.version_created
syllabus.version_published
```
