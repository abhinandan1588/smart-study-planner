"""Insights derived strictly from the aggregates (PRD 3.8).

Each insight states something the stored data supports — a target shortfall, an
approaching deadline, a streak, a neglected course. No claims are made about
academic performance or exam outcomes.
"""


def build_insights(user, data, today):
    insights = []

    daily = data.get("daily_study") or []
    recent = daily[-7:]
    if recent:
        studied = sum(point["minutes"] for point in recent)
        active_days = sum(1 for point in recent if point["minutes"] > 0)
        target = (user.daily_target_minutes or 0) * len(recent)
        if target:
            ratio = studied / target
            if ratio < 0.6:
                insights.append(
                    {
                        "type": "target_shortfall",
                        "severity": "warning",
                        "message": (
                            f"You studied {studied} of {target} target minutes over "
                            f"the last {len(recent)} days "
                            f"({round(ratio * 100)}% of target)."
                        ),
                    }
                )
            elif ratio >= 1:
                insights.append(
                    {
                        "type": "target_met",
                        "severity": "success",
                        "message": (
                            f"You met your daily target across the last "
                            f"{len(recent)} days with {studied} minutes studied."
                        ),
                    }
                )
        if active_days == 0:
            insights.append(
                {
                    "type": "no_recent_activity",
                    "severity": "info",
                    "message": "No study activity is recorded in the last 7 days.",
                }
            )

    streak = data.get("streak") or {}
    if streak.get("current", 0) >= 3:
        insights.append(
            {
                "type": "streak",
                "severity": "success",
                "message": f"You are on a {streak['current']}-day study streak.",
            }
        )
    elif streak.get("longest", 0) > streak.get("current", 0) and streak.get("longest"):
        insights.append(
            {
                "type": "streak_broken",
                "severity": "info",
                "message": (
                    f"Your current streak is {streak.get('current', 0)} days; your "
                    f"longest was {streak['longest']} days."
                ),
            }
        )

    overdue = data.get("overdue_tasks", 0)
    if overdue:
        insights.append(
            {
                "type": "overdue_tasks",
                "severity": "warning",
                "message": f"{overdue} task(s) are past their due date.",
            }
        )

    deadlines = data.get("upcoming_deadlines") or []
    soon = [item for item in deadlines if item["days_left"] <= 3]
    if soon:
        nearest = soon[0]
        insights.append(
            {
                "type": "deadline_approaching",
                "severity": "warning",
                "message": (
                    f"'{nearest['title']}' is due in {nearest['days_left']} day(s) "
                    f"on {nearest['date']}."
                ),
            }
        )

    planned_actual = data.get("planned_vs_actual") or []
    planned_total = sum(point["planned_minutes"] for point in planned_actual)
    actual_total = sum(point["actual_minutes"] for point in planned_actual)
    if planned_total and actual_total < planned_total * 0.7:
        insights.append(
            {
                "type": "plan_adherence",
                "severity": "info",
                "message": (
                    f"You completed {actual_total} of {planned_total} planned "
                    "minutes in this range. Consider shorter sessions."
                ),
            }
        )

    by_subject = data.get("by_subject") or []
    if len(by_subject) >= 2:
        strongest = by_subject[0]
        weakest = by_subject[-1]
        insights.append(
            {
                "type": "subject_balance",
                "severity": "info",
                "message": (
                    f"Most time went to {strongest['subject']} "
                    f"({strongest['minutes']} min) and least to "
                    f"{weakest['subject']} ({weakest['minutes']} min)."
                ),
            }
        )

    completion = data.get("course_completion") or []
    stalled = [
        course
        for course in completion
        if course["total_topics"] and course["percent"] < 25
    ]
    if stalled:
        insights.append(
            {
                "type": "course_behind",
                "severity": "info",
                "message": (
                    f"'{stalled[0]['course']}' is {stalled[0]['percent']}% complete "
                    f"({stalled[0]['completed_topics']} of "
                    f"{stalled[0]['total_topics']} topics)."
                ),
            }
        )

    if not insights:
        insights.append(
            {
                "type": "getting_started",
                "severity": "info",
                "message": (
                    "Log a study session or complete a topic to start building "
                    "your analytics."
                ),
            }
        )
    return insights
