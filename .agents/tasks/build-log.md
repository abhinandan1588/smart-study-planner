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
