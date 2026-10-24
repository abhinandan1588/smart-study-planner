"""Demo data seeding.

Run with ``flask seed`` (or ``python seed.py``). Safe to re-run: every row is
looked up by its natural key first, and generated activity is only created for
users who do not already have it. Pass ``--reset`` to clear the demo rows first.
"""

import json
import random
from datetime import date, datetime, time, timedelta

from app.auth.services import hash_password
from app.extensions import db
from app.models import (
    Achievement,
    AiConversation,
    AiMessage,
    Announcement,
    AuditLog,
    Course,
    CourseSubject,
    Enrollment,
    FocusSession,
    Goal,
    Notification,
    PlatformSetting,
    Resource,
    StudySession,
    Subject,
    SyllabusUnit,
    SyllabusVersion,
    Task,
    Topic,
    TopicProgress,
    User,
    UserAchievement,
    utcnow,
)
from app.common.validators import slugify

ADMIN = {
    "full_name": "Ananya Rao",
    "email": "admin@studyplanner.test",
    "password": "Admin@12345",
}

STUDENTS = [
    {
        "full_name": "Aarav Sharma",
        "email": "aarav@studyplanner.test",
        "password": "Student@123",
        "daily_target_minutes": 300,
    },
    {
        "full_name": "Priya Verma",
        "email": "priya@studyplanner.test",
        "password": "Student@123",
        "daily_target_minutes": 240,
    },
    {
        "full_name": "Rohan Iyer",
        "email": "rohan@studyplanner.test",
        "password": "Student@123",
        "daily_target_minutes": 180,
    },
]

AVAILABILITY = {
    "mon": [{"start": "06:00", "end": "08:30"}, {"start": "18:00", "end": "21:30"}],
    "tue": [{"start": "06:00", "end": "08:30"}, {"start": "18:00", "end": "21:30"}],
    "wed": [{"start": "06:00", "end": "08:30"}, {"start": "18:00", "end": "21:30"}],
    "thu": [{"start": "06:00", "end": "08:30"}, {"start": "18:00", "end": "21:30"}],
    "fri": [{"start": "06:00", "end": "08:30"}, {"start": "18:00", "end": "20:00"}],
    "sat": [{"start": "09:00", "end": "13:00"}, {"start": "15:00", "end": "19:00"}],
    "sun": [{"start": "09:00", "end": "12:00"}, {"start": "16:00", "end": "19:00"}],
}

NOTIFICATION_PREFS = {
    "session_upcoming": True,
    "task_due": True,
    "revision_due": True,
    "goal_deadline": True,
    "announcement": True,
    "new_resource": True,
    "email_reminders": False,
}

