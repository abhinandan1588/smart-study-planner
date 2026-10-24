import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import Checkbox from '../../../components/ui/Checkbox';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import Dialog from '../../../components/ui/Dialog';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import Input from '../../../components/ui/Input';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import Tabs, { TabPanel } from '../../../components/ui/Tabs';
import { useToast } from '../../../components/ui/ToastProvider';
import useApi from '../../../hooks/useApi';
import useAuth from '../../../hooks/useAuth';
import { adminApi } from '../../../services/adminApi';
import { formatDateTime } from '../../../utils/date';
import { formatBytes, formatNumber, titleCase } from '../../../utils/format';
import {
  ACCOUNT_STATUS_LABELS,
  COURSE_CATEGORY_LABELS,
  NOTIFICATION_TYPE_LABELS,
  RESOURCE_TYPE_LABELS,
  labelFor,
  statusTone,
} from '../../../utils/constants';
import AuditLogTable from '../components/AuditLogTable';
import '../admin.css';

/**
 * Administrator profile and platform settings (PRD 4.10) —
 * `GET|PATCH /api/v1/admin/profile`, `POST /admin/profile/password`,
 * `GET|PATCH /admin/settings`, `GET|POST /admin/admins`,
 * `PATCH /admin/admins/:id`, `POST /admin/admins/:id/password-reset`,
 * `POST /admin/admins/:id/resend-verification`, `GET /admin/health`, and the
 * audit trail from `GET /admin/audit-logs`.
 */

const CATEGORY_KEYS = Object.keys(COURSE_CATEGORY_LABELS);
const RESOURCE_KEYS = Object.keys(RESOURCE_TYPE_LABELS);
const NOTIFICATION_KEYS = Object.keys(NOTIFICATION_TYPE_LABELS);

export default function AdminSettingsPage() {
  const [tab, setTab] = useState('profile');

  return (
    <div className="sp-page">
      <PageHeader
        title="Profile & Settings"
        description="Your administrator account, platform-wide defaults, other administrators, service health and the audit trail."
      />

      <Tabs
        items={[
          { key: 'profile', label: 'Profile' },
          { key: 'platform', label: 'Platform settings' },
          { key: 'admins', label: 'Administrators' },
          { key: 'health', label: 'Service health' },
          { key: 'audit', label: 'Audit logs' },
        ]}
        active={tab}
        onChange={setTab}
        ariaLabel="Settings sections"
      />

      <TabPanel tabKey="profile" active={tab}>
        <ProfileSection />
      </TabPanel>
      <TabPanel tabKey="platform" active={tab}>
        <PlatformSection />
      </TabPanel>
      <TabPanel tabKey="admins" active={tab}>
        <AdminsSection />
      </TabPanel>
      <TabPanel tabKey="health" active={tab}>
        <HealthSection />
      </TabPanel>
      <TabPanel tabKey="audit" active={tab}>
        <AuditLogTable perPage={20} compact />
      </TabPanel>
    </div>
  );
}

/* --- profile + password ------------------------------------------------- */

