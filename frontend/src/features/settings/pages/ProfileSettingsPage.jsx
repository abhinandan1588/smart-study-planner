import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import PageLoader from '../../../components/common/PageLoader';
import Avatar from '../../../components/ui/Avatar';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import Checkbox from '../../../components/ui/Checkbox';
import ErrorState from '../../../components/ui/ErrorState';
import IconButton from '../../../components/ui/IconButton';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import { useToast } from '../../../components/ui/ToastProvider';
import useApi from '../../../hooks/useApi';
import { useAuth } from '../../../context/AuthContext';
import { studentApi } from '../../../services/studentApi';
import { formatDateTime } from '../../../utils/date';
import { formatMinutes } from '../../../utils/format';
import { WEEKDAYS, labelFor, statusTone } from '../../../utils/constants';
import './settings.css';

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
].map((zone) => ({ value: zone, label: zone }));

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी (Hindi)' },
];

const NOTIFICATION_PREFS = [
  { key: 'session_upcoming', label: 'Upcoming study sessions' },
  { key: 'task_due', label: 'Task deadlines' },
  { key: 'revision_due', label: 'Scheduled revisions' },
  { key: 'goal_deadline', label: 'Goal deadlines' },
  { key: 'announcement', label: 'Announcements' },
  { key: 'new_resource', label: 'New course resources' },
];

const ACCESSIBILITY_PREFS = [
  { key: 'reduce_motion', label: 'Reduce motion' },
  { key: 'high_contrast', label: 'Prefer higher contrast' },
  { key: 'larger_text', label: 'Prefer larger text' },
];

/**
 * Profile and settings (PRD 3.12).
 *
 * The study preferences written here are the same rows the dashboard target
 * ring, the focus timer defaults and the smart timetable generator read on the
 * server, so a change takes effect everywhere.
 */
