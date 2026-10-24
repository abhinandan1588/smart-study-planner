# Smart Study Planner — Implementation Reference

Source of truth: `/home/abhi/Apps/Study planner/prd.md`. Build in place at
`/home/abhi/Apps/Study planner/backend/` and `/home/abhi/Apps/Study planner/frontend/`.

**Fixed stack (do not re-decide).** Backend: Python 3.14 + Flask (app factory + Blueprints),
Flask-SQLAlchemy, Flask-Migrate, Flask-JWT-Extended (access 1 h / refresh 30 d), Flask-CORS,
Werkzeug password hashing. SQLite at `backend/instance/app.db`.
Frontend: React + **plain JavaScript (.jsx)**, Vite, React Router v6, axios in `src/services/api.js`,
Recharts. All routes under `/api/v1/`. Vite proxies `/api` → `http://127.0.0.1:5000`.
Run commands: backend `cd backend && flask --app run.py run`; frontend `cd frontend && npm run dev`.

**Styling decision: plain CSS with design tokens.** One global `src/styles/tokens.css`
(CSS custom properties) + `src/styles/global.css`, and one co-located `.css` file per component /
page imported directly by the `.jsx`. **No Tailwind, no CSS-in-JS.** Class naming: `sp-<block>__<element>`.

---

## 1. Database models

All models in `backend/app/models/`, all with `id INTEGER PK autoincrement`.
Convention: every table gets `created_at DATETIME default utcnow`, and `updated_at DATETIME onupdate utcnow`
where rows are mutable. All FKs are real `ForeignKey` with `ondelete` as noted. `db.relationship` back_populates
on both sides. Enum-like columns are `String` + a module-level tuple of allowed values validated in the schema layer
(keeps SQLite migrations simple).

### 1.1 Table-by-table

