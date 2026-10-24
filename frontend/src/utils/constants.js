/**
 * Navigation definitions and enum label/tone maps.
 *
 * The student nav is PRD section 5 (11 items); the admin nav is PRD 4.1
 * (exactly nine items). Everything else here maps a backend enum value to a
 * human label and a Badge tone.
 */

export const STUDENT_NAV = [
  { to: '/app/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/app/courses', label: 'My Courses', icon: 'courses' },
  { to: '/app/syllabus', label: 'My Syllabus', icon: 'syllabus' },
  { to: '/app/planner', label: 'Timetable & Tasks', icon: 'calendar' },
  { to: '/app/focus', label: 'Focus Timer', icon: 'timer' },
  { to: '/app/goals', label: 'Goals & Achievements', icon: 'target' },
  { to: '/app/analytics', label: 'Progress Analytics', icon: 'analytics' },
  { to: '/app/assistant', label: 'AI Study Assistant', icon: 'sparkle' },
  { to: '/app/materials', label: 'Study Materials', icon: 'folder' },
  { to: '/app/notifications', label: 'Notifications', icon: 'bell' },
  { to: '/app/settings', label: 'Profile & Settings', icon: 'settings' },
];

/** Five primary destinations for the mobile bottom bar; "More" opens the drawer. */
export const STUDENT_MOBILE_NAV = [
  { to: '/app/dashboard', label: 'Home', icon: 'dashboard' },
  { to: '/app/courses', label: 'Courses', icon: 'courses' },
  { to: '/app/planner', label: 'Planner', icon: 'calendar' },
  { to: '/app/focus', label: 'Focus', icon: 'timer' },
];

export const ADMIN_NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/admin/students', label: 'Student Management', icon: 'users' },
  { to: '/admin/courses', label: 'Course Management', icon: 'courses' },
  { to: '/admin/subjects', label: 'Subject Management', icon: 'layers' },
  { to: '/admin/syllabus', label: 'Syllabus Management', icon: 'syllabus' },
  { to: '/admin/materials', label: 'Study Material Management', icon: 'folder' },
  { to: '/admin/announcements', label: 'Announcements & Notifications', icon: 'megaphone' },
  { to: '/admin/reports', label: 'Reports & Analytics', icon: 'analytics' },
  { to: '/admin/settings', label: 'Profile & Settings', icon: 'settings' },
];

/* --- Enum labels -------------------------------------------------------- */

export const ACCOUNT_STATUS_LABELS = {
  active: 'Active',
  suspended: 'Suspended',
  pending_verification: 'Pending verification',
};

export const COURSE_STATUS_LABELS = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

export const COURSE_CATEGORY_LABELS = {
  competitive_exam: 'Competitive exam',
  university: 'University',
  skill: 'Skill',
};

export const PRIORITY_LABELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const DIFFICULTY_LABELS = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export const IMPORTANCE_LABELS = PRIORITY_LABELS;

export const TOPIC_STATUS_LABELS = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
};

export const TASK_STATUS_LABELS = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const SESSION_STATUS_LABELS = {
  planned: 'Planned',
  completed: 'Completed',
  skipped: 'Skipped',
  partially_completed: 'Partially completed',
};

export const SESSION_TYPE_LABELS = {
  study: 'Study',
  revision: 'Revision',
  break: 'Break',
};

export const FOCUS_STATUS_LABELS = {
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  interrupted: 'Interrupted',
  abandoned: 'Abandoned',
};

export const GOAL_STATUS_LABELS = {
  active: 'Active',
  completed: 'Completed',
  paused: 'Paused',
  overdue: 'Overdue',
};

export const GOAL_CATEGORY_LABELS = {
  course_completion: 'Complete a course',
  topics_count: 'Topics completed',
  weekly_hours: 'Weekly study hours',
  daily_tasks: 'Daily tasks',
  study_streak: 'Study streak',
  revision_cycle: 'Revision cycle',
  practice_questions: 'Practice questions',
};