export default function ProfileSettingsPage() {
  const toast = useToast();
  const { refreshUser } = useAuth();

  const fetchProfile = useCallback(() => studentApi.getProfile(), []);
  const { data, error, loading, reload } = useApi(fetchProfile);

  const [profileForm, setProfileForm] = useState(null);
  const [prefsForm, setPrefsForm] = useState(null);
  const [availability, setAvailability] = useState({});
  const [notificationPrefs, setNotificationPrefs] = useState({});
  const [accessibilityPrefs, setAccessibilityPrefs] = useState({});
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    const user = data?.user;
    if (!user) return;
    setProfileForm({
      full_name: user.full_name || '',
      avatar_url: user.avatar_url || '',
      timezone: user.timezone || 'UTC',
      language: user.language || 'en',
    });
    const prefs = user.preferences || {};
    setPrefsForm({
      daily_target_minutes: String(prefs.daily_target_minutes ?? 240),
      weekly_target_minutes: String(prefs.weekly_target_minutes ?? 1500),
      focus_duration_minutes: String(prefs.focus_duration_minutes ?? 25),
      short_break_minutes: String(prefs.short_break_minutes ?? 5),
      long_break_minutes: String(prefs.long_break_minutes ?? 15),
    });
    setAvailability(prefs.availability || {});
    setNotificationPrefs(prefs.notifications || {});
    setAccessibilityPrefs(prefs.accessibility || {});
  }, [data]);

  async function saveProfile(event) {
    event.preventDefault();
    setSavingProfile(true);
    setFieldErrors({});
    try {
      await studentApi.updateProfile({
        full_name: profileForm.full_name.trim(),
        avatar_url: profileForm.avatar_url.trim() || null,
        timezone: profileForm.timezone,
        language: profileForm.language,
      });
      await refreshUser();
      toast.success('Profile updated');
      reload();
    } catch (caught) {
      setFieldErrors(caught.fields || {});
      if (!caught.fields || Object.keys(caught.fields).length === 0) {
        toast.apiError(caught, 'Could not save your profile');
      }
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePreferences(event) {
    event.preventDefault();
    setSavingPrefs(true);
    setFieldErrors({});
    try {
      await studentApi.updateProfile({
        daily_target_minutes: Number(prefsForm.daily_target_minutes),
        weekly_target_minutes: Number(prefsForm.weekly_target_minutes),
        focus_duration_minutes: Number(prefsForm.focus_duration_minutes),
        short_break_minutes: Number(prefsForm.short_break_minutes),
        long_break_minutes: Number(prefsForm.long_break_minutes),
        availability,
        notification_prefs: notificationPrefs,
        accessibility_prefs: accessibilityPrefs,
      });
      await refreshUser();
      toast.success(
        'Preferences saved',
        'The dashboard target and the plan generator use these values.',
      );
      reload();
    } catch (caught) {
      setFieldErrors(caught.fields || {});
      if (!caught.fields || Object.keys(caught.fields).length === 0) {
        toast.apiError(caught, 'Could not save your preferences');
      }
    } finally {
      setSavingPrefs(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setFieldErrors({});
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setFieldErrors({ confirm_password: 'The two passwords do not match.' });
      return;
    }
    setSavingPassword(true);
    try {
      await studentApi.changePassword(
        passwordForm.current_password,
        passwordForm.new_password,
      );
      toast.success('Password changed');
      setPasswordForm({
        current_password: '',
        new_password: '',
        confirm_password: '',
      });
    } catch (caught) {
      setFieldErrors(caught.fields || {});
      if (!caught.fields || Object.keys(caught.fields).length === 0) {
        toast.apiError(caught, 'Could not change your password');
      }
    } finally {
      setSavingPassword(false);
    }
  }

  function addWindow(dayKey) {
    setAvailability((current) => ({
      ...current,
      [dayKey]: [...(current[dayKey] || []), { start: '18:00', end: '21:00' }],
    }));
  }

  function updateWindow(dayKey, index, field, value) {
    setAvailability((current) => ({
      ...current,
      [dayKey]: (current[dayKey] || []).map((window, position) =>
        position === index ? { ...window, [field]: value } : window,
      ),
    }));
  }

  function removeWindow(dayKey, index) {
    setAvailability((current) => {
      const next = (current[dayKey] || []).filter((_, position) => position !== index);
      const copy = { ...current };
      if (next.length === 0) delete copy[dayKey];
      else copy[dayKey] = next;
      return copy;
    });
  }

  if (loading && !data) return <PageLoader cards={3} />;
  if (error && !data) {
    return (
      <div className="sp-page">
        <PageHeader title="Profile & Settings" />
        <ErrorState error={error} onRetry={reload} boxed />
      </div>
    );
  }

  const user = data?.user;
  if (!user || !profileForm || !prefsForm) return null;

  const weeklyFromAvailability = WEEKDAYS.reduce((sum, day) => {
    const windows = availability[day.key] || [];
    return (
      sum +
      windows.reduce((dayTotal, window) => {
        const [sh, sm] = String(window.start || '0:0').split(':').map(Number);
        const [eh, em] = String(window.end || '0:0').split(':').map(Number);
        return dayTotal + Math.max(0, eh * 60 + em - (sh * 60 + sm));
      }, 0)
    );
  }, 0);

  return (
    <div className="sp-page">
      <PageHeader
        title="Profile & Settings"
        description="Your account, study targets, availability and notification preferences."
      />

      <div className="sp-set__cols">
        <div className="sp-set__col">
          <Card title="Profile" subtitle="Name, time zone and language">
            <div className="sp-set__identity" style={{ marginBottom: 'var(--sp-4)' }}>
              <Avatar name={user.full_name} src={user.avatar_url} size="lg" />
              <div>
                <p className="sp-task__name">{user.full_name}</p>
                <p className="sp-task__sub">{user.email}</p>
                <div className="sp-row" style={{ marginTop: 'var(--sp-2)' }}>
                  <Badge tone={statusTone(user.status)} size="sm">
                    {labelFor({}, user.status)}
                  </Badge>
                  <Badge tone={user.email_verified ? 'success' : 'warning'} size="sm">
                    {user.email_verified ? 'Email verified' : 'Email unverified'}
                  </Badge>
                </div>
              </div>
            </div>
            <form className="sp-stack" onSubmit={saveProfile} noValidate>
              <Input
                label="Full name"
                required
                value={profileForm.full_name}
                error={fieldErrors.full_name}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    full_name: event.target.value,
                  }))
                }
              />
              <Input
                label="Profile image URL"
                value={profileForm.avatar_url}
                error={fieldErrors.avatar_url}
                hint="Optional. Leave empty to use your initials."
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    avatar_url: event.target.value,
                  }))
                }
              />
              <div className="sp-set__grid">
                <Select
                  label="Time zone"
                  options={TIMEZONES}
                  value={profileForm.timezone}
                  error={fieldErrors.timezone}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      timezone: event.target.value,
                    }))
                  }
                  hint="Used for dashboard dates and reminders"
                />
                <Select
                  label="Language"
                  options={LANGUAGES}
                  value={profileForm.language}
                  error={fieldErrors.language}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      language: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="sp-page__actions">
                <Button variant="primary" type="submit" loading={savingProfile}>
                  Save profile
                </Button>
              </div>
            </form>
          </Card>

          <Card
            title="Study preferences"
            subtitle="These values drive the dashboard target ring, the focus timer defaults and the plan generator"
          >
            <form className="sp-stack" onSubmit={savePreferences} noValidate>
              <div className="sp-set__grid">
                <Input
                  type="number"
                  label="Daily study target (minutes)"
                  min={15}
                  max={1440}
                  required
                  value={prefsForm.daily_target_minutes}
                  error={fieldErrors.daily_target_minutes}
                  hint={formatMinutes(Number(prefsForm.daily_target_minutes) || 0)}
                  onChange={(event) =>
                    setPrefsForm((current) => ({
                      ...current,
                      daily_target_minutes: event.target.value,
                    }))
                  }
                />
                <Input
                  type="number"
                  label="Weekly study target (minutes)"
                  min={30}
                  max={10080}
                  required
                  value={prefsForm.weekly_target_minutes}
                  error={fieldErrors.weekly_target_minutes}
                  hint={formatMinutes(Number(prefsForm.weekly_target_minutes) || 0)}
                  onChange={(event) =>
                    setPrefsForm((current) => ({
                      ...current,
                      weekly_target_minutes: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="sp-grid sp-grid--3">
                <Input
                  type="number"
                  label="Focus length"
                  min={5}
                  max={180}
                  value={prefsForm.focus_duration_minutes}
                  error={fieldErrors.focus_duration_minutes}
                  suffix="min"
                  onChange={(event) =>
                    setPrefsForm((current) => ({
                      ...current,
                      focus_duration_minutes: event.target.value,
                    }))
                  }
                />
                <Input
                  type="number"
                  label="Short break"
                  min={0}
                  max={60}
                  value={prefsForm.short_break_minutes}
                  error={fieldErrors.short_break_minutes}
                  suffix="min"
                  onChange={(event) =>
                    setPrefsForm((current) => ({
                      ...current,
                      short_break_minutes: event.target.value,
                    }))
                  }
                />
                <Input
                  type="number"
                  label="Long break"
                  min={0}
                  max={120}
                  value={prefsForm.long_break_minutes}
                  error={fieldErrors.long_break_minutes}
                  suffix="min"
                  onChange={(event) =>
                    setPrefsForm((current) => ({
                      ...current,
                      long_break_minutes: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <h4 style={{ marginBottom: 'var(--sp-1)' }}>Study availability</h4>
                <p className="sp-muted" style={{ fontSize: 'var(--fs-xs)' }}>
                  The generator only schedules inside these windows.{' '}
                  {weeklyFromAvailability > 0
                    ? `Currently ${formatMinutes(weeklyFromAvailability)} free per week.`
                    : 'With no windows set, the planner falls back to weekday evenings and weekend blocks.'}
                </p>
                {fieldErrors.availability ? (
                  <p className="sp-mat__error" role="alert">
                    {fieldErrors.availability}
                  </p>
                ) : null}
                <div style={{ marginTop: 'var(--sp-3)' }}>
                  {WEEKDAYS.map((day) => {
                    const windows = availability[day.key] || [];
                    return (
                      <div className="sp-avail__day" key={day.key}>
                        <span className="sp-avail__name">{day.label}</span>
                        <div className="sp-avail__windows">
                          {windows.length === 0 ? (
                            <span className="sp-avail__empty">Not available</span>
                          ) : (
                            windows.map((window, index) => (
                              // eslint-disable-next-line react/no-array-index-key
                              <div className="sp-avail__window" key={`${day.key}-${index}`}>
                                <label className="sp-visually-hidden" htmlFor={`${day.key}-start-${index}`}>
                                  {day.label} window {index + 1} start
                                </label>
                                <input
                                  id={`${day.key}-start-${index}`}
                                  type="time"
                                  value={window.start || ''}
                                  onChange={(event) =>
                                    updateWindow(day.key, index, 'start', event.target.value)
                                  }
                                />
                                <span aria-hidden="true">–</span>
                                <label className="sp-visually-hidden" htmlFor={`${day.key}-end-${index}`}>
                                  {day.label} window {index + 1} end
                                </label>
                                <input
                                  id={`${day.key}-end-${index}`}
                                  type="time"
                                  value={window.end || ''}
                                  onChange={(event) =>
                                    updateWindow(day.key, index, 'end', event.target.value)
                                  }
                                />
                                <IconButton
                                  icon="trash"
                                  size="sm"
                                  label={`Remove ${day.label} window ${index + 1}`}
                                  onClick={() => removeWindow(day.key, index)}
                                />
                              </div>
                            ))
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          iconLeft="plus"
                          onClick={() => addWindow(day.key)}
                        >
                          Add
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="sp-page__actions">
                <Button variant="primary" type="submit" loading={savingPrefs}>
                  Save preferences
                </Button>
              </div>
            </form>
          </Card>
        </div>

        <div className="sp-set__col">
          <Card title="Notifications" subtitle="Turn optional reminders on or off">
            <div className="sp-set__prefs">
              {NOTIFICATION_PREFS.map((pref) => (
                <Checkbox
                  key={pref.key}
                  label={pref.label}
                  checked={notificationPrefs[pref.key] !== false}
                  onChange={(event) =>
                    setNotificationPrefs((current) => ({
                      ...current,
                      [pref.key]: event.target.checked,
                    }))
                  }
                />
              ))}
              <p className="sp-muted" style={{ fontSize: 'var(--fs-xs)' }}>
                Saved with your study preferences.
              </p>
            </div>
          </Card>

          <Card title="Accessibility" subtitle="Display preferences stored with your account">
            <div className="sp-set__prefs">
              {ACCESSIBILITY_PREFS.map((pref) => (
                <Checkbox
                  key={pref.key}
                  label={pref.label}
                  checked={Boolean(accessibilityPrefs[pref.key])}
                  onChange={(event) =>
                    setAccessibilityPrefs((current) => ({
                      ...current,
                      [pref.key]: event.target.checked,
                    }))
                  }
                />
              ))}
            </div>
          </Card>

          <Card title="Change password" subtitle="You will stay signed in on this device">
            <form className="sp-stack" onSubmit={changePassword} noValidate>
              <Input
                type="password"
                label="Current password"
                required
                autoComplete="current-password"
                value={passwordForm.current_password}
                error={fieldErrors.current_password}
                onChange={(event) =>
                  setPasswordForm((current) => ({
                    ...current,
                    current_password: event.target.value,
                  }))
                }
              />
              <Input
                type="password"
                label="New password"
                required
                autoComplete="new-password"
                value={passwordForm.new_password}
                error={fieldErrors.new_password}
                hint="At least 8 characters with a mix of letters and numbers"
                onChange={(event) =>
                  setPasswordForm((current) => ({
                    ...current,
                    new_password: event.target.value,
                  }))
                }
              />
              <Input
                type="password"
                label="Confirm new password"
                required
                autoComplete="new-password"
                value={passwordForm.confirm_password}
                error={fieldErrors.confirm_password}
                onChange={(event) =>
                  setPasswordForm((current) => ({
                    ...current,
                    confirm_password: event.target.value,
                  }))
                }
              />
              <div className="sp-page__actions">
                <Button variant="primary" type="submit" loading={savingPassword}>
                  Change password
                </Button>
              </div>
            </form>
          </Card>

          <Card title="Account">
            <dl className="sp-deflist">
              <dt>Email</dt>
              <dd>{user.email}</dd>
              <dt>Role</dt>
              <dd>{labelFor({}, user.role)}</dd>
              <dt>Member since</dt>
              <dd>{formatDateTime(user.created_at)}</dd>
              <dt>Last sign-in</dt>
              <dd>{user.last_login_at ? formatDateTime(user.last_login_at) : '—'}</dd>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