| # | Table | Model class | File | Columns (type — notes) |
|---|---|---|---|---|
| 1 | `users` | `User` | `models/user.py` | `full_name` Str(120) NOT NULL; `email` Str(255) **unique** NOT NULL **indexed**; `password_hash` Str(255) NOT NULL; `role` Str(20) NOT NULL default `student` (`student`\|`admin`); `status` Str(30) NOT NULL default `pending_verification` (`active`\|`suspended`\|`pending_verification`); `email_verified` Bool default False; `verification_token` Str(64) nullable **indexed**; `verification_sent_at` DT nullable; `reset_token` Str(64) nullable **indexed**; `reset_token_expires_at` DT nullable; `avatar_url` Str(500) nullable; `timezone` Str(64) default `Asia/Kolkata`; `language` Str(10) default `en`; `daily_target_minutes` Int default 240; `weekly_target_minutes` Int default 1500; `focus_duration_minutes` Int default 25; `short_break_minutes` Int default 5; `long_break_minutes` Int default 15; `availability_json` Text nullable (JSON: `{"mon":[{"start":"18:00","end":"21:00"}],...}`); `notification_prefs_json` Text nullable; `last_login_at` DT nullable; `created_at`, `updated_at` |
| 2 | `courses` | `Course` | `models/course.py` | `title` Str(200) NOT NULL; `slug` Str(220) **unique** NOT NULL **indexed**; `description` Text; `category` Str(50) NOT NULL (`competitive_exam`\|`university`\|`skill`); `level` Str(50) nullable; `thumbnail_url` Str(500) nullable; `estimated_duration_weeks` Int nullable; `target_audience` Str(300) nullable; `status` Str(20) NOT NULL default `draft` (`draft`\|`published`\|`archived`) **indexed**; `created_by` FK→`users.id` ON DELETE SET NULL; `created_at`, `updated_at` |
| 3 | `subjects` | `Subject` | `models/subject.py` | `name` Str(200) NOT NULL; `slug` Str(220) **unique** NOT NULL **indexed**; `description` Text; `weightage` Float nullable; `status` Str(20) default `active` (`active`\|`archived`); `created_at`, `updated_at` |
| 4 | `course_subjects` | `CourseSubject` | `models/subject.py` | `course_id` FK→`courses.id` CASCADE NOT NULL; `subject_id` FK→`subjects.id` CASCADE NOT NULL; `display_order` Int default 0; `weightage` Float nullable. **UniqueConstraint(course_id, subject_id)**; index on `course_id` |
| 5 | `enrollments` | `Enrollment` | `models/enrollment.py` | `user_id` FK→`users.id` CASCADE NOT NULL; `course_id` FK→`courses.id` CASCADE NOT NULL; `target_completion_date` Date nullable; `priority` Str(10) default `medium` (`low`\|`medium`\|`high`); `difficulty` Str(10) default `medium`; `status` Str(20) default `active` (`active`\|`completed`\|`dropped`); `enrolled_at` DT default utcnow; `last_accessed_at` DT nullable. **UniqueConstraint(user_id, course_id)**; index `(user_id, status)` |
| 6 | `syllabus_versions` | `SyllabusVersion` | `models/syllabus.py` | `course_id` FK→`courses.id` CASCADE NOT NULL **indexed**; `version_number` Int NOT NULL; `status` Str(20) default `draft` (`draft`\|`published`\|`archived`); `notes` Text; `published_at` DT nullable; `created_at`. **UniqueConstraint(course_id, version_number)** |
| 7 | `syllabus_units` | `SyllabusUnit` | `models/syllabus.py` | `syllabus_version_id` FK→`syllabus_versions.id` CASCADE NOT NULL **indexed**; `subject_id` FK→`subjects.id` CASCADE NOT NULL **indexed**; `parent_id` FK→`syllabus_units.id` CASCADE nullable (self-ref: unit → chapter); `title` Str(250) NOT NULL; `description` Text; `unit_type` Str(20) default `unit` (`unit`\|`chapter`); `display_order` Int default 0; `created_at`, `updated_at`. Self-ref relationship `children` / `parent` (`remote_side=[id]`); index `(syllabus_version_id, subject_id, display_order)` |
| 8 | `topics` | `Topic` | `models/syllabus.py` | `unit_id` FK→`syllabus_units.id` CASCADE NOT NULL **indexed**; `title` Str(250) NOT NULL; `description` Text; `estimated_minutes` Int default 60; `difficulty` Str(10) default `medium` (`easy`\|`medium`\|`hard`); `importance` Str(10) default `medium` (`low`\|`medium`\|`high`); `display_order` Int default 0; `created_at`, `updated_at`; index `(unit_id, display_order)` |
| 9 | `topic_progress` | `TopicProgress` | `models/progress.py` | `user_id` FK→`users.id` CASCADE NOT NULL; `topic_id` FK→`topics.id` CASCADE NOT NULL; `status` Str(20) default `not_started` (`not_started`\|`in_progress`\|`completed`); `time_spent_minutes` Int default 0; `notes` Text; `priority` Str(10) default `medium`; `target_date` Date nullable; `needs_revision` Bool default False; `next_revision_date` Date nullable; `completed_at` DT nullable; `created_at`, `updated_at`. **UniqueConstraint(user_id, topic_id)**; index `(user_id, status)` |
| 10 | `study_sessions` | `StudySession` | `models/study_session.py` | `user_id` FK→`users.id` CASCADE NOT NULL **indexed**; `course_id` FK→`courses.id` SET NULL nullable; `subject_id` FK→`subjects.id` SET NULL nullable; `topic_id` FK→`topics.id` SET NULL nullable; `title` Str(250) NOT NULL; `session_type` Str(20) default `study` (`study`\|`revision`\|`break`); `start_at` DT NOT NULL **indexed**; `end_at` DT NOT NULL; `planned_minutes` Int NOT NULL; `status` Str(25) default `planned` (`planned`\|`completed`\|`skipped`\|`partially_completed`); `actual_minutes` Int default 0; `recurrence_rule` Str(100) nullable (`none`\|`daily`\|`weekly:MO,WE`); `recurrence_parent_id` FK→`study_sessions.id` SET NULL nullable; `generated_batch_id` Str(36) nullable **indexed** (smart-plan draft grouping); `rescheduled_from_id` FK→`study_sessions.id` SET NULL nullable (prevents duplicate reschedules); `notes` Text; `created_at`, `updated_at`; index `(user_id, start_at)` |
| 11 | `tasks` | `Task` | `models/task.py` | `user_id` FK→`users.id` CASCADE NOT NULL **indexed**; `course_id` / `subject_id` / `topic_id` FK SET NULL nullable; `title` Str(250) NOT NULL; `description` Text; `priority` Str(10) default `medium` (`low`\|`medium`\|`high`); `due_date` Date nullable **indexed**; `due_time` Time nullable; `estimated_minutes` Int nullable; `status` Str(20) default `pending` (`pending`\|`in_progress`\|`completed`\|`cancelled`); `reminder_at` DT nullable; `recurrence_rule` Str(100) nullable; `completed_at` DT nullable; `created_at`, `updated_at`; index `(user_id, status, due_date)` |
| 12 | `focus_sessions` | `FocusSession` | `models/focus_session.py` | `user_id` FK→`users.id` CASCADE NOT NULL **indexed**; `course_id`/`subject_id`/`topic_id` FK SET NULL nullable; `mode` Str(20) default `pomodoro` (`pomodoro`\|`custom`); `target_minutes` Int NOT NULL; `focus_minutes` Int default 0 (server-computed actual); `break_minutes` Int default 0; `started_at` DT NOT NULL **indexed**; `ended_at` DT nullable; `status` Str(20) default `running` (`running`\|`paused`\|`completed`\|`interrupted`\|`abandoned`); `paused_accumulated_seconds` Int default 0; `cycles_completed` Int default 0; `created_at`, `updated_at`; index `(user_id, started_at)` |
| 13 | `goals` | `Goal` | `models/goal.py` | `user_id` FK→`users.id` CASCADE NOT NULL **indexed**; `course_id` FK→`courses.id` SET NULL nullable; `title` Str(250) NOT NULL; `description` Text; `category` Str(40) NOT NULL (`course_completion`\|`topics_count`\|`weekly_hours`\|`daily_tasks`\|`study_streak`\|`revision_cycle`\|`practice_questions`); `target_value` Float NOT NULL; `current_value` Float default 0 (server-recomputed); `unit` Str(20) nullable (`topics`\|`hours`\|`days`\|`questions`); `start_date` Date NOT NULL; `deadline` Date NOT NULL **indexed**; `status` Str(20) default `active` (`active`\|`completed`\|`paused`\|`overdue`); `completed_at` DT nullable; `created_at`, `updated_at` |
| 14 | `achievements` | `Achievement` | `models/achievement.py` | `code` Str(60) **unique** NOT NULL **indexed** (e.g. `first_topic`, `streak_7`); `title` Str(150) NOT NULL; `description` Text; `icon` Str(60) nullable; `criteria_json` Text (e.g. `{"metric":"topics_completed","threshold":100}`); `is_active` Bool default True |
| 15 | `user_achievements` | `UserAchievement` | `models/achievement.py` | `user_id` FK→`users.id` CASCADE NOT NULL; `achievement_id` FK→`achievements.id` CASCADE NOT NULL; `earned_at` DT default utcnow. **UniqueConstraint(user_id, achievement_id)** — this is the anti-duplicate guard |
| 16 | `resources` | `Resource` | `models/resource.py` | `title` Str(250) NOT NULL; `description` Text; `resource_type` Str(30) NOT NULL (`pdf`\|`document`\|`image`\|`link`\|`practice_set`\|`revision_sheet`\|`note`); `file_path` Str(500) nullable (relative, under `backend/uploads/`, never served directly); `file_size_bytes` Int nullable; `mime_type` Str(100) nullable; `external_url` Str(1000) nullable; `tags` Str(500) nullable (comma separated); `course_id`/`subject_id`/`unit_id`/`topic_id` FK SET NULL nullable (all **indexed** on `course_id`, `topic_id`); `visibility` Str(20) NOT NULL default `private` (`public`\|`enrolled_only`\|`private`); `status` Str(20) default `published` (`draft`\|`published`\|`archived`); `owner_id` FK→`users.id` CASCADE nullable (set for student private uploads; NULL ⇒ admin/shared); `uploaded_by` FK→`users.id` SET NULL; `download_count` Int default 0; `created_at`, `updated_at` |
| 17 | `resource_permissions` | `ResourcePermission` | `models/resource.py` | `resource_id` FK→`resources.id` CASCADE NOT NULL; `user_id` FK→`users.id` CASCADE nullable; `course_id` FK→`courses.id` CASCADE nullable; `access_level` Str(20) default `read` (`read`\|`download`). **UniqueConstraint(resource_id, user_id, course_id)** |
| 17b | `resource_bookmarks` | `ResourceBookmark` | `models/resource.py` | *(needed by PRD 3.10 bookmarks; not named in §7 table list)* `user_id` FK→`users.id` CASCADE; `resource_id` FK→`resources.id` CASCADE; `created_at`. **UniqueConstraint(user_id, resource_id)** |
| 18 | `announcements` | `Announcement` | `models/announcement.py` | `title` Str(250) NOT NULL; `body` Text NOT NULL; `audience` Str(20) NOT NULL default `all` (`all`\|`course`); `course_id` FK→`courses.id` CASCADE nullable (required when `audience='course'`); `status` Str(20) default `draft` (`draft`\|`scheduled`\|`published`\|`archived`) **indexed**; `publish_at` DT nullable; `expires_at` DT nullable; `created_by` FK→`users.id` SET NULL; `view_count` Int default 0; `created_at`, `updated_at` |
| 19 | `notifications` | `Notification` | `models/notification.py` | `user_id` FK→`users.id` CASCADE NOT NULL **indexed**; `type` Str(40) NOT NULL (`session_upcoming`\|`task_due`\|`task_overdue`\|`revision_due`\|`goal_deadline`\|`announcement`\|`new_resource`\|`plan_change`); `title` Str(250) NOT NULL; `body` Text; `link` Str(300) nullable; `is_read` Bool default False **indexed**; `read_at` DT nullable; `dedupe_key` Str(160) nullable; `created_at`. **UniqueConstraint(user_id, dedupe_key)** — prevents duplicate reminders; index `(user_id, is_read, created_at)` |
| 20 | `ai_conversations` | `AiConversation` | `models/ai.py` | `user_id` FK→`users.id` CASCADE NOT NULL **indexed**; `title` Str(250) default `New conversation`; `course_id` FK→`courses.id` SET NULL nullable; `topic_id` FK→`topics.id` SET NULL nullable; `created_at`, `updated_at` |
| 21 | `ai_messages` | `AiMessage` | `models/ai.py` | `conversation_id` FK→`ai_conversations.id` CASCADE NOT NULL **indexed**; `role` Str(12) NOT NULL (`user`\|`assistant`\|`system`); `content` Text NOT NULL; `sources_json` Text nullable (list of `{resource_id,title,snippet}`); `tokens` Int nullable; `created_at` |
| 22 | `audit_logs` | `AuditLog` | `models/audit_log.py` | `actor_id` FK→`users.id` SET NULL nullable **indexed**; `action` Str(80) NOT NULL (e.g. `student.status_changed`); `entity_type` Str(60); `entity_id` Int nullable; `detail_json` Text nullable; `ip_address` Str(64) nullable; `created_at` **indexed** |

`backend/app/models/__init__.py` imports every model class so Flask-Migrate autogenerate sees them all.

### 1.2 Relationships (PRD 7.1)

| Relationship | Implementation |
|---|---|
| One user ↔ many courses (enrolled) | `User.enrollments` ←→ `Enrollment.user`; `Course.enrollments` ←→ `Enrollment.course`; convenience `User.courses = relationship(Course, secondary='enrollments', viewonly=True)` |
| One course ↔ many subjects (M2M) | `Course.course_subjects` ←→ `CourseSubject.course`; `Course.subjects = relationship(Subject, secondary='course_subjects', viewonly=True)` |
| Subject → many units → many topics | `Subject.units` ←→ `SyllabusUnit.subject`; `SyllabusUnit.topics` ←→ `Topic.unit`; `SyllabusUnit.children`/`parent` self-ref |
| Course → syllabus versions → units | `Course.syllabus_versions` ←→ `SyllabusVersion.course`; `SyllabusVersion.units` ←→ `SyllabusUnit.version`. Progress points at `topics`, so publishing a new version never deletes `topic_progress` rows |
| Per-student topic progress | `User.topic_progress` ←→ `TopicProgress.user`; `Topic.progress_records` ←→ `TopicProgress.topic`; unique `(user_id, topic_id)` |
| Student → tasks / sessions / goals / focus sessions | `User.tasks`, `User.study_sessions`, `User.goals`, `User.focus_sessions`, all `cascade="all, delete-orphan"` |
| Announcement targeting | `audience='all'` ⇒ every active student; `audience='course'` + `course_id` ⇒ students with an active `Enrollment` in that course |
| AI conversation ownership | `AiConversation.user_id` always filtered by `get_jwt_identity()`; `AiConversation.messages` ←→ `AiMessage.conversation` cascade delete |