function ProfileSection() {
  const toast = useToast();
  const { refreshUser } = useAuth();
  const fetchProfile = useCallback(() => adminApi.profile.get(), []);
  const { data, error, loading, reload } = useApi(fetchProfile);

  const [form, setForm] = useState({
    full_name: '',
    avatar_url: '',
    timezone: '',
    language: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [passwords, setPasswords] = useState({
    current_password: '',
    new_password: '',
    confirm: '',
  });
  const [pwErrors, setPwErrors] = useState({});
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    if (!data?.user) return;
    setForm({
      full_name: data.user.full_name || '',
      avatar_url: data.user.avatar_url || '',
      timezone: data.user.timezone || '',
      language: data.user.language || '',
    });
  }, [data]);

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    setFieldErrors({});
    try {
      await adminApi.profile.update({
        full_name: form.full_name.trim(),
        avatar_url: form.avatar_url.trim(),
        timezone: form.timezone.trim(),
        language: form.language.trim(),
      });
      toast.success('Profile saved');
      await reload();
      await refreshUser?.();
    } catch (caught) {
      setFieldErrors(caught.fields || {});
      if (!caught.fields) toast.apiError(caught, 'Could not save the profile');
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setPwErrors({});
    if (passwords.new_password !== passwords.confirm) {
      setPwErrors({ confirm: 'The two passwords do not match.' });
      return;
    }
    setChanging(true);
    try {
      await adminApi.profile.changePassword(
        passwords.current_password,
        passwords.new_password,
      );
      toast.success('Password changed');
      setPasswords({ current_password: '', new_password: '', confirm: '' });
    } catch (caught) {
      setPwErrors(caught.fields || {});
      if (!caught.fields) toast.apiError(caught, 'Could not change the password');
    } finally {
      setChanging(false);
    }
  }

  if (error) return <ErrorState error={error} onRetry={reload} boxed />;
  if (loading && !data) return <SkeletonCard lines={5} />;
  if (!data?.user) return null;

  return (
    <div className="sp-adm__split--even sp-adm__split">
      <Card title="Administrator profile" subtitle={data.user.email}>
        <form className="sp-stack" onSubmit={saveProfile} noValidate>
          <Input
            label="Full name"
            required
            value={form.full_name}
            error={fieldErrors.full_name}
            maxLength={120}
            onChange={(event) =>
              setForm((current) => ({ ...current, full_name: event.target.value }))
            }
          />
          <Input
            label="Avatar URL"
            type="url"
            value={form.avatar_url}
            error={fieldErrors.avatar_url}
            maxLength={500}
            onChange={(event) =>
              setForm((current) => ({ ...current, avatar_url: event.target.value }))
            }
          />
          <div className="sp-adm__filters">
            <Input
              label="Time zone"
              value={form.timezone}
              error={fieldErrors.timezone}
              maxLength={64}
              placeholder="Asia/Kolkata"
              onChange={(event) =>
                setForm((current) => ({ ...current, timezone: event.target.value }))
              }
            />
            <Input
              label="Language"
              value={form.language}
              error={fieldErrors.language}
              maxLength={10}
              placeholder="en"
              onChange={(event) =>
                setForm((current) => ({ ...current, language: event.target.value }))
              }
            />
          </div>
          <dl className="sp-adm__dl">
            <div>
              <span className="sp-adm__dt">Role</span>
              <dd className="sp-adm__dd">{titleCase(data.user.role)}</dd>
            </div>
            <div>
              <span className="sp-adm__dt">Last login</span>
              <dd className="sp-adm__dd">
                {data.user.last_login_at
                  ? formatDateTime(data.user.last_login_at)
                  : 'Never'}
              </dd>
            </div>
          </dl>
          <div>
            <Button variant="primary" type="submit" loading={saving}>
              Save profile
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Change password" subtitle="You will stay signed in on this device">
        <form className="sp-stack" onSubmit={changePassword} noValidate>
          <Input
            label="Current password"
            type="password"
            required
            autoComplete="current-password"
            value={passwords.current_password}
            error={pwErrors.current_password}
            onChange={(event) =>
              setPasswords((current) => ({
                ...current,
                current_password: event.target.value,
              }))
            }
          />
          <Input
            label="New password"
            type="password"
            required
            autoComplete="new-password"
            value={passwords.new_password}
            error={pwErrors.new_password}
            hint="At least 8 characters, with a letter and a number."
            onChange={(event) =>
              setPasswords((current) => ({
                ...current,
                new_password: event.target.value,
              }))
            }
          />
          <Input
            label="Confirm new password"
            type="password"
            required
            autoComplete="new-password"
            value={passwords.confirm}
            error={pwErrors.confirm}
            onChange={(event) =>
              setPasswords((current) => ({ ...current, confirm: event.target.value }))
            }
          />
          <div>
            <Button variant="primary" type="submit" loading={changing}>
              Change password
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

/* --- platform settings -------------------------------------------------- */

function PlatformSection() {
  const toast = useToast();
  const fetchSettings = useCallback(() => adminApi.settings.get(), []);
  const { data, error, loading, reload } = useApi(fetchSettings);

  const [categories, setCategories] = useState([]);
  const [resourceTypes, setResourceTypes] = useState([]);
  const [notifications, setNotifications] = useState({});
  const [maxUpload, setMaxUpload] = useState('20');
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data?.settings) return;
    setCategories(data.settings.course_categories?.value || CATEGORY_KEYS);
    setResourceTypes(data.settings.allowed_resource_types?.value || RESOURCE_KEYS);
    setNotifications(data.settings.notification_defaults?.value || {});
    setMaxUpload(
      String(data.settings.max_upload_mb?.value ?? data.runtime?.max_upload_mb ?? 20),
    );
  }, [data]);

  function toggle(list, setList, value) {
    setList(
      list.includes(value) ? list.filter((item) => item !== value) : [...list, value],
    );
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setFieldErrors({});
    try {
      await adminApi.settings.update({
        settings: {
          course_categories: categories,
          allowed_resource_types: resourceTypes,
          notification_defaults: notifications,
          max_upload_mb: Number(maxUpload),
        },
      });
      toast.success('Platform settings saved');
      await reload();
    } catch (caught) {
      setFieldErrors(caught.fields || {});
      if (!caught.fields) toast.apiError(caught, 'Could not save the settings');
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorState error={error} onRetry={reload} boxed />;
  if (loading && !data) return <SkeletonCard lines={6} />;
  if (!data) return null;

  return (
    <form className="sp-stack" onSubmit={save} noValidate>
      {fieldErrors.settings ? (
        <p className="sp-adm__error" role="alert">
          {fieldErrors.settings}
        </p>
      ) : null}

      <Card
        title="Course categories"
        subtitle={data.settings.course_categories?.description}
      >
        {fieldErrors.course_categories ? (
          <p className="sp-adm__error" role="alert">
            {fieldErrors.course_categories}
          </p>
        ) : null}
        <div className="sp-adm__filters">
          {CATEGORY_KEYS.map((key) => (
            <Checkbox
              key={key}
              label={labelFor(COURSE_CATEGORY_LABELS, key)}
              checked={categories.includes(key)}
              onChange={() => toggle(categories, setCategories, key)}
            />
          ))}
        </div>
      </Card>

      <Card
        title="Allowed resource types"
        subtitle={data.settings.allowed_resource_types?.description}
      >
        {fieldErrors.allowed_resource_types ? (
          <p className="sp-adm__error" role="alert">
            {fieldErrors.allowed_resource_types}
          </p>
        ) : null}
        <div className="sp-adm__filters">
          {RESOURCE_KEYS.map((key) => (
            <Checkbox
              key={key}
              label={labelFor(RESOURCE_TYPE_LABELS, key)}
              checked={resourceTypes.includes(key)}
              onChange={() => toggle(resourceTypes, setResourceTypes, key)}
            />
          ))}
        </div>
      </Card>

      <Card
        title="Notification defaults"
        subtitle={data.settings.notification_defaults?.description}
      >
        {fieldErrors.notification_defaults ? (
          <p className="sp-adm__error" role="alert">
            {fieldErrors.notification_defaults}
          </p>
        ) : null}
        <div className="sp-adm__filters">
          {NOTIFICATION_KEYS.map((key) => (
            <Checkbox
              key={key}
              label={labelFor(NOTIFICATION_TYPE_LABELS, key)}
              checked={Boolean(notifications[key])}
              onChange={(event) =>
                setNotifications((current) => ({
                  ...current,
                  [key]: event.target.checked,
                }))
              }
            />
          ))}
        </div>
      </Card>

      <Card title="Uploads" subtitle={data.settings.max_upload_mb?.description}>
        <div className="sp-adm__filters">
          <Input
            label="Maximum upload size (MB)"
            type="number"
            min="1"
            max="200"
            value={maxUpload}
            error={fieldErrors.max_upload_mb}
            onChange={(event) => setMaxUpload(event.target.value)}
          />
          <div>
            <span className="sp-adm__dt">Extensions accepted at runtime</span>
            <p className="sp-adm__dd">
              {(data.runtime?.allowed_upload_extensions || []).join(', ') || '—'}
            </p>
          </div>
        </div>
        <p className="sp-adm__note" style={{ marginTop: 'var(--sp-3)' }}>
          The running process enforces{' '}
          <strong>{data.runtime?.max_upload_mb} MB</strong> until it is restarted
          with the new value.
        </p>
      </Card>

      <div>
        <Button variant="primary" type="submit" loading={saving}>
          Save platform settings
        </Button>
      </div>
    </form>
  );
}

/* --- administrator accounts --------------------------------------------- */

function AdminsSection() {
  const toast = useToast();
  const { user } = useAuth();
  const fetchAdmins = useCallback(() => adminApi.admins.list({ per_page: 50 }), []);
  const { data, error, loading, reload } = useApi(fetchAdmins);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);

  async function create(event) {
    event.preventDefault();
    setBusy(true);
    setFieldErrors({});
    setFormError(null);
    try {
      await adminApi.admins.create({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      toast.success('Administrator created');
      setCreateOpen(false);
      setForm({ full_name: '', email: '', password: '' });
      await reload();
    } catch (caught) {
      setFieldErrors(caught.fields || {});
      if (!caught.fields) setFormError(caught.message);
    } finally {
      setBusy(false);
    }
  }

  async function applyStatus() {
    if (!statusTarget) return;
    setBusy(true);
    try {
      await adminApi.admins.update(statusTarget.admin.id, {
        status: statusTarget.next,
      });
      toast.success('Administrator updated');
      setStatusTarget(null);
      await reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not change the account status');
    } finally {
      setBusy(false);
    }
  }

  async function issueReset(admin) {
    try {
      const result = await adminApi.admins.issuePasswordReset(admin.id);
      toast.success('Recovery token issued', result.message);
    } catch (caught) {
      toast.apiError(caught, 'Could not issue a recovery token');
    }
  }

  if (error) return <ErrorState error={error} onRetry={reload} boxed />;
  if (loading && !data) return <SkeletonCard lines={5} />;

  const admins = data?.items || [];

  return (
    <>
      <Card
        title="Administrator accounts"
        subtitle="At least one active administrator must always remain"
        actions={
          <Button size="sm" variant="primary" iconLeft="plus" onClick={() => setCreateOpen(true)}>
            New administrator
          </Button>
        }
      >
        {admins.length ? (
          <ul className="sp-adm__list">
            {admins.map((admin) => {
              const isSelf = admin.id === user?.id;
              return (
                <li key={admin.id}>
                  <span className="sp-adm__primary">
                    <span className="sp-adm__itemtitle">
                      {admin.full_name}
                      {isSelf ? ' (you)' : ''}
                    </span>
                    <span className="sp-adm__itemmeta">
                      {admin.email} · last login{' '}
                      {admin.last_login_at
                        ? formatDateTime(admin.last_login_at)
                        : 'never'}
                    </span>
                  </span>
                  <span className="sp-adm__rowactions">
                    <Badge tone={statusTone(admin.status)} size="sm" dot>
                      {labelFor(ACCOUNT_STATUS_LABELS, admin.status)}
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={() => issueReset(admin)}>
                      Recovery token
                    </Button>
                    {isSelf ? null : admin.status === 'active' ? (
                      <Button
                        size="sm"
                        variant="danger"
                        className="sp-adm__dangerbtn"
                        onClick={() =>
                          setStatusTarget({ admin, next: 'suspended' })
                        }
                      >
                        Suspend
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setStatusTarget({ admin, next: 'active' })}
                      >
                        Activate
                      </Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon="shield"
            title="No administrator accounts listed"
            description="Create another administrator through the authorised workflow."
            compact
          />
        )}
      </Card>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New administrator"
        description="The account is created active and email-verified, and the action is audited."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="sp-admin-form" loading={busy}>
              Create administrator
            </Button>
          </>
        }
      >
        <form id="sp-admin-form" className="sp-stack" onSubmit={create} noValidate>
          {formError ? (
            <p className="sp-adm__error" role="alert">
              {formError}
            </p>
          ) : null}
          <Input
            label="Full name"
            required
            value={form.full_name}
            error={fieldErrors.full_name}
            maxLength={120}
            onChange={(event) =>
              setForm((current) => ({ ...current, full_name: event.target.value }))
            }
          />
          <Input
            label="Email"
            type="email"
            required
            value={form.email}
            error={fieldErrors.email}
            onChange={(event) =>
              setForm((current) => ({ ...current, email: event.target.value }))
            }
          />
          <Input
            label="Temporary password"
            type="password"
            required
            autoComplete="new-password"
            value={form.password}
            error={fieldErrors.password}
            hint="At least 8 characters, with a letter and a number."
            onChange={(event) =>
              setForm((current) => ({ ...current, password: event.target.value }))
            }
          />
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(statusTarget)}
        title={
          statusTarget?.next === 'suspended'
            ? 'Suspend this administrator?'
            : 'Activate this administrator?'
        }
        message={
          statusTarget
            ? statusTarget.next === 'suspended'
              ? `${statusTarget.admin.full_name} loses administrative access immediately. The request is refused if they are the last active administrator.`
              : `${statusTarget.admin.full_name} regains administrative access.`
            : ''
        }
        confirmLabel={statusTarget?.next === 'suspended' ? 'Suspend' : 'Activate'}
        tone={statusTarget?.next === 'suspended' ? 'danger' : 'primary'}
        loading={busy}
        onConfirm={applyStatus}
        onClose={() => setStatusTarget(null)}
      />
    </>
  );
}

/* --- service health ----------------------------------------------------- */

function HealthSection() {
  const fetchHealth = useCallback(() => adminApi.health(), []);
  const { data, error, loading, reload } = useApi(fetchHealth);

  if (error) return <ErrorState error={error} onRetry={reload} boxed />;
  if (loading && !data) return <SkeletonCard lines={4} />;
  if (!data) return null;

  return (
    <Card
      title="Service health"
      subtitle="Database, storage and AI provider status"
      actions={
        <Button size="sm" variant="secondary" iconLeft="refresh" onClick={reload}>
          Refresh
        </Button>
      }
    >
      <dl className="sp-adm__dl">
        <div>
          <span className="sp-adm__dt">Database</span>
          <dd className="sp-adm__dd">
            <Badge tone={data.db === 'ok' ? 'success' : 'danger'} dot>
              {data.db}
            </Badge>
          </dd>
        </div>
        <div>
          <span className="sp-adm__dt">AI provider</span>
          <dd className="sp-adm__dd">
            <Badge tone={data.ai_provider === 'configured' ? 'success' : 'neutral'} dot>
              {data.ai_provider}
            </Badge>
          </dd>
        </div>
        <div>
          <span className="sp-adm__dt">Environment</span>
          <dd className="sp-adm__dd">{data.environment}</dd>
        </div>
        <div>
          <span className="sp-adm__dt">Stored files</span>
          <dd className="sp-adm__dd">
            {formatNumber(data.storage?.file_count)} files ·{' '}
            {formatBytes(data.storage?.total_bytes)}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
