"""Prompt construction for the AI Study Assistant (PRD 3.9).

Only the context the answer needs is sent to the provider: the selected course
or topic, the chosen explanation level, the retrieved document chunks and the
recent turns of this conversation. The student's private profile, email,
analytics and other records are never included.
"""

MODES = ("explain", "summary", "quiz", "flashcards", "revision_plan", "breakdown")
LEVELS = ("simple", "standard", "advanced")

LEVEL_GUIDANCE = {
    "simple": (
        "Explain in plain language a beginner can follow. Short sentences, "
        "everyday examples, no jargon unless you define it."
    ),
    "standard": (
        "Explain at the level of a well-prepared exam candidate. Define key "
        "terms and keep the structure tight."
    ),
    "advanced": (
        "Explain at an advanced level. Use precise terminology, cover edge "
        "cases and link related concepts."
    ),
}

MODE_GUIDANCE = {
    "explain": "Explain the concept the student asks about, then give one worked example.",
    "summary": "Produce concise revision notes: a short intro and compact bullet points.",
    "quiz": (
        "Write practice questions with four options each, mark the correct "
        "option and explain why the others are wrong."
    ),
    "flashcards": "Produce question-and-answer flashcards, one fact per card.",
    "revision_plan": (
        "Produce a dated revision plan with spaced intervals and the time each "
        "block should take."
    ),
    "breakdown": (
        "Break the task into ordered, concrete sub-steps with an estimated "
        "duration for each."
    ),
}

BASE_SYSTEM_PROMPT = (
    "You are the Smart Study Planner study assistant. You help students "
    "preparing for competitive examinations and university courses.\n"
    "Rules you must follow:\n"
    "1. When context passages are supplied, answer from them and cite the "
    "passage numbers inline like [1] or [2].\n"
    "2. If the passages do not contain the answer, say so plainly and answer "
    "from general knowledge, clearly marked as not coming from the material.\n"
    "3. Never invent a citation, a page number or a source.\n"
    "4. Be concise and well structured. Prefer short paragraphs and lists.\n"
    "5. Stay on study topics. Decline unrelated requests politely."
)


def system_prompt(level="standard", mode="explain", context=None):
    parts = [BASE_SYSTEM_PROMPT, LEVEL_GUIDANCE.get(level, LEVEL_GUIDANCE["standard"])]
    parts.append(MODE_GUIDANCE.get(mode, MODE_GUIDANCE["explain"]))
    if context:
        parts.append(context)
    return "\n\n".join(parts)


def study_context(course=None, topic=None):
    """One-line statement of what the student is currently studying."""
    bits = []
    if course is not None:
        bits.append(f"Course: {course.title} ({course.category})")
    if topic:
        bits.append(f"Subject: {topic.get('subject_name') or 'not set'}")
        bits.append(f"Unit: {topic.get('unit_title') or 'not set'}")
        bits.append(f"Topic: {topic['title']}")
        if topic.get("description"):
            bits.append(f"Syllabus description: {topic['description']}")
        bits.append(
            f"Topic difficulty {topic['difficulty']}, importance {topic['importance']}."
        )
    if not bits:
        return ""
    return "The student is currently studying:\n" + "\n".join(bits)


def context_block(hits):
    """Numbered passage block the model must cite from."""
    if not hits:
        return (
            "No passages were retrieved from the student's authorised study "
            "material for this question. Say so before answering from general "
            "knowledge."
        )
    lines = [
        "Use these passages from the student's authorised study material. "
        "Cite them by number."
    ]
    for position, hit in enumerate(hits, start=1):
        label = hit["title"]
        if hit["page_number"]:
            label += f", page {hit['page_number']}"
        lines.append(f"\n[{position}] {label}\n{hit['content']}")
    return "\n".join(lines)


def chat_messages(history, question, hits):
    """Provider message list: recent turns, then the grounded question."""
    messages = [
        {"role": "assistant" if item.role == "assistant" else "user", "content": item.content}
        for item in history
        if item.role in ("user", "assistant") and item.content
    ]
    messages.append(
        {
            "role": "user",
            "content": f"{context_block(hits)}\n\nStudent question: {question}",
        }
    )
    return messages


def quiz_prompt(count, difficulty, subject_label, hits):
    return (
        f"{context_block(hits)}\n\n"
        f"Write {count} multiple-choice questions at {difficulty} difficulty "
        f"about: {subject_label}.\n"
        'Reply with JSON only, shaped exactly as {"questions": [{"question": '
        '"...", "options": ["a","b","c","d"], "answer_index": 0, '
        '"explanation": "..."}]}. Use exactly four options per question and a '
        "zero-based answer_index."
    )


def flashcards_prompt(count, subject_label, hits):
    return (
        f"{context_block(hits)}\n\n"
        f"Write {count} revision flashcards about: {subject_label}.\n"
        'Reply with JSON only, shaped exactly as {"cards": [{"front": "...", '
        '"back": "..."}]}. Keep each side to one fact and under 220 characters.'
    )