---

## 2. API surface

Base: `/api/v1`. Auth column: `public` / `student` / `admin` / `any` (any authenticated role).
All list endpoints accept `?page=1&per_page=20&q=&sort=` and return
`{"items":[...],"page":1,"per_page":20,"total":N,"pages":M}`.
Errors are uniform: `{"error":{"code":"VALIDATION_ERROR","message":"...","fields":{...}}}` with 400/401/403/404/409/422/429/500.

### auth — `app/auth/routes.py`, prefix `/api/v1/auth`

| Method | Path | Auth | Request → Response |
|---|---|---|---|
| POST | `/auth/register` | public | `{full_name,email,password}` → 201 `{user, verification_token?}`; 409 on duplicate email; role forced to `student` |
| POST | `/auth/login` | public | `{email,password}` → 200 `{access_token,refresh_token,user:{id,full_name,email,role,status}}`; 401 invalid; 403 suspended; rate-limited |
| POST | `/auth/logout` | any | no body (access JWT) → 200 `{message}`; jti added to revoked-token set |
| POST | `/auth/refresh` | refresh JWT | → 200 `{access_token}` |
| POST | `/auth/verify-email` | public | `{token}` → 200 `{message}`; sets `email_verified=True`, `status='active'` |
| POST | `/auth/resend-verification` | public | `{email}` → 200 `{message}` (always generic) |
| POST | `/auth/forgot-password` | public | `{email}` → 200 generic `{message}`; stores `reset_token` + 1 h expiry |
| POST | `/auth/reset-password` | public | `{token,new_password}` → 200 `{message}`; 400 expired/invalid |
| GET | `/auth/me` | any | → 200 full profile incl. preferences |

### student — `app/student/routes.py`, prefix `/api/v1/student`

| Method | Path | Auth | Request → Response |
|---|---|---|---|
| GET | `/student/dashboard` | student | → `{greeting,date,today:{planned_minutes,studied_minutes,target_minutes,percent},tasks:{completed,pending},syllabus_completion_percent,upcoming_sessions[],streak_days,focus_minutes_today,active_goals[],recent_courses[],announcements[],unread_notifications}` — all computed from stored rows |
| GET | `/student/profile` | student | → profile + preferences |
| PATCH | `/student/profile` | student | `{full_name?,avatar_url?,timezone?,language?,daily_target_minutes?,weekly_target_minutes?,focus_duration_minutes?,short_break_minutes?,long_break_minutes?,availability_json?,notification_prefs_json?}` → updated profile |
| POST | `/student/profile/password` | student | `{current_password,new_password}` → 200; 400 on wrong current |
| GET | `/student/enrollments` | student | `?status=active` → enrollments with `course`, `progress_percent`, `target_completion_date` |
| POST | `/student/enrollments` | student | `{course_id,target_completion_date?,priority?,difficulty?}` → 201; 409 if already enrolled; 404 if course not `published` |
| PATCH | `/student/enrollments/:id` | student (owner) | `{target_completion_date?,priority?,difficulty?,status?}` → updated |
| DELETE | `/student/enrollments/:id` | student (owner) | → 204; `topic_progress` rows retained |

### courses — `app/courses/routes.py`, prefix `/api/v1/courses`

| Method | Path | Auth | Request → Response |
|---|---|---|---|
| GET | `/courses` | any | `?q=&category=&level=&page=` → paginated published courses with `subject_count,topic_count,is_enrolled` |
| GET | `/courses/:id` | any | → course detail + subjects + counts + `is_enrolled` (404 unless published or caller is admin) |
| GET | `/courses/categories` | any | → `{categories:[{value,label,count}]}` |

### syllabus — `app/syllabus/routes.py`, prefix `/api/v1/student`

| Method | Path | Auth | Request → Response |
|---|---|---|---|
| GET | `/student/courses/:id/syllabus` | student (enrolled) | `?status=&subject_id=&priority=&due_before=` → `{course,version,subjects:[{id,name,progress_percent,units:[{id,title,unit_type,progress_percent,children:[...],topics:[{id,title,estimated_minutes,difficulty,importance,progress:{status,time_spent_minutes,notes,priority,target_date,needs_revision,next_revision_date}}]}]}],totals:{total_topics,completed_topics,completion_percent,weighted_completion_percent}}`; 403 if not enrolled |
| PATCH | `/student/topics/:id/progress` | student (owner) | `{status?,time_spent_minutes?,notes?,priority?,target_date?,needs_revision?,next_revision_date?}` → upserts `topic_progress`, returns the row + recomputed `unit/subject/course` percents; triggers achievement check |
| GET | `/student/revisions` | student | `?due_before=` → topics with `needs_revision=True` ordered by `next_revision_date` |

### timetable — `app/planner/routes_timetable.py`, prefix `/api/v1/student`

| Method | Path | Auth | Request → Response |
|---|---|---|---|
| GET | `/student/study-sessions` | student | `?from=&to=&view=day\|week\|month` → sessions in range + `conflicts:[[idA,idB]]` |
| POST | `/student/study-sessions` | student | `{title,start_at,end_at,course_id?,subject_id?,topic_id?,session_type?,recurrence_rule?,notes?}` → 201 session (+ generated recurrence children); 409 `{error:{code:"SCHEDULE_CONFLICT",conflicts:[...]}}` unless `?force=true` |
| PATCH | `/student/study-sessions/:id` | student (owner) | `{start_at?,end_at?,status?,actual_minutes?,...}` → updated; same conflict check |
| DELETE | `/student/study-sessions/:id` | student (owner) | `?scope=single\|series` → 204 |
| POST | `/student/study-sessions/:id/reschedule` | student (owner) | `{start_at,end_at}` → 201 new session with `rescheduled_from_id` set, original marked `skipped`; idempotent — re-calling returns the existing child |
| POST | `/student/timetable/generate` | student | `{from,to,course_ids?,daily_availability?,include_breaks?,include_revision?,include_tasks?}` → 200 **draft** `{batch_id,sessions:[...],unscheduled:[{topic_id,reason}]}` — nothing persisted |
| POST | `/student/timetable/generate/save` | student | `{batch_id,sessions:[...]}` (possibly edited) → 201 `{created:N}` persisted with `generated_batch_id` |

### tasks — `app/planner/routes_tasks.py`, prefix `/api/v1/student`

| Method | Path | Auth | Request → Response |
|---|---|---|---|
| GET | `/student/tasks` | student | `?status=&priority=&due_from=&due_to=&course_id=&q=&page=` → paginated tasks |
| POST | `/student/tasks` | student | `{title,description?,priority?,due_date?,due_time?,estimated_minutes?,course_id?,subject_id?,topic_id?,reminder_at?,recurrence_rule?}` → 201 |
| PATCH | `/student/tasks/:id` | student (owner) | any subset of the above + `status` → updated; sets `completed_at` on `completed` |
| DELETE | `/student/tasks/:id` | student (owner) | → 204 |

### focus — `app/planner/routes_focus.py`, prefix `/api/v1/student`

| Method | Path | Auth | Request → Response |
|---|---|---|---|
| GET | `/student/focus-sessions/active` | student | → running/paused session with `started_at`, `target_minutes`, `paused_accumulated_seconds` so the UI rebuilds the timer after refresh, or `null` |
| POST | `/student/focus-sessions` | student | `{mode,target_minutes,course_id?,subject_id?,topic_id?}` → 201 `status='running'`, server `started_at` |
| PATCH | `/student/focus-sessions/:id` | student (owner) | `{action:"pause"\|"resume"\|"complete"\|"stop"}` → updated; server computes `focus_minutes` from timestamps (clamped to `target_minutes`), `complete` only valid when elapsed ≥ 90 % of target else stored `interrupted` |
| GET | `/student/focus-sessions` | student | `?from=&to=&page=` → history + `{total_minutes,cycles_completed,today_minutes}` |

### goals — `app/planner/routes_goals.py`, prefix `/api/v1/student`