# (title, estimated_minutes, difficulty, importance)
COURSES = [
    {
        "title": "UPSC Civil Services — Prelims",
        "category": "competitive_exam",
        "level": "Advanced",
        "estimated_duration_weeks": 52,
        "target_audience": "Graduates preparing for the UPSC Civil Services Preliminary examination",
        "description": (
            "Complete General Studies Paper I preparation covering polity, modern "
            "history, geography and economy, organised into a week-by-week syllabus."
        ),
        "subjects": [
            {
                "name": "Indian Polity",
                "weightage": 25.0,
                "units": [
                    {
                        "title": "Constitutional Framework",
                        "chapters": [
                            {
                                "title": "Making of the Constitution",
                                "topics": [
                                    ("Historical background and regulating acts", 90, "medium", "high"),
                                    ("Constituent Assembly and its committees", 75, "easy", "medium"),
                                    ("Preamble and its interpretation", 60, "easy", "high"),
                                ],
                            },
                            {
                                "title": "Union and its Territory",
                                "topics": [
                                    ("Articles 1 to 4 and state reorganisation", 70, "medium", "medium"),
                                    ("Citizenship provisions and amendments", 80, "medium", "high"),
                                ],
                            },
                        ],
                    },
                    {
                        "title": "Rights and Duties",
                        "chapters": [
                            {
                                "title": "Fundamental Rights",
                                "topics": [
                                    ("Right to equality (Articles 14-18)", 95, "hard", "high"),
                                    ("Right to freedom (Articles 19-22)", 110, "hard", "high"),
                                    ("Writs and constitutional remedies", 85, "hard", "high"),
                                ],
                            },
                            {
                                "title": "Directive Principles and Duties",
                                "topics": [
                                    ("Classification of directive principles", 60, "easy", "medium"),
                                    ("Fundamental duties and criticism", 45, "easy", "low"),
                                ],
                            },
                        ],
                    },
                ],
            },
            {
                "name": "Modern Indian History",
                "weightage": 20.0,
                "units": [
                    {
                        "title": "Advent of Europeans to 1857",
                        "chapters": [
                            {
                                "title": "Expansion of British Power",
                                "topics": [
                                    ("Carnatic wars and Bengal conquest", 85, "medium", "medium"),
                                    ("Subsidiary alliance and doctrine of lapse", 70, "medium", "high"),
                                ],
                            },
                            {
                                "title": "Revolt of 1857",
                                "topics": [
                                    ("Causes, centres and leaders", 80, "medium", "high"),
                                    ("Consequences and Government of India Act 1858", 60, "easy", "medium"),
                                ],
                            },
                        ],
                    },
                    {
                        "title": "National Movement 1885-1947",
                        "chapters": [
                            {
                                "title": "Moderates and Extremists",
                                "topics": [
                                    ("Formation of the Indian National Congress", 60, "easy", "high"),
                                    ("Swadeshi and Surat split", 75, "medium", "medium"),
                                ],
                            },
                            {
                                "title": "Gandhian Era",
                                "topics": [
                                    ("Non-cooperation and Khilafat", 90, "medium", "high"),
                                    ("Civil disobedience and Round Table conferences", 100, "hard", "high"),
                                    ("Quit India and transfer of power", 95, "hard", "high"),
                                ],
                            },
                        ],
                    },
                ],
            },
            {
                "name": "Indian and World Geography",
                "weightage": 18.0,
                "units": [
                    {
                        "title": "Physical Geography",
                        "chapters": [
                            {
                                "title": "Geomorphology",
                                "topics": [
                                    ("Interior of the earth and plate tectonics", 100, "hard", "high"),
                                    ("Landforms and erosional cycles", 80, "medium", "medium"),
                                ],
                            },
                            {
                                "title": "Climatology",
                                "topics": [
                                    ("Atmospheric circulation and pressure belts", 90, "hard", "high"),
                                    ("Indian monsoon mechanism", 85, "medium", "high"),
                                ],
                            },
                        ],
                    },
                    {
                        "title": "Indian Geography",
                        "chapters": [
                            {
                                "title": "Drainage and Soils",
                                "topics": [
                                    ("Himalayan and peninsular river systems", 75, "medium", "high"),
                                    ("Soil classification and conservation", 60, "easy", "medium"),
                                ],
                            },
                        ],
                    },
                ],
            },
            {
                "name": "Indian Economy",
                "weightage": 17.0,
                "units": [
                    {
                        "title": "Macroeconomic Basics",
                        "chapters": [
                            {
                                "title": "National Income",
                                "topics": [
                                    ("GDP, GNP and national income accounting", 85, "medium", "high"),
                                    ("Inflation measurement and control", 80, "medium", "high"),
                                ],
                            },
                            {
                                "title": "Banking and Finance",
                                "topics": [
                                    ("RBI monetary policy instruments", 90, "hard", "high"),
                                    ("Financial inclusion and payment systems", 65, "easy", "medium"),
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    },
    {
        "title": "JEE Main — Physics, Chemistry & Mathematics",
        "category": "competitive_exam",
        "level": "Intermediate",
        "estimated_duration_weeks": 40,
        "target_audience": "Class 11 and 12 students preparing for JEE Main",
        "description": (
            "Full JEE Main syllabus split into physics, chemistry and mathematics "
            "with chapter-level topics, estimated study time and difficulty."
        ),
        "subjects": [
            {
                "name": "Physics",
                "weightage": 33.3,
                "units": [
                    {
                        "title": "Mechanics",
                        "chapters": [
                            {
                                "title": "Kinematics",
                                "topics": [
                                    ("Motion in a straight line", 70, "easy", "medium"),
                                    ("Projectile and relative motion", 95, "medium", "high"),
                                ],
                            },
                            {
                                "title": "Laws of Motion",
                                "topics": [
                                    ("Newton's laws and free body diagrams", 100, "medium", "high"),
                                    ("Friction and circular dynamics", 110, "hard", "high"),
                                ],
                            },
                            {
                                "title": "Work, Energy and Power",
                                "topics": [
                                    ("Work-energy theorem", 80, "medium", "high"),
                                    ("Conservation of momentum and collisions", 90, "hard", "high"),
                                ],
                            },
                        ],
                    },
                    {
                        "title": "Electrodynamics",
                        "chapters": [
                            {
                                "title": "Electrostatics",
                                "topics": [
                                    ("Coulomb's law and electric field", 85, "medium", "high"),
                                    ("Gauss's law applications", 100, "hard", "high"),
                                    ("Capacitors and dielectrics", 90, "hard", "medium"),
                                ],
                            },
                            {
                                "title": "Current Electricity",
                                "topics": [
                                    ("Ohm's law and resistor networks", 75, "easy", "high"),
                                    ("Kirchhoff's laws and measuring instruments", 95, "medium", "high"),
                                ],
                            },
                        ],
                    },
                ],
            },
            {
                "name": "Chemistry",
                "weightage": 33.3,
                "units": [
                    {
                        "title": "Physical Chemistry",
                        "chapters": [
                            {
                                "title": "Mole Concept and Stoichiometry",
                                "topics": [
                                    ("Mole concept and empirical formulae", 70, "easy", "high"),
                                    ("Limiting reagent and concentration terms", 65, "medium", "high"),
                                ],
                            },
                            {
                                "title": "Thermodynamics",
                                "topics": [
                                    ("First law and enthalpy changes", 95, "hard", "high"),
                                    ("Entropy, Gibbs energy and spontaneity", 90, "hard", "high"),
                                ],
                            },
                        ],
                    },
                    {
                        "title": "Organic Chemistry",
                        "chapters": [
                            {
                                "title": "General Organic Chemistry",
                                "topics": [
                                    ("Inductive, resonance and hyperconjugation effects", 100, "hard", "high"),
                                    ("Reaction intermediates and stability", 85, "hard", "high"),
                                ],
                            },
                            {
                                "title": "Hydrocarbons",
                                "topics": [
                                    ("Alkanes, alkenes and alkynes reactions", 90, "medium", "medium"),
                                    ("Aromatic substitution reactions", 80, "medium", "high"),
                                ],
                            },
                        ],
                    },
                ],
            },
            {
                "name": "Mathematics",
                "weightage": 33.4,
                "units": [
                    {
                        "title": "Algebra",
                        "chapters": [
                            {
                                "title": "Quadratic Equations and Complex Numbers",
                                "topics": [
                                    ("Nature of roots and transformations", 80, "medium", "high"),
                                    ("Argand plane and De Moivre's theorem", 95, "hard", "medium"),
                                ],
                            },
                            {
                                "title": "Sequences, Series and Binomial",
                                "topics": [
                                    ("AP, GP, HP and means", 70, "easy", "medium"),
                                    ("Binomial theorem and general term", 85, "medium", "high"),
                                ],
                            },
                        ],
                    },
                    {
                        "title": "Calculus",
                        "chapters": [
                            {
                                "title": "Differentiation",
                                "topics": [
                                    ("Limits, continuity and differentiability", 100, "hard", "high"),
                                    ("Applications: tangents, maxima and minima", 110, "hard", "high"),
                                ],
                            },
                            {
                                "title": "Integration",
                                "topics": [
                                    ("Indefinite integrals and substitution", 95, "medium", "high"),
                                    ("Definite integrals and area under curves", 105, "hard", "high"),
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    },
    {
        "title": "SSC CGL — Tier I Foundation",
        "category": "competitive_exam",
        "level": "Beginner",
        "estimated_duration_weeks": 24,
        "target_audience": "Graduates preparing for SSC Combined Graduate Level Tier I",
        "description": (
            "Quantitative aptitude, reasoning and English preparation for SSC CGL "
            "Tier I with short, revision-friendly topics."
        ),
        "subjects": [
            {
                "name": "Quantitative Aptitude",
                "weightage": 25.0,
                "units": [
                    {
                        "title": "Arithmetic",
                        "chapters": [
                            {
                                "title": "Numbers and Percentages",
                                "topics": [
                                    ("Number system and divisibility rules", 60, "easy", "high"),
                                    ("Percentage, profit and loss", 75, "medium", "high"),
                                ],
                            },
                            {
                                "title": "Time and Work",
                                "topics": [
                                    ("Time, speed and distance", 70, "medium", "high"),
                                    ("Pipes, cisterns and work equivalence", 65, "medium", "medium"),
                                ],
                            },
                        ],
                    },
                    {
                        "title": "Advanced Maths",
                        "chapters": [
                            {
                                "title": "Geometry and Mensuration",
                                "topics": [
                                    ("Triangles, circles and quadrilaterals", 85, "hard", "high"),
                                    ("Surface area and volume", 70, "medium", "medium"),
                                ],
                            },
                        ],
                    },
                ],
            },
            {
                "name": "General Intelligence and Reasoning",
                "weightage": 25.0,
                "units": [
                    {
                        "title": "Verbal Reasoning",
                        "chapters": [
                            {
                                "title": "Series and Analogy",
                                "topics": [
                                    ("Number and alphabet series", 50, "easy", "high"),
                                    ("Analogy and classification", 45, "easy", "medium"),
                                ],
                            },
                            {
                                "title": "Logical Puzzles",
                                "topics": [
                                    ("Seating arrangement and blood relations", 80, "medium", "high"),
                                    ("Syllogism and statement conclusions", 60, "medium", "medium"),
                                ],
                            },
                        ],
                    },
                ],
            },
            {
                "name": "English Language",
                "weightage": 25.0,
                "units": [
                    {
                        "title": "Grammar and Vocabulary",
                        "chapters": [
                            {
                                "title": "Grammar Rules",
                                "topics": [
                                    ("Subject-verb agreement and tenses", 55, "medium", "high"),
                                    ("Articles, prepositions and conjunctions", 50, "easy", "medium"),
                                ],
                            },
                            {
                                "title": "Vocabulary",
                                "topics": [
                                    ("Synonyms, antonyms and one-word substitution", 60, "easy", "high"),
                                    ("Idioms and phrases", 45, "easy", "medium"),
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    },
]

ACHIEVEMENTS = [
    ("first_topic", "First Topic Complete", "Completed your first syllabus topic.", "check-circle",
     {"metric": "topics_completed", "threshold": 1}),
    ("first_focus", "First Focus Session", "Finished your first focus timer session.", "timer",
     {"metric": "focus_sessions_completed", "threshold": 1}),
    ("streak_7", "Seven Day Streak", "Studied on seven consecutive days.", "flame",
     {"metric": "study_streak_days", "threshold": 7}),
    ("first_course", "Course Finisher", "Completed every topic in a course.", "award",
     {"metric": "courses_completed", "threshold": 1}),
    ("weekly_target", "Weekly Target Hit", "Reached your weekly study target.", "target",
     {"metric": "weekly_target_met", "threshold": 1}),
    ("topics_100", "Century of Topics", "Completed one hundred topics.", "layers",
     {"metric": "topics_completed", "threshold": 100}),
    ("tasks_50", "Task Machine", "Completed fifty planned tasks.", "list-checks",
     {"metric": "tasks_completed", "threshold": 50}),
    ("focus_20h", "Twenty Focused Hours", "Accumulated twenty hours of focus time.", "hourglass",
     {"metric": "focus_minutes", "threshold": 1200}),
]

DEFAULT_SETTINGS = [
    ("course_categories", ["competitive_exam", "university", "skill"],
     "Categories offered when creating a course."),
    ("allowed_resource_types",
     ["pdf", "document", "image", "link", "practice_set", "revision_sheet", "note"],
     "Resource types administrators may upload."),
    ("notification_defaults", NOTIFICATION_PREFS,
     "Notification preferences applied to new accounts."),
    ("max_upload_mb", 20, "Maximum upload size accepted from students and admins."),
]


# --- helpers ------------------------------------------------------------


def _get_or_create_user(data, role, status):
    user = User.query.filter(db.func.lower(User.email) == data["email"]).first()
    if user:
        return user, False
    user = User(
        full_name=data["full_name"],
        email=data["email"],
        password_hash=hash_password(data["password"]),
        role=role,
        status=status,
        email_verified=True,
        timezone="Asia/Kolkata",
        language="en",
        daily_target_minutes=data.get("daily_target_minutes", 240),
        weekly_target_minutes=data.get("daily_target_minutes", 240) * 6,
        availability_json=json.dumps(AVAILABILITY),
        notification_prefs_json=json.dumps(NOTIFICATION_PREFS),
    )
    db.session.add(user)
    db.session.flush()
    return user, True


def _get_or_create_subject(name, weightage):
    slug = slugify(name)
    subject = Subject.query.filter_by(slug=slug).first()
    if subject:
        return subject
    subject = Subject(
        name=name,
        slug=slug,
        description=f"{name} syllabus content, units and topics.",
        weightage=weightage,
        status="active",
    )
    db.session.add(subject)
    db.session.flush()
    return subject


def _build_course(spec, admin):
    slug = slugify(spec["title"])
    course = Course.query.filter_by(slug=slug).first()
    created = False
    if course is None:
        course = Course(
            title=spec["title"],
            slug=slug,
            description=spec["description"],
            category=spec["category"],
            level=spec["level"],
            estimated_duration_weeks=spec["estimated_duration_weeks"],
            target_audience=spec["target_audience"],
            status="published",
            created_by=admin.id,
        )
        db.session.add(course)
        db.session.flush()
        created = True

    version = SyllabusVersion.query.filter_by(
        course_id=course.id, version_number=1
    ).first()
    if version is None:
        version = SyllabusVersion(
            course_id=course.id,
            version_number=1,
            status="published",
            notes="Initial published syllabus.",
            published_at=utcnow(),
        )
        db.session.add(version)
        db.session.flush()

    if version.units:
        # Syllabus already populated — leave existing topics (and therefore any
        # student progress pointing at them) untouched.
        return course, version, created

    for subject_order, subject_spec in enumerate(spec["subjects"]):
        subject = _get_or_create_subject(
            subject_spec["name"], subject_spec.get("weightage")
        )
        link = CourseSubject.query.filter_by(
            course_id=course.id, subject_id=subject.id
        ).first()
        if link is None:
            db.session.add(
                CourseSubject(
                    course_id=course.id,
                    subject_id=subject.id,
                    display_order=subject_order,
                    weightage=subject_spec.get("weightage"),
                )
            )

        for unit_order, unit_spec in enumerate(subject_spec["units"]):
            unit = SyllabusUnit(
                syllabus_version_id=version.id,
                subject_id=subject.id,
                title=unit_spec["title"],
                description=f"{unit_spec['title']} — {subject.name}",
                unit_type="unit",
                display_order=unit_order,
            )
            db.session.add(unit)
            db.session.flush()

            for chapter_order, chapter_spec in enumerate(unit_spec["chapters"]):
                chapter = SyllabusUnit(
                    syllabus_version_id=version.id,
                    subject_id=subject.id,
                    parent_id=unit.id,
                    title=chapter_spec["title"],
                    unit_type="chapter",
                    display_order=chapter_order,
                )
                db.session.add(chapter)
                db.session.flush()

                for topic_order, topic_spec in enumerate(chapter_spec["topics"]):
                    title, minutes, difficulty, importance = topic_spec
                    db.session.add(
                        Topic(
                            unit_id=chapter.id,
                            title=title,
                            description=(
                                f"{title} — part of {chapter_spec['title']} "
                                f"({subject.name})."
                            ),
                            estimated_minutes=minutes,
                            difficulty=difficulty,
                            importance=importance,
                            display_order=topic_order,
                        )
                    )
    db.session.flush()
    return course, version, created


def _course_topics(version):
    return (
        Topic.query.join(SyllabusUnit, Topic.unit_id == SyllabusUnit.id)
        .filter(SyllabusUnit.syllabus_version_id == version.id)
        .order_by(SyllabusUnit.subject_id, SyllabusUnit.display_order, Topic.display_order)
        .all()
    )


def _seed_progress(user, course, version, completed_ratio, rng):
    """Create topic progress so analytics and dashboards are non-empty."""
    existing = (
        db.session.query(TopicProgress.topic_id)
        .join(Topic, TopicProgress.topic_id == Topic.id)
        .join(SyllabusUnit, Topic.unit_id == SyllabusUnit.id)
        .filter(
            TopicProgress.user_id == user.id,
            SyllabusUnit.syllabus_version_id == version.id,
        )
        .count()
    )
    if existing:
        return 0

    topics = _course_topics(version)
    completed_count = int(len(topics) * completed_ratio)
    in_progress_count = max(2, int(len(topics) * 0.12))
    created = 0
    today = date.today()

    for index, topic in enumerate(topics):
        if index < completed_count:
            status = "completed"
            spent = int(topic.estimated_minutes * rng.uniform(0.8, 1.3))
            completed_at = utcnow() - timedelta(days=rng.randint(1, 45))
            needs_revision = index % 4 == 0
            next_revision = (
                today + timedelta(days=rng.randint(-3, 12)) if needs_revision else None
            )
        elif index < completed_count + in_progress_count:
            status = "in_progress"
            spent = int(topic.estimated_minutes * rng.uniform(0.2, 0.6))
            completed_at = None
            needs_revision = False
            next_revision = None
        else:
            continue

        db.session.add(
            TopicProgress(
                user_id=user.id,
                topic_id=topic.id,
                status=status,
                time_spent_minutes=spent,
                notes=(
                    "Revise formula sheet before the next mock test."
                    if status == "completed" and index % 5 == 0
                    else None
                ),
                priority=rng.choice(["low", "medium", "high"]),
                target_date=today + timedelta(days=rng.randint(3, 60)),
                needs_revision=needs_revision,
                next_revision_date=next_revision,
                completed_at=completed_at,
            )
        )
        created += 1
    return created


def _seed_sessions_and_focus(user, enrollment_pairs, rng):
    """Study sessions (past + upcoming) and completed focus sessions."""
    if StudySession.query.filter_by(user_id=user.id).count():
        return 0, 0

    sessions = 0
    focus = 0
    today = date.today()

    for offset in range(-20, 8):
        day = today + timedelta(days=offset)
        if rng.random() < 0.18:
            continue  # rest day — keeps the streak history realistic

        for slot_index in range(rng.randint(1, 2)):
            course, version = enrollment_pairs[
                (offset + slot_index) % len(enrollment_pairs)
            ]
            topics = _course_topics(version)
            topic = topics[rng.randrange(len(topics))] if topics else None
            start_hour = 18 if slot_index == 0 else 6
            start_at = datetime.combine(day, time(start_hour, 0)) + timedelta(
                minutes=30 * slot_index
            )
            planned = rng.choice([45, 50, 60, 90])
            end_at = start_at + timedelta(minutes=planned)

            if offset < 0:
                status = rng.choice(
                    ["completed", "completed", "completed", "partially_completed", "skipped"]
                )
                actual = {
                    "completed": planned,
                    "partially_completed": int(planned * 0.6),
                    "skipped": 0,
                }[status]
            else:
                status = "planned"
                actual = 0

            db.session.add(
                StudySession(
                    user_id=user.id,
                    course_id=course.id,
                    subject_id=topic.unit.subject_id if topic else None,
                    topic_id=topic.id if topic else None,
                    title=topic.title if topic else f"{course.title} study block",
                    session_type="revision" if offset % 7 == 0 else "study",
                    start_at=start_at,
                    end_at=end_at,
                    planned_minutes=planned,
                    status=status,
                    actual_minutes=actual,
                    notes=None,
                )
            )
            sessions += 1

            if offset < 0 and status != "skipped":
                target = user.focus_duration_minutes
                started = start_at + timedelta(minutes=5)
                cycles = rng.randint(1, 3)
                focus_minutes = target * cycles
                db.session.add(
                    FocusSession(
                        user_id=user.id,
                        course_id=course.id,
                        subject_id=topic.unit.subject_id if topic else None,
                        topic_id=topic.id if topic else None,
                        mode="pomodoro",
                        target_minutes=target,
                        focus_minutes=focus_minutes,
                        break_minutes=user.short_break_minutes * cycles,
                        started_at=started,
                        ended_at=started
                        + timedelta(minutes=focus_minutes + user.short_break_minutes * cycles),
                        status="completed" if status == "completed" else "interrupted",
                        cycles_completed=cycles,
                    )
                )
                focus += 1
    return sessions, focus


def _seed_tasks(user, enrollment_pairs, rng):
    if Task.query.filter_by(user_id=user.id).count():
        return 0
    today = date.today()
    templates = [
        ("Solve previous year questions", "high", -3, "completed", 60),
        ("Revise formula sheet", "medium", -1, "completed", 30),
        ("Attempt full-length mock test", "high", 1, "pending", 180),
        ("Make short notes for weak chapter", "medium", 2, "in_progress", 45),
        ("Review mock test mistakes", "high", 3, "pending", 90),
        ("Read current affairs compilation", "low", 0, "pending", 40),
        ("Complete pending chapter exercises", "medium", -2, "pending", 75),
        ("Plan next week's timetable", "low", 5, "pending", 20),
    ]
    created = 0
    for index, (title, priority, day_offset, status, minutes) in enumerate(templates):
        course, version = enrollment_pairs[index % len(enrollment_pairs)]
        topics = _course_topics(version)
        topic = topics[rng.randrange(len(topics))] if topics else None
        due = today + timedelta(days=day_offset)
        db.session.add(
            Task(
                user_id=user.id,
                course_id=course.id,
                subject_id=topic.unit.subject_id if topic else None,
                topic_id=topic.id if topic else None,
                title=title,
                description=f"{title} for {course.title}.",
                priority=priority,
                due_date=due,
                due_time=time(20, 0),
                estimated_minutes=minutes,
                status=status,
                reminder_at=datetime.combine(due, time(18, 0)),
                completed_at=(
                    datetime.combine(due, time(21, 0)) if status == "completed" else None
                ),
            )
        )
        created += 1
    return created


def _seed_goals(user, enrollment_pairs):
    if Goal.query.filter_by(user_id=user.id).count():
        return 0
    today = date.today()
    course = enrollment_pairs[0][0]
    goals = [
        {
            "title": f"Finish {course.title} syllabus",
            "category": "course_completion",
            "target_value": 100.0,
            "current_value": 42.0,
            "unit": "topics",
            "deadline": today + timedelta(days=120),
        },
        {
            "title": "Study 25 hours this week",
            "category": "weekly_hours",
            "target_value": 25.0,
            "current_value": 14.5,
            "unit": "hours",
            "deadline": today + timedelta(days=7 - today.weekday()),
        },
        {
            "title": "Hold a 14 day study streak",
            "category": "study_streak",
            "target_value": 14.0,
            "current_value": 6.0,
            "unit": "days",
            "deadline": today + timedelta(days=21),
        },
        {
            "title": "Complete 40 topics this month",
            "category": "topics_count",
            "target_value": 40.0,
            "current_value": 23.0,
            "unit": "topics",
            "deadline": today + timedelta(days=30),
        },
    ]
    for spec in goals:
        db.session.add(
            Goal(
                user_id=user.id,
                course_id=course.id if spec["category"] == "course_completion" else None,
                title=spec["title"],
                description=f"{spec['title']} — tracked from stored activity.",
                category=spec["category"],
                target_value=spec["target_value"],
                current_value=spec["current_value"],
                unit=spec["unit"],
                start_date=today - timedelta(days=7),
                deadline=spec["deadline"],
                status="active",
            )
        )
    return len(goals)


def _award_achievements(user):
    """Award only achievements the stored activity actually supports."""
    completed_topics = TopicProgress.query.filter_by(
        user_id=user.id, status="completed"
    ).count()
    completed_focus = FocusSession.query.filter_by(
        user_id=user.id, status="completed"
    ).count()
    focus_minutes = (
        db.session.query(db.func.coalesce(db.func.sum(FocusSession.focus_minutes), 0))
        .filter(FocusSession.user_id == user.id, FocusSession.status == "completed")
        .scalar()
    )
    completed_tasks = Task.query.filter_by(user_id=user.id, status="completed").count()

    metrics = {
        "topics_completed": completed_topics,
        "focus_sessions_completed": completed_focus,
        "focus_minutes": focus_minutes or 0,
        "tasks_completed": completed_tasks,
        "study_streak_days": 0,
        "courses_completed": 0,
        "weekly_target_met": 0,
    }

    awarded = 0
    for achievement in Achievement.query.filter_by(is_active=True).all():
        criteria = json.loads(achievement.criteria_json or "{}")
        metric = criteria.get("metric")
        threshold = criteria.get("threshold", 0)
        if metrics.get(metric, 0) < threshold:
            continue
        exists = UserAchievement.query.filter_by(
            user_id=user.id, achievement_id=achievement.id
        ).first()
        if exists:
            continue
        db.session.add(
            UserAchievement(user_id=user.id, achievement_id=achievement.id)
        )
        awarded += 1
    return awarded


def _seed_resources(admin, courses):
    created = 0
    catalog = [
        ("NCERT reference list for prelims", "link", "https://ncert.nic.in/textbook.php",
         "reference,ncert", "public"),
        ("Previous year question compilation", "practice_set", None, "pyq,practice",
         "enrolled_only"),
        ("Formula and revision sheet", "revision_sheet", None, "formulas,revision",
         "enrolled_only"),
    ]
    for course in courses:
        for index, (title, rtype, url, tags, visibility) in enumerate(catalog):
            full_title = f"{course.title}: {title}"
            if Resource.query.filter_by(title=full_title).first():
                continue
            db.session.add(
                Resource(
                    title=full_title,
                    description=f"{title} curated for {course.title}.",
                    resource_type=rtype,
                    external_url=url,
                    tags=tags,
                    course_id=course.id,
                    visibility=visibility,
                    status="published",
                    owner_id=None,
                    uploaded_by=admin.id,
                )
            )
            created += 1
    return created


def _seed_announcements(admin, courses):
    created = 0
    specs = [
        {
            "title": "Welcome to Smart Study Planner",
            "body": (
                "Set your daily study target in Profile & Settings, enroll in a "
                "course and generate your first timetable from the planner."
            ),
            "audience": "all",
            "course_id": None,
        },
        {
            "title": f"{courses[0].title}: revised syllabus published",
            "body": (
                "Version 1 of the syllabus is live. Your existing topic progress "
                "has been preserved."
            ),
            "audience": "course",
            "course_id": courses[0].id,
        },
    ]
    for spec in specs:
        if Announcement.query.filter_by(title=spec["title"]).first():
            continue
        db.session.add(
            Announcement(
                title=spec["title"],
                body=spec["body"],
                audience=spec["audience"],
                course_id=spec["course_id"],
                status="published",
                publish_at=utcnow() - timedelta(days=1),
                expires_at=utcnow() + timedelta(days=60),
                created_by=admin.id,
            )
        )
        created += 1
    return created


def _seed_notifications(user, courses):
    created = 0
    specs = [
        ("announcement", "Welcome to Smart Study Planner",
         "Start by enrolling in a course.", "/app/courses", "announcement:welcome"),
        ("task_due", "A task is due today",
         "Attempt full-length mock test is due today.", "/app/planner/tasks",
         f"task_due:{user.id}:today"),
        ("session_upcoming", "Study session starting soon",
         f"Your next {courses[0].title} session starts at 18:00.", "/app/planner",
         f"session_upcoming:{user.id}:next"),
    ]
    for ntype, title, body, link, dedupe in specs:
        if Notification.query.filter_by(user_id=user.id, dedupe_key=dedupe).first():
            continue
        db.session.add(
            Notification(
                user_id=user.id,
                type=ntype,
                title=title,
                body=body,
                link=link,
                is_read=ntype == "announcement",
                read_at=utcnow() if ntype == "announcement" else None,
                dedupe_key=dedupe,
            )
        )
        created += 1
    return created


def _seed_ai_conversation(user, course):
    if AiConversation.query.filter_by(user_id=user.id).count():
        return 0
    conversation = AiConversation(
        user_id=user.id,
        title=f"{course.title} doubts",
        course_id=course.id,
    )
    db.session.add(conversation)
    db.session.flush()
    db.session.add(
        AiMessage(
            conversation_id=conversation.id,
            role="user",
            content="Explain the difference between fundamental rights and directive principles.",
        )
    )
    db.session.add(
        AiMessage(
            conversation_id=conversation.id,
            role="assistant",
            content=(
                "Fundamental rights are justiciable guarantees enforceable in court, "
                "while directive principles are non-justiciable guidelines addressed "
                "to the state. Rights limit state action; directive principles direct "
                "state policy. AI answers may contain errors — verify against your "
                "syllabus material."
            ),
            sources_json=json.dumps([]),
        )
    )
    return 1


def _seed_settings(admin):
    created = 0
    for key, value, description in DEFAULT_SETTINGS:
        if PlatformSetting.query.filter_by(key=key).first():
            continue
        db.session.add(
            PlatformSetting(
                key=key,
                value_json=json.dumps(value),
                description=description,
                updated_by=admin.id,
            )
        )
        created += 1
    return created


def _reset_demo_data(echo):
    echo("Clearing existing rows...")
    for table in reversed(db.metadata.sorted_tables):
        db.session.execute(table.delete())
    db.session.commit()


# --- entry point --------------------------------------------------------


def seed_demo_data(reset=False, echo=print):
    rng = random.Random(20261024)

    db.create_all()
    if reset:
        _reset_demo_data(echo)

    # Achievement catalogue
    for code, title, description, icon, criteria in ACHIEVEMENTS:
        if Achievement.query.filter_by(code=code).first():
            continue
        db.session.add(
            Achievement(
                code=code,
                title=title,
                description=description,
                icon=icon,
                criteria_json=json.dumps(criteria),
                is_active=True,
            )
        )
    db.session.flush()

    admin, admin_created = _get_or_create_user(ADMIN, "admin", "active")
    students = []
    for spec in STUDENTS:
        student, _ = _get_or_create_user(spec, "student", "active")
        students.append(student)
    db.session.flush()

    courses = []
    versions = {}
    for spec in COURSES:
        course, version, _ = _build_course(spec, admin)
        courses.append(course)
        versions[course.id] = version
    db.session.commit()

    totals = {
        "topics": 0,
        "enrollments": 0,
        "progress": 0,
        "sessions": 0,
        "focus": 0,
        "tasks": 0,
        "goals": 0,
        "achievements": 0,
        "notifications": 0,
    }
    for course in courses:
        totals["topics"] += len(_course_topics(versions[course.id]))

    # Enrollments: student index -> course indexes
    enrollment_map = {0: [0, 1], 1: [1, 2], 2: [0, 2]}
    completion_ratios = {0: 0.45, 1: 0.3, 2: 0.18}
    today = date.today()

    for student_index, student in enumerate(students):
        pairs = []
        for order, course_index in enumerate(enrollment_map[student_index]):
            course = courses[course_index]
            version = versions[course.id]
            enrollment = Enrollment.query.filter_by(
                user_id=student.id, course_id=course.id
            ).first()
            if enrollment is None:
                enrollment = Enrollment(
                    user_id=student.id,
                    course_id=course.id,
                    target_completion_date=today + timedelta(days=150 + order * 60),
                    priority="high" if order == 0 else "medium",
                    difficulty="hard" if course.level == "Advanced" else "medium",
                    status="active",
                    last_accessed_at=utcnow() - timedelta(hours=order * 5 + 2),
                )
                db.session.add(enrollment)
                totals["enrollments"] += 1
            pairs.append((course, version))
        db.session.flush()

        for course, version in pairs:
            totals["progress"] += _seed_progress(
                student, course, version, completion_ratios[student_index], rng
            )
        db.session.flush()

        sessions, focus = _seed_sessions_and_focus(student, pairs, rng)
        totals["sessions"] += sessions
        totals["focus"] += focus
        totals["tasks"] += _seed_tasks(student, pairs, rng)
        totals["goals"] += _seed_goals(student, pairs)
        db.session.flush()
        totals["achievements"] += _award_achievements(student)
        totals["notifications"] += _seed_notifications(student, [c for c, _ in pairs])
        _seed_ai_conversation(student, pairs[0][0])

    resources = _seed_resources(admin, courses)
    announcements = _seed_announcements(admin, courses)
    settings = _seed_settings(admin)

    if not AuditLog.query.filter_by(action="seed.demo_data").first():
        db.session.add(
            AuditLog(
                actor_id=admin.id,
                action="seed.demo_data",
                entity_type="platform",
                entity_id=None,
                detail_json=json.dumps(
                    {"courses": len(courses), "students": len(students)}
                ),
            )
        )

    db.session.commit()

    echo("")
    echo("Seed summary")
    echo("------------")
    echo(f"  admin accounts     : 1 ({'created' if admin_created else 'existing'})")
    echo(f"  student accounts   : {len(students)}")
    echo(f"  courses            : {len(courses)} (published, syllabus version 1)")
    echo(f"  syllabus topics    : {totals['topics']}")
    echo(f"  enrollments added  : {totals['enrollments']}")
    echo(f"  progress rows      : {totals['progress']}")
    echo(f"  study sessions     : {totals['sessions']}")
    echo(f"  focus sessions     : {totals['focus']}")
    echo(f"  tasks              : {totals['tasks']}")
    echo(f"  goals              : {totals['goals']}")
    echo(f"  achievements award : {totals['achievements']}")
    echo(f"  notifications      : {totals['notifications']}")
    echo(f"  resources          : {resources}")
    echo(f"  announcements      : {announcements}")
    echo(f"  platform settings  : {settings}")
    echo("")
    echo("Login credentials")
    echo("-----------------")
    echo(f"  ADMIN    {ADMIN['email']:<28} {ADMIN['password']}")
    for spec in STUDENTS:
        echo(f"  STUDENT  {spec['email']:<28} {spec['password']}")
    echo("")
    return {
        "admin": ADMIN,
        "students": STUDENTS,
        "totals": totals,
    }