export const RESOURCE_TYPE_LABELS = {
  pdf: 'PDF',
  document: 'Document',
  image: 'Image',
  link: 'External link',
  practice_set: 'Practice set',
  revision_sheet: 'Revision sheet',
  note: 'Note',
};

export const VISIBILITY_LABELS = {
  public: 'Public',
  enrolled_only: 'Enrolled students',
  private: 'Private',
};

export const PUBLISH_STATUS_LABELS = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  published: 'Published',
  archived: 'Archived',
};

export const NOTIFICATION_TYPE_LABELS = {
  session_upcoming: 'Upcoming session',
  task_due: 'Task due',
  task_overdue: 'Task overdue',
  revision_due: 'Revision due',
  goal_deadline: 'Goal deadline',
  announcement: 'Announcement',
  new_resource: 'New resource',
  plan_change: 'Plan change',
};

/* --- Select option helpers --------------------------------------------- */

export function optionsFrom(labelMap) {
  return Object.entries(labelMap).map(([value, label]) => ({ value, label }));
}

export const PRIORITY_OPTIONS = optionsFrom(PRIORITY_LABELS);
export const DIFFICULTY_OPTIONS = optionsFrom(DIFFICULTY_LABELS);
export const TASK_STATUS_OPTIONS = optionsFrom(TASK_STATUS_LABELS);
export const TOPIC_STATUS_OPTIONS = optionsFrom(TOPIC_STATUS_LABELS);
export const COURSE_STATUS_OPTIONS = optionsFrom(COURSE_STATUS_LABELS);
export const COURSE_CATEGORY_OPTIONS = optionsFrom(COURSE_CATEGORY_LABELS);
export const ACCOUNT_STATUS_OPTIONS = optionsFrom(ACCOUNT_STATUS_LABELS);
export const RESOURCE_TYPE_OPTIONS = optionsFrom(RESOURCE_TYPE_LABELS);
export const GOAL_CATEGORY_OPTIONS = optionsFrom(GOAL_CATEGORY_LABELS);

/* --- Status → Badge tone ------------------------------------------------ */

const TONE_MAP = {
  active: 'success',
  completed: 'success',
  published: 'success',
  suspended: 'danger',
  overdue: 'danger',
  cancelled: 'neutral',
  abandoned: 'neutral',
  interrupted: 'warning',
  pending: 'warning',
  pending_verification: 'warning',
  scheduled: 'info',
  in_progress: 'info',
  running: 'info',
  partially_completed: 'warning',
  skipped: 'neutral',
  paused: 'neutral',
  planned: 'info',
  draft: 'neutral',
  archived: 'neutral',
  not_started: 'neutral',
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
  hard: 'danger',
  easy: 'success',
  public: 'info',
  enrolled_only: 'primary',
  private: 'neutral',
};

export function statusTone(value) {
  return TONE_MAP[String(value || '').toLowerCase()] || 'neutral';
}

export function labelFor(labelMap, value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  return labelMap[value] || String(value).replace(/_/g, ' ');
}

/* --- Misc --------------------------------------------------------------- */

export const PAGE_SIZE = 20;
export const AI_DISCLAIMER = 'AI answers may contain errors. Check anything important against your course material.';
export const WEEKDAYS = [
  { key: 'mon', label: 'Monday', short: 'Mon' },
  { key: 'tue', label: 'Tuesday', short: 'Tue' },
  { key: 'wed', label: 'Wednesday', short: 'Wed' },
  { key: 'thu', label: 'Thursday', short: 'Thu' },
  { key: 'fri', label: 'Friday', short: 'Fri' },
  { key: 'sat', label: 'Saturday', short: 'Sat' },
  { key: 'sun', label: 'Sunday', short: 'Sun' },
];
export const CHART_COLORS = [
  'var(--c-chart-1)',
  'var(--c-chart-2)',
  'var(--c-chart-3)',
  'var(--c-chart-4)',
  'var(--c-chart-5)',
  'var(--c-chart-6)',
];