| Method | Path | Auth | Request → Response |
|---|---|---|---|
| GET | `/student/goals` | student | `?status=` → goals with recomputed `current_value` + `progress_percent` |
| POST | `/student/goals` | student | `{title,description?,category,target_value,unit?,start_date,deadline,course_id?}` → 201 |
| PATCH | `/student/goals/:id` | student (owner) | `{title?,target_value?,deadline?,status?}` → updated |
| DELETE | `/student/goals/:id` | student (owner) | → 204 |
| GET | `/student/achievements` | student | → `{earned:[{code,title,icon,earned_at}],available:[...]}` |

### analytics — `app/analytics/routes.py`, prefix `/api/v1/student`

| Method | Path | Auth | Request → Response |
|---|---|---|---|
| GET | `/student/analytics` | student | `?range=7d\|30d\|90d&course_id=` → `{daily_study:[{date,minutes}],by_subject:[{subject,minutes}],course_completion:[{course,percent}],tasks_planned_vs_completed:[{date,planned,completed}],focus_sessions:[{date,count,minutes}],consistency_heatmap:[{date,minutes}],streak:{current,longest},topics_donut:{completed,in_progress,not_started},planned_vs_actual:[{date,planned_minutes,actual_minutes}],overdue_tasks:N,upcoming_deadlines:[...],insights:[{type,message}]}` — all from stored rows; empty arrays when no data |
| GET | `/student/analytics/summary` | student | `?period=week\|month` → aggregate summary card data |

### materials — `app/resources/routes.py`, prefix `/api/v1/student`

| Method | Path | Auth | Request → Response |
|---|---|---|---|
| GET | `/student/resources` | student | `?q=&type=&course_id=&subject_id=&topic_id=&scope=all\|mine\|bookmarked&page=` → paginated metadata the caller may see (public, enrolled_only for enrolled courses, own private) |
| GET | `/student/resources/:id` | student (permitted) | → metadata + `download_url` (`/api/v1/student/resources/:id/file`) |
| GET | `/student/resources/:id/file` | student (permitted) | → streams file via `send_file` after the permission check; 403 otherwise; never a predictable static path; increments `download_count` |
| POST | `/student/resources` | student | `multipart/form-data`: `file` + `title,description?,resource_type,course_id?,subject_id?,topic_id?,tags?` → 201 with `visibility='private'`, `owner_id=caller`; validates extension (`pdf,doc,docx,png,jpg,jpeg,txt,md`) and size ≤ 20 MB |
| DELETE | `/student/resources/:id` | student (owner) | → 204, own uploads only |
| POST | `/student/resources/:id/bookmark` | student | → 201/204 toggle |
| GET | `/student/resources/recent` | student | → last 10 accessed |

### notifications — `app/notifications/routes.py`, prefix `/api/v1/student`

| Method | Path | Auth | Request → Response |
|---|---|---|---|
| GET | `/student/notifications` | student | `?is_read=&page=` → paginated + `{unread_count}`. Generates due reminders on read (session_upcoming/task_due/goal_deadline/revision_due), guarded by `dedupe_key` |
| PATCH | `/student/notifications/:id/read` | student (owner) | → updated |
| POST | `/student/notifications/read-all` | student | → `{updated:N}` |
| DELETE | `/student/notifications/:id` | student (owner) | → 204 |
| GET | `/student/announcements` | student | → published, unexpired announcements targeted at `all` or the caller's enrolled courses |

### admin — `app/admin/` (`routes_dashboard.py`, `routes_students.py`, `routes_courses.py`, `routes_subjects.py`, `routes_syllabus.py`, `routes_resources.py`, `routes_announcements.py`, `routes_reports.py`, `routes_settings.py`), prefix `/api/v1/admin`

| Method | Path | Auth | Request → Response |
|---|---|---|---|
| GET | `/admin/dashboard` | admin | `?from=&to=` → `{total_students,active_students,new_registrations,published_courses,subject_count,topic_count,resource_count,enrollment_distribution:[{course,count}],activity:[{date,sessions,focus_minutes}],popular_courses:[...],recent_registrations:[...],recent_admin_actions:[...],warnings:[...]}` |
| GET | `/admin/students` | admin | `?q=&status=&course_id=&registered_from=&registered_to=&page=` → paginated `{id,full_name,email,status,email_verified,created_at,last_login_at,enrollment_count}` |
| GET | `/admin/students/:id` | admin | → profile, enrollments, aggregate progress, activity. **Never** private notes or AI messages |
| PATCH | `/admin/students/:id/status` | admin | `{status:"active"\|"suspended"\|"pending_verification",reason?}` → updated + audit log |
| POST | `/admin/students/:id/password-reset` | admin | → 200 `{message}`; issues a reset token, never reveals a password; audited |
| POST | `/admin/students/bulk` | admin | `{ids:[...],action:"suspend"\|"activate"}` → `{updated:N}`; audited |
| GET | `/admin/students/export` | admin | `?status=` → CSV download of permitted fields |
| GET/POST | `/admin/courses` | admin | GET `?q=&status=&page=` paginated (all statuses); POST `{title,slug?,description,category,level?,thumbnail_url?,estimated_duration_weeks?,target_audience?,status?}` → 201; 409 duplicate slug (auto-slugify title) |
| GET | `/admin/courses/:id` | admin | → course + subjects + syllabus versions |
| PATCH | `/admin/courses/:id` | admin | editable fields + `status` (publish/archive) → updated; audited |
| DELETE | `/admin/courses/:id` | admin | → archives (`status='archived'`), never hard-deletes with enrollments; 409 explains |
| POST | `/admin/courses/:id/subjects` | admin | `{subject_id,display_order?,weightage?}` → 201 link; 409 duplicate |
| DELETE | `/admin/courses/:id/subjects/:subject_id` | admin | → 204 unlink |
| PATCH | `/admin/courses/:id/subjects/reorder` | admin | `{order:[{subject_id,display_order}]}` → 200 |
| GET/POST | `/admin/subjects` | admin | GET `?q=&status=&course_id=&page=`; POST `{name,slug?,description?,weightage?}` → 201; 409 duplicate slug |
| PATCH/DELETE | `/admin/subjects/:id` | admin | PATCH edits; DELETE sets `status='archived'` (student records preserved) |
| GET | `/admin/subjects/:id` | admin | → subject with units/topic counts |
| GET | `/admin/syllabus` | admin | `?course_id=&version_id=` → full version tree (units, chapters, topics) |
| POST | `/admin/syllabus/versions` | admin | `{course_id,notes?}` → 201 new draft version cloning the latest published tree |
| PATCH | `/admin/syllabus/versions/:id` | admin | `{status:"published"\|"archived",notes?}` → updated; publishing archives the previous published version and leaves `topic_progress` intact |
| POST | `/admin/syllabus` | admin | `{kind:"unit"\|"topic", ...}` — unit: `{syllabus_version_id,subject_id,parent_id?,title,description?,unit_type,display_order?}`; topic: `{unit_id,title,description?,estimated_minutes,difficulty,importance,display_order?}` → 201 |
| PATCH | `/admin/syllabus/:id` | admin | `{kind,...fields}` → updated |
| DELETE | `/admin/syllabus/:id` | admin | `?kind=unit\|topic` → 204; 409 with a progress-impact count when progress rows exist unless `?force=true` |
| PATCH | `/admin/syllabus/reorder` | admin | `{kind,items:[{id,display_order,parent_id?}]}` → 200 |
| POST | `/admin/syllabus/import` | admin | `multipart` CSV (`subject,unit,chapter,topic,estimated_minutes,difficulty,importance`) + `syllabus_version_id` → `{created:{units,topics},errors:[{row,message}]}`; validates before committing |
| GET | `/admin/syllabus/preview` | admin | `?course_id=&version_id=` → the same shape the student syllabus endpoint returns |
| GET/POST | `/admin/resources` | admin | GET `?q=&type=&course_id=&status=&page=`; POST `multipart` file + metadata + `visibility`,`status` → 201 |
| PATCH | `/admin/resources/:id` | admin | metadata / visibility / status, or `multipart` replacement file → updated |
| DELETE | `/admin/resources/:id` | admin | → archives; `?hard=true` deletes file + row, audited |
| GET | `/admin/resources/:id/file` | admin | → streams the file |
| GET | `/admin/resources/storage` | admin | → `{total_bytes,count,by_type:[...],failures:[...]}` |
| GET/POST | `/admin/announcements` | admin | GET `?status=&page=`; POST `{title,body,audience,course_id?,status,publish_at?,expires_at?}` → 201; fans out `notifications` rows on publish with `dedupe_key='announcement:<id>'` |
| PATCH/DELETE | `/admin/announcements/:id` | admin | PATCH edits / publishes; DELETE archives |
| GET | `/admin/reports` | admin | `?type=registrations\|active_users\|enrollments\|resources\|engagement\|progress\|focus\|notifications\|accounts&from=&to=` → `{type,range,series:[...],totals:{...}}`, aggregate only |
| GET | `/admin/reports/export` | admin | `?type=&from=&to=` → CSV |
| GET | `/admin/audit-logs` | admin | `?action=&actor_id=&from=&to=&page=` → paginated logs |
| GET/PATCH | `/admin/profile` | admin | own profile; PATCH `{full_name?,avatar_url?,timezone?}` |
| POST | `/admin/profile/password` | admin | `{current_password,new_password}` → 200 |
| GET/PATCH | `/admin/settings` | admin | platform settings: course categories, allowed resource types, notification defaults → `{settings:{...}}` |
| GET/POST | `/admin/admins` | admin | GET list admins; POST `{full_name,email,password}` → 201 admin account; audited |
| GET | `/admin/health` | admin | → `{db:"ok",storage:{...},ai_provider:"configured"\|"missing"}` |

