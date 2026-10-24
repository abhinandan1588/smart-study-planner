import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../../../components/layout/AuthLayout';
import Button from '../../../components/ui/Button';
import Checkbox from '../../../components/ui/Checkbox';
import Input from '../../../components/ui/Input';
import AuthAlert from '../components/AuthAlert';
import PasswordStrength from '../components/PasswordStrength';
import { authApi } from '../../../services/authApi';
import {
  PASSWORD_MIN_LENGTH,
  requiredField,
  runValidators,
  validateMatch,
  validatePassword,
} from '../../../utils/validation';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [values, setValues] = useState({
    token: searchParams.get('token') || location.state?.token || '',
    new_password: '',
    confirm: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);

  function onChange(field) {
    return (event) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
      setErrors((current) => ({ ...current, [field]: undefined }));
    };
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError(null);

    const { errors: nextErrors, isValid } = runValidators(values, {
      token: (value) => requiredField(value, 'Paste the reset token.'),
      new_password: (value) => validatePassword(value, { field: 'new_password' }),
      confirm: (value, all) => validateMatch(value, all.new_password),
    });
    setErrors(nextErrors);
    if (!isValid) return;

    setSubmitting(true);
    try {
      const payload = await authApi.resetPassword(
        values.token.trim(),
        values.new_password,
      );
      setDone(payload.message);
    } catch (caught) {
      setErrors(caught.fields || {});
      setError(caught.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <AuthLayout title="Password updated" subtitle={done}>
        <div className="sp-auth__form">
          <AuthAlert tone="success">
            Your password has been changed. Sign in with the new one.
          </AuthAlert>
          <Button variant="primary" fullWidth onClick={() => navigate('/login')}>
            Continue to sign in
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Set a new password"
      subtitle="Reset tokens expire one hour after they are issued."
      wide
    >
      <form className="sp-auth__form" onSubmit={onSubmit} noValidate>
        <AuthAlert tone="error">{error}</AuthAlert>

        <Input
          label="Reset token"
          name="token"
          value={values.token}
          onChange={onChange('token')}
          error={errors.token}
          placeholder="Paste the token from your email"
          required
        />

        <div>
          <Input
            label="New password"
            type={showPassword ? 'text' : 'password'}
            name="new_password"
            autoComplete="new-password"
            value={values.new_password}
            onChange={onChange('new_password')}
            error={errors.new_password}
            hint={`At least ${PASSWORD_MIN_LENGTH} characters, including a letter and a number.`}
            required
          />
          <PasswordStrength value={values.new_password} />
        </div>

        <Input
          label="Confirm new password"
          type={showPassword ? 'text' : 'password'}
          name="confirm"
          autoComplete="new-password"
          value={values.confirm}
          onChange={onChange('confirm')}
          error={errors.confirm}
          required
        />

        <Checkbox
          label="Show passwords"
          checked={showPassword}
          onChange={(event) => setShowPassword(event.target.checked)}
        />

        <Button type="submit" variant="primary" loading={submitting} fullWidth>
          Update password
        </Button>

        <p className="sp-auth__switch">
          Need a new token? <Link to="/forgot-password">Request one</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