### ai — `app/ai_assistant/routes.py`, prefix `/api/v1/student/ai`

| Method | Path | Auth | Request → Response |
|---|---|---|---|
| GET | `/student/ai/conversations` | student (owner) | → `[{id,title,course_id,topic_id,updated_at,message_count}]` |
| POST | `/student/ai/conversations` | student | `{title?,course_id?,topic_id?}` → 201 |
| GET | `/student/ai/conversations/:id` | student (owner) | → conversation + messages (incl. `sources`) |
| DELETE | `/student/ai/conversations/:id` | student (owner) | → 204 cascade-deletes messages |
| POST | `/student/ai/chat` | student | `{conversation_id?,message,course_id?,topic_id?,level?:"simple"\|"standard"\|"advanced",resource_ids?:[...],mode?:"explain"\|"summary"\|"quiz"\|"flashcards"\|"revision_plan"\|"breakdown"}` → 200 `{conversation_id,message:{role:"assistant",content,sources:[{resource_id,title,snippet}]},disclaimer:"AI answers may contain errors."}`; rate-limited (20/hour/user); 503 `{error:{code:"AI_UNAVAILABLE"}}` on provider failure — never a 500 that breaks the page |
| POST | `/student/ai/quiz` | student | `{course_id?,topic_id?,count?,difficulty?}` → `{questions:[{question,options[4],answer_index,explanation}]}` |
| POST | `/student/ai/flashcards` | student | `{topic_id?,count?}` → `{cards:[{front,back}]}` |

AI provider: `app/ai_assistant/provider.py` reads `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` from env
(keys server-side only). When `AI_API_KEY` is absent, a deterministic offline fallback builds answers from
syllabus text so the feature is demoable without a key. RAG: `app/ai_assistant/rag.py` extracts PDF text
(`pypdf`), chunks ~800 chars with 100 overlap into an in-DB chunk cache, scores with TF-IDF cosine
(`scikit-learn` not required — use a small pure-Python TF-IDF), returns top 4 chunks **only** from resources
the caller passes the permission check for.

---

## 3. Backend file layout (PRD 6.2)

| Path | Contents |
|---|---|
| `backend/run.py` | `app = create_app()`; `if __name__ == '__main__': app.run()` |
| `backend/config.py` | `BaseConfig`/`DevConfig`/`TestConfig`/`ProdConfig`: `SQLALCHEMY_DATABASE_URI` → `instance/app.db` (TestConfig → in-memory), JWT secret/expiries, `UPLOAD_FOLDER`, `MAX_CONTENT_LENGTH`, CORS origins, AI env vars |
| `backend/requirements.txt` | Flask, Flask-SQLAlchemy, Flask-Migrate, Flask-JWT-Extended, Flask-Cors, Flask-Limiter, python-dotenv, pypdf, email-validator, pytest |
| `backend/.env.example` | `SECRET_KEY`, `JWT_SECRET_KEY`, `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `FRONTEND_ORIGIN` |
| `backend/app/__init__.py` | `create_app(config_name)`: init extensions, register all 13 blueprints under `/api/v1`, error handlers, `/api/v1/health`, CLI commands |
| `backend/app/extensions.py` | `db`, `migrate`, `jwt`, `cors`, `limiter` singletons + JWT revoked-token set |
| `backend/app/models/*.py` | the model modules from §1 (`user`, `course`, `subject`, `syllabus`, `enrollment`, `progress`, `task`, `study_session`, `focus_session`, `goal`, `achievement`, `resource`, `announcement`, `notification`, `ai`, `audit_log`) + `__init__.py` re-exporting all |
| `backend/app/common/errors.py` | `ApiError` exception + handlers producing the uniform error envelope |
| `backend/app/common/decorators.py` | `@role_required('admin')`, `@student_required`, `@active_user_required`, `@owns(model)` object-level check |
| `backend/app/common/validators.py` | field validation helpers (email, password policy, enum membership, date parsing, pagination args) |
| `backend/app/common/serializers.py` | `to_dict` helpers per model; no Marshmallow dependency |
| `backend/app/common/pagination.py` | `paginate(query, request)` → the standard list envelope |
| `backend/app/common/audit.py` | `record_audit(actor_id, action, entity_type, entity_id, detail)` |
| `backend/app/common/progress.py` | completion-percent math for topic/unit/subject/course, weighted + unweighted |
| `backend/app/common/streaks.py` | streak + consistency computation from `focus_sessions` and `study_sessions` |
| `backend/app/common/achievements.py` | `evaluate_achievements(user_id)` — idempotent via the unique constraint |
| `backend/app/common/notifications.py` | `create_notification(..., dedupe_key)` + due-reminder generation |
| `backend/app/common/storage.py` | upload path resolution, extension/size/mime validation, safe filenames, streamed download |
| `backend/app/auth/` | `__init__.py` (blueprint), `routes.py`, `services.py` (token issuance, verification + reset tokens) |
| `backend/app/student/` | blueprint + `routes.py` (dashboard, profile, enrollments), `dashboard_service.py` |
| `backend/app/courses/` | blueprint + `routes.py` (public course catalog) |
| `backend/app/syllabus/` | blueprint + `routes.py` (student syllabus + topic progress), `tree_service.py` |
| `backend/app/planner/` | blueprint(s) + `routes_timetable.py`, `routes_tasks.py`, `routes_focus.py`, `routes_goals.py`, `scheduler.py` (the §5 algorithm), `conflicts.py`, `recurrence.py` |
| `backend/app/analytics/` | blueprint + `routes.py`, `queries.py` (aggregate SQL), `insights.py` |
| `backend/app/resources/` | blueprint + `routes.py` (student materials) |
| `backend/app/notifications/` | blueprint + `routes.py` (notifications + student announcements) |
| `backend/app/admin/` | blueprint + the nine `routes_*.py` modules from §2 + `reports_service.py` |
| `backend/app/ai_assistant/` | blueprint + `routes.py`, `provider.py`, `rag.py`, `prompts.py` |
| `backend/app/seed.py` | `flask seed-demo`: 1 admin, 3 students, 4 courses (SSC/UPSC/JEE/NEET) with subjects, a published syllabus version with units/chapters/topics, enrollments, progress, tasks, sessions, focus sessions, goals, achievements, resources, announcements, notifications |
| `backend/migrations/` | Flask-Migrate (`flask db init/migrate/upgrade`) |
| `backend/tests/` | `conftest.py` (app + client + auth-header fixtures on in-memory SQLite), `test_auth.py`, `test_courses.py`, `test_syllabus_progress.py`, `test_planner.py`, `test_focus.py`, `test_goals.py`, `test_analytics.py`, `test_resources.py`, `test_admin.py`, `test_scheduler.py`, `test_ai.py` |
| `backend/uploads/` | gitignored upload root (`.gitkeep`) |

Verification commands: `cd "/home/abhi/Apps/Study planner/backend" && python -m pytest -q` and
`flask --app run.py db upgrade`.

---

## 4. Frontend route map (PRD 6.3, nav from §5)

Shell: `src/app/App.jsx` (providers: `AuthProvider`, `ToastProvider`, `BrowserRouter`) and
`src/app/router.jsx` (route table + `ProtectedRoute` / `RoleRoute` guards that read the server-verified role
from `GET /auth/me`). Layouts: `components/layout/StudentLayout.jsx`, `components/layout/AdminLayout.jsx`,
`components/layout/AuthLayout.jsx`.

### Public / auth

| Route | Page component | Endpoints |
|---|---|---|
| `/login` | `features/auth/pages/LoginPage.jsx` | `POST /auth/login` |
| `/register` | `features/auth/pages/RegisterPage.jsx` | `POST /auth/register` |
| `/verify-email` | `features/auth/pages/VerifyEmailPage.jsx` | `POST /auth/verify-email`, `POST /auth/resend-verification` |
| `/forgot-password` | `features/auth/pages/ForgotPasswordPage.jsx` | `POST /auth/forgot-password` |
| `/reset-password` | `features/auth/pages/ResetPasswordPage.jsx` | `POST /auth/reset-password` |
| `/` | redirect by role → `/app/dashboard` or `/admin/dashboard` | `GET /auth/me` |

### Student (`/app/*`, 11 nav items per PRD §5)

| # | Route | Page component | Endpoints |
|---|---|---|---|
| 1 | `/app/dashboard` | `features/student-dashboard/pages/DashboardPage.jsx` | `GET /student/dashboard`, `GET /student/announcements` |
| 2 | `/app/courses` | `features/courses/pages/MyCoursesPage.jsx` | `GET /student/enrollments`, `GET /courses`, `POST /student/enrollments`, `PATCH|DELETE /student/enrollments/:id` |
| 2a | `/app/courses/browse` | `features/courses/pages/BrowseCoursesPage.jsx` | `GET /courses`, `GET /courses/categories`, `POST /student/enrollments` |
| 2b | `/app/courses/:id` | `features/courses/pages/CourseDetailPage.jsx` | `GET /courses/:id`, `GET /student/courses/:id/syllabus` |
| 3 | `/app/syllabus` | `features/syllabus/pages/SyllabusPage.jsx` | `GET /student/enrollments`, `GET /student/courses/:id/syllabus`, `PATCH /student/topics/:id/progress`, `GET /student/revisions` |
| 4 | `/app/planner` | `features/planner/pages/TimetablePage.jsx` | `GET|POST /student/study-sessions`, `PATCH|DELETE /student/study-sessions/:id`, `POST /student/study-sessions/:id/reschedule`, `POST /student/timetable/generate`, `POST /student/timetable/generate/save` |
| 4a | `/app/planner/tasks` | `features/planner/pages/TasksPage.jsx` | `GET|POST /student/tasks`, `PATCH|DELETE /student/tasks/:id` |
| 5 | `/app/focus` | `features/focus-timer/pages/FocusTimerPage.jsx` | `GET /student/focus-sessions/active`, `POST /student/focus-sessions`, `PATCH /student/focus-sessions/:id`, `GET /student/focus-sessions` |
| 6 | `/app/goals` | `features/goals/pages/GoalsPage.jsx` | `GET|POST /student/goals`, `PATCH|DELETE /student/goals/:id`, `GET /student/achievements` |
| 7 | `/app/analytics` | `features/analytics/pages/AnalyticsPage.jsx` | `GET /student/analytics`, `GET /student/analytics/summary` |
| 8 | `/app/assistant` | `features/ai-assistant/pages/AssistantPage.jsx` | `GET|POST /student/ai/conversations`, `GET|DELETE /student/ai/conversations/:id`, `POST /student/ai/chat`, `POST /student/ai/quiz`, `POST /student/ai/flashcards` |
| 9 | `/app/materials` | `features/materials/pages/MaterialsPage.jsx` | `GET /student/resources`, `GET /student/resources/recent`, `POST /student/resources`, `DELETE /student/resources/:id`, `POST /student/resources/:id/bookmark`, `GET /student/resources/:id/file` |
| 10 | `/app/notifications` | `features/notifications/pages/NotificationsPage.jsx` | `GET /student/notifications`, `PATCH /student/notifications/:id/read`, `POST /student/notifications/read-all`, `DELETE /student/notifications/:id` |
| 11 | `/app/settings` | `features/settings/pages/ProfileSettingsPage.jsx` | `GET|PATCH /student/profile`, `POST /student/profile/password` |

### Admin (`/admin/*`, exactly the nine PRD 4.1 nav items)

| # | Route | Page component | Endpoints |
|---|---|---|---|
| 1 | `/admin/dashboard` | `features/admin/pages/AdminDashboardPage.jsx` | `GET /admin/dashboard` |
| 2 | `/admin/students` | `features/admin/pages/StudentManagementPage.jsx` | `GET /admin/students`, `PATCH /admin/students/:id/status`, `POST /admin/students/bulk`, `GET /admin/students/export` |
| 2a | `/admin/students/:id` | `features/admin/pages/StudentDetailPage.jsx` | `GET /admin/students/:id`, `PATCH /admin/students/:id/status`, `POST /admin/students/:id/password-reset` |
| 3 | `/admin/courses` | `features/admin/pages/CourseManagementPage.jsx` | `GET|POST /admin/courses`, `PATCH|DELETE /admin/courses/:id` |
| 3a | `/admin/courses/:id` | `features/admin/pages/CourseEditorPage.jsx` | `GET /admin/courses/:id`, `PATCH /admin/courses/:id`, `POST|DELETE /admin/courses/:id/subjects`, `PATCH /admin/courses/:id/subjects/reorder` |
| 4 | `/admin/subjects` | `features/admin/pages/SubjectManagementPage.jsx` | `GET|POST /admin/subjects`, `PATCH|DELETE /admin/subjects/:id`, `GET /admin/subjects/:id` |
| 5 | `/admin/syllabus` | `features/admin/pages/SyllabusManagementPage.jsx` | `GET /admin/syllabus`, `POST /admin/syllabus/versions`, `PATCH /admin/syllabus/versions/:id`, `POST|PATCH|DELETE /admin/syllabus(/:id)`, `PATCH /admin/syllabus/reorder`, `POST /admin/syllabus/import`, `GET /admin/syllabus/preview` |
| 6 | `/admin/materials` | `features/admin/pages/MaterialManagementPage.jsx` | `GET|POST /admin/resources`, `PATCH|DELETE /admin/resources/:id`, `GET /admin/resources/storage` |
| 7 | `/admin/announcements` | `features/admin/pages/AnnouncementsPage.jsx` | `GET|POST /admin/announcements`, `PATCH|DELETE /admin/announcements/:id` |
| 8 | `/admin/reports` | `features/admin/pages/ReportsPage.jsx` | `GET /admin/reports`, `GET /admin/reports/export` |
| 9 | `/admin/settings` | `features/admin/pages/AdminSettingsPage.jsx` | `GET|PATCH /admin/profile`, `POST /admin/profile/password`, `GET|PATCH /admin/settings`, `GET|POST /admin/admins`, `GET /admin/audit-logs`, `GET /admin/health` |

### Shared frontend modules

| Path | Contents |
|---|---|
| `src/main.jsx` | React root, imports `styles/tokens.css` + `styles/global.css` |
| `src/services/api.js` | axios instance `baseURL:'/api/v1'`; request interceptor attaching `Authorization: Bearer <access>`; response interceptor refreshing once on 401 via `/auth/refresh` then retrying, redirecting to `/login` on failure |
| `src/services/*.js` | one thin module per blueprint: `authApi`, `studentApi`, `coursesApi`, `syllabusApi`, `plannerApi`, `focusApi`, `goalsApi`, `analyticsApi`, `materialsApi`, `notificationsApi`, `adminApi`, `aiApi` |
| `src/hooks/` | `useAuth`, `useApi` (loading/error/data), `useToast`, `useDebounce`, `usePagination`, `useFocusTimer` (ticks from `started_at`, survives refresh) |
| `src/utils/` | `date.js` (format, week ranges, overlap), `format.js` (minutes→`2h 15m`, percent), `constants.js` (enum labels, nav definitions), `validation.js` |
| `src/components/charts/` | `LineChartCard`, `BarChartCard`, `DonutChartCard`, `ProgressBar`, `HeatmapCalendar` (Recharts; heatmap is a CSS grid) |

Verification: `cd "/home/abhi/Apps/Study planner/frontend" && npm run build` must finish with no errors;
`npm run dev` serves the app and proxied API calls succeed.

---

## 5. Deterministic smart-timetable generation

Location: `backend/app/planner/scheduler.py`, pure functions, no AI, no randomness.
Entry point: `generate_plan(user, from_date, to_date, options) -> (sessions, unscheduled)`.

### 5.1 Inputs

1. `user.availability_json` — free windows per weekday, overridable by `options.daily_availability`.
2. Active `Enrollment` rows (optionally filtered by `options.course_ids`), each with `priority`, `difficulty`,
   `target_completion_date` (the "exam date").
3. Candidate topics: `Topic` rows in each course's **published** `SyllabusVersion` whose `TopicProgress`
   is `not_started` or `in_progress`, carrying `estimated_minutes`, `difficulty`, `importance`,
   and progress `priority` / `target_date`.
4. Revision items: `TopicProgress` with `needs_revision=True` and `next_revision_date <= to_date`
   (included when `options.include_revision`, default true).
5. Incomplete `Task` rows with `due_date` in range and `estimated_minutes` set
   (included when `options.include_tasks`, default true).
6. Existing commitments: `StudySession` rows already stored in `[from_date, to_date]`.
7. Preferences: `focus_duration_minutes`, `short_break_minutes`, `long_break_minutes`,
   `daily_target_minutes`, `timezone`.

### 5.2 Build the free-slot list

1. For each date in `[from_date, to_date]`, take that weekday's availability windows. If
   `availability_json` is empty, default to `18:00–22:00` on weekdays and `09:00–13:00`, `15:00–19:00` on weekends.
2. Subtract every existing `StudySession` interval from the windows (interval difference), producing the
   ordered list of free sub-windows.
3. Drop sub-windows shorter than 20 minutes.
4. Cap the planned minutes per day at `daily_target_minutes`; stop filling a day once the cap is reached.

### 5.3 Order the work queue

Score each candidate once, then sort the queue by the tuple below (stable, fully deterministic — ties broken
by `topic.id` so repeated runs produce identical plans):

| Rank key | Direction | Value |
|---|---|---|
| 1. `is_overdue_revision` | desc | revision items with `next_revision_date < today` go first |
| 2. `deadline_pressure` | desc | `priority_weight × importance_weight / max(days_until_deadline, 1)` where `deadline = progress.target_date` else `enrollment.target_completion_date` else `to_date`; `priority_weight` = high 3 / medium 2 / low 1 (max of enrollment priority and progress priority); `importance_weight` = high 3 / medium 2 / low 1 |
| 3. `difficulty_weight` | desc | hard 3 / medium 2 / easy 1 — harder topics claim earlier, fresher slots |
| 4. `course_display_order, unit.display_order, topic.display_order` | asc | keeps syllabus sequence inside the same course |
| 5. `topic.id` | asc | final deterministic tiebreak |

Tasks join the same queue with `deadline = due_date` and their own `priority`; revision items use
`estimated_minutes = max(20, round(topic.estimated_minutes * 0.5))`.

### 5.4 Slot filling

1. Walk the queue in order. For each item take the earliest free sub-window that still has capacity,
   scanning days ascending and windows ascending within a day.
2. Never schedule an item **after** its deadline date. If no free slot exists on or before the deadline,
   place it in the earliest remaining slot and add
   `{"topic_id":..,"reason":"after_deadline"}` to `unscheduled` as a warning; if no slot exists at all,
   add `{"reason":"no_capacity"}` and skip it.
3. Chunking: an item longer than `focus_duration_minutes * 2` is split into blocks of
   `focus_duration_minutes * 2` (default 50 min), remainder ≥ 20 min becomes its own block, remainder < 20 min
   is merged into the previous block. Blocks of the same item are titled `"<topic title> (1/3)"`.
4. Breaks: after each scheduled block insert a `session_type='break'` session of `short_break_minutes`,
   or `long_break_minutes` after every 4th block in the same day. Breaks consume window capacity but do not
   count toward `daily_target_minutes`. A break is dropped rather than overflowing a window.
5. Topics that belong to the same course are not scheduled back-to-back more than 3 blocks in a row when
   another course still has queued work — swap in the next item from a different course. This interleaving
   is deterministic (round-robin over the ordered queue).
6. Each emitted draft session carries `title`, `session_type` (`study`/`revision`/`break`), `start_at`,
   `end_at`, `planned_minutes`, `course_id`, `subject_id`, `topic_id`, `status='planned'`,
   and a shared `generated_batch_id` (uuid4 string, the only non-deterministic value).

### 5.5 Overlap handling

- `conflicts.py` exposes `find_overlaps(sessions)` → list of id pairs where
  `a.start_at < b.end_at and b.start_at < a.end_at`, and `has_conflict(user_id, start, end, exclude_id=None)`
  used by the create/update/reschedule endpoints.
- The generator cannot produce internal overlaps because it only ever consumes free sub-windows and shrinks
  the window after each placement.
- `POST /student/study-sessions` and `PATCH .../:id` return 409 `SCHEDULE_CONFLICT` with the conflicting
  session ids unless `?force=true`; the frontend shows a confirm dialog.
- `POST /student/timetable/generate/save` re-runs `has_conflict` for every incoming session (the student may
  have edited the draft) and rejects the whole batch with 409 listing the offending indices — all-or-nothing
  inside one transaction.

---

## 6. Design system

Polished education SaaS: flat surfaces, one accent color, generous whitespace, 1 px borders,
no heavy gradients, no oversized metric cards (metric tiles max 110 px tall, label + value + small delta).

### 6.1 Tokens — `src/styles/tokens.css`

| Group | Tokens |
|---|---|
| Brand | `--c-primary:#2563eb`; `--c-primary-hover:#1d4ed8`; `--c-primary-soft:#eff6ff`; `--c-primary-border:#bfdbfe` |
| Neutrals | `--c-bg:#f7f8fa`; `--c-surface:#ffffff`; `--c-surface-alt:#f1f3f7`; `--c-border:#e4e7ec`; `--c-border-strong:#cfd4dc` |
| Text | `--c-text:#101828`; `--c-text-muted:#667085`; `--c-text-subtle:#98a2b3`; `--c-text-inverse:#ffffff` |
| Status | success `#16a34a`/`#ecfdf3`; warning `#d97706`/`#fffaeb`; danger `#dc2626`/`#fef3f2`; info `#0284c7`/`#f0f9ff` (each `--c-<name>` + `--c-<name>-soft`) |
| Chart series | `--c-chart-1:#2563eb`; `-2:#16a34a`; `-3:#d97706`; `-4:#7c3aed`; `-5:#0891b2`; `-6:#db2777` |
| Typography | `--font-sans:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif`; sizes `--fs-xs:12px`, `--fs-sm:13px`, `--fs-base:14px`, `--fs-md:16px`, `--fs-lg:18px`, `--fs-xl:22px`, `--fs-2xl:28px`; weights 400/500/600/700; `--lh-tight:1.25`, `--lh-base:1.5` |
| Spacing (4 px scale) | `--sp-1:4px` … `--sp-2:8px`, `--sp-3:12px`, `--sp-4:16px`, `--sp-5:20px`, `--sp-6:24px`, `--sp-8:32px`, `--sp-10:40px`, `--sp-12:48px` |
| Radius | `--r-sm:6px`; `--r-md:8px`; `--r-lg:12px`; `--r-full:999px` |
| Shadow (restrained, two only) | `--sh-sm:0 1px 2px rgba(16,24,40,.06)`; `--sh-md:0 4px 12px rgba(16,24,40,.08)` |
| Layout | `--sidebar-w:248px`; `--topbar-h:60px`; `--content-max:1280px` |
| Focus ring | `--ring:0 0 0 3px rgba(37,99,235,.35)` — applied on `:focus-visible` everywhere |

Breakpoints: `640px` (mobile→tablet), `1024px` (sidebar collapses below this).
Body text 14 px, page title `--fs-2xl/600`, section title `--fs-lg/600`, table text `--fs-sm`.
Contrast: all text/background pairs above meet WCAG AA (4.5:1) — verify with a contrast checker; full
accessibility validation still needs manual assistive-technology testing.

### 6.2 Shared components — `src/components/ui/<Name>/<Name>.jsx` + `<Name>.css`

| Component | API / behavior |
|---|---|
| `Button` | `variant: primary\|secondary\|ghost\|danger`, `size: sm\|md`, `loading`, `disabled`, `iconLeft`, `as`. Spinner replaces label while loading; keeps width |
| `Input` | `label`, `type`, `value`, `onChange`, `error`, `hint`, `required`, `iconLeft`. Wraps `<label htmlFor>`, `aria-invalid`, `aria-describedby` for the error text |
| `Textarea` | same contract as Input, auto-grow optional |
| `Select` | native `<select>` styled with a chevron, same label/error contract, `options:[{value,label}]` |
| `Checkbox` / `Radio` | label-wrapped, visible focus ring |
| `Badge` | `tone: neutral\|success\|warning\|danger\|info\|primary`, `size`. Used for statuses (Pending/Completed/Published/Suspended/High) via a `statusTone()` map in `utils/constants.js` |
| `Card` | `title`, `subtitle`, `actions`, `padded`, `children`; 1 px border + `--sh-sm`, no gradient |
| `MetricTile` | `label`, `value`, `sub`, `icon`, `tone`; compact, max 110 px tall |
| `Table` | `columns:[{key,header,render,width,sortable}]`, `rows`, `loading`, `empty`, built-in **search box** (debounced 300 ms, `onSearch`) and **pagination footer** (`page`, `pages`, `total`, `onPageChange`), optional `selectable` with bulk-action bar, `onSort`. Renders `Skeleton` rows while loading, `EmptyState` when empty, and collapses to stacked cards below 640 px |
| `Dialog` | `open`, `title`, `onClose`, `footer`, `size`; portal, backdrop click + Escape close, focus trap, focus restore, `role="dialog" aria-modal="true"`. `ConfirmDialog` wrapper with `tone="danger"` for every destructive action |
| `Drawer` | right-side panel reusing Dialog mechanics; used for create/edit forms in admin |
| `Skeleton` | `variant: text\|block\|circle\|row`, `width`, `height`, `count`; CSS shimmer, `aria-hidden` |
| `EmptyState` | `icon`, `title`, `description`, `action` (Button); used wherever a list can be empty |
| `Toast` + `ToastProvider` | `useToast().show({tone,title,message})`, auto-dismiss 4 s, stacked top-right, `role="status"` / `role="alert"` for errors |
| `Tabs` | roving-tabindex keyboard nav, `items:[{key,label}]`, `active`, `onChange` |
| `ProgressBar` | `value`, `max`, `tone`, `showLabel`, `aria-valuenow` |
| `Pagination` | standalone control reused by Table and card grids |
| `Avatar` | initials fallback, `size` |
| `Tooltip` | hover + focus, `aria-describedby` |

### 6.3 Shells — `src/components/layout/`

**`StudentLayout.jsx`** — desktop: fixed 248 px left sidebar (logo, the 11 nav items from PRD §5 with icons and
active-state left accent bar, user block with avatar/name/role and a logout menu at the bottom) + top bar
(page title, global search, notification bell with unread count from `GET /student/notifications`, avatar menu).
Below 1024 px the sidebar becomes an off-canvas drawer opened by a hamburger in the top bar; below 640 px a
bottom tab bar shows 5 primary items (Dashboard, Courses, Planner, Focus, More) and "More" opens the drawer
with the rest. Content area is `--content-max` centered with `--sp-6` padding.

**`AdminLayout.jsx`** — same skeleton, visually distinguished by a dark slate sidebar (`#101828` background,
muted labels, primary accent on the active item) and an "Admin" badge beside the logo. Sidebar lists exactly
the nine PRD 4.1 items. Top bar shows breadcrumbs + the admin avatar menu. Same responsive drawer behavior;
no bottom tab bar (admin is desktop-first).

**`AuthLayout.jsx`** — centered 400 px card on `--c-bg`, product name + one-line tagline, no illustrations.

Every interactive element is reachable by keyboard with a visible `--ring` focus indicator; nav uses
`<nav aria-label>` and `aria-current="page"` on the active link.

---

## 7. Build-order checklist

- [ ] 1. **Backend core, auth, models, seed.** `backend/` scaffold: `requirements.txt`, `config.py`, `run.py`,
      `app/__init__.py` app factory, `app/extensions.py`, all `app/models/*.py` from §1, `app/common/*`
      helpers, `app/auth/` (register/login/logout/refresh/verify/forgot/reset/me), `app/seed.py`, `tests/conftest.py`
      + `tests/test_auth.py`. Run `flask db init && flask db migrate -m "initial" && flask db upgrade`,
      then `flask seed-demo`.
      Verify: `cd "/home/abhi/Apps/Study planner/backend" && python -m pytest -q` passes; `instance/app.db` exists;
      `curl` login returns tokens.
- [ ] 2. **Backend student features.** `app/student/` (dashboard, profile, enrollments), `app/courses/`,
      `app/syllabus/` (+ progress aggregation), `app/planner/` (timetable + `scheduler.py` from §5, tasks, focus,
      goals, achievements), `app/analytics/`, `app/resources/`, `app/notifications/`.
      Verify: `python -m pytest -q` with the new `test_courses/test_syllabus_progress/test_planner/test_focus/
      test_goals/test_analytics/test_resources/test_scheduler` files passing, including a scheduler test that
      asserts no overlaps and identical output across two runs.
- [ ] 3. **Backend admin features.** `app/admin/` — the nine route modules from §2, audit logging on every
      mutating admin action, CSV syllabus import, CSV exports, settings + health.
      Verify: `python -m pytest -q` with `tests/test_admin.py` covering role rejection (student → 403),
      status change + audit row, course publish/archive, syllabus version publish preserving `topic_progress`.
- [ ] 4. **Backend AI assistant.** `app/ai_assistant/` — conversations, chat, quiz, flashcards, `provider.py`
      with env-keyed provider + offline fallback, `rag.py` PDF chunk retrieval with permission checks,
      rate limiting, graceful 503.
      Verify: `python -m pytest -q` with `tests/test_ai.py` — chat works without an API key via the fallback,
      cross-user conversation access returns 403, unauthorized `resource_ids` are excluded.
- [ ] 5. **Frontend shell.** `frontend/` Vite scaffold (`npm create vite` React JS), `vite.config.js` with the
      `/api` proxy, `styles/tokens.css` + `global.css`, all §6.2 UI components, the three layouts,
      `services/api.js` + per-blueprint service modules, `hooks/`, `utils/`, `app/App.jsx` + `router.jsx` with
      guards, and the five auth pages.
      Verify: `cd "/home/abhi/Apps/Study planner/frontend" && npm run build` succeeds; with both servers running,
      register → login → role-based redirect works.
- [ ] 6. **Frontend student pages.** All 11 nav destinations from §4 plus the course/task sub-routes, Recharts
      cards, the refresh-safe focus timer, skeleton/empty/error states everywhere.
      Verify: `npm run build` succeeds; manual pass over each student route against the seeded data shows real
      values, no console errors.
- [ ] 7. **Frontend admin pages + AI chat.** The nine admin destinations from §4 (searchable paginated tables,
      drawers for create/edit, confirm dialogs for destructive actions, CSV import/export UI) and the AI
      assistant page (conversation list, streaming-free chat, source citations, disclaimer, quiz/flashcard modes).
      Verify: `npm run build` succeeds; admin login reaches every admin route and an AI chat round-trip renders
      an answer with the disclaimer.
- [ ] 8. **Integration pass.** Full `python -m pytest -q` + `npm run build`, root `README.md` with setup/run
      instructions, `.env.example` present, both servers started from a clean clone.
      Verify: both commands green; documented steps reproduce a working app.

### Assumptions recorded

- Email delivery is not configured: verification and reset tokens are returned in the API response in dev and
  logged server-side, so the flows are testable without an SMTP provider.
- Background worker/scheduler (PRD 6.1) is replaced by on-read reminder generation guarded by
  `notifications.dedupe_key` — no Celery/Redis dependency.
- File storage is the local `backend/uploads/` directory served only through permission-checked endpoints,
  standing in for object storage.
- `resource_bookmarks` is added beyond PRD §7's table list because PRD 3.10 requires bookmarking.
