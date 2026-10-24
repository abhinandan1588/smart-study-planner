import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../../components/layout/AuthLayout';
import Button from '../../../components/ui/Button';
import Checkbox from '../../../components/ui/Checkbox';
import Input from '../../../components/ui/Input';
import AuthAlert from '../components/AuthAlert';
import DevTokenNotice from '../components/DevTokenNotice';
import PasswordStrength from '../components/PasswordStrength';
import { useAuth } from '../../../context/AuthContext';
import {
  PASSWORD_MIN_LENGTH,
  runValidators,
  validateEmail,
  validateFullName,
  validateMatch,
  validatePassword,
} from '../../../utils/validation';

/**
 * Registration always creates a student: the backend forces `role='student'`
 * and ignores any role field, so this form cannot produce an administrator.
 */
export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [values, setValues] = useState({
    full_name: '',
    email: '',
    password: '',
    confirm: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function onChange(field) {
    return (event) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
      setErrors((current) => ({ ...current, [field]: undefined }));
    };
  }

  async function onSubmit(event) {
    event.preventDefault();
    setFormError(null);

    const { errors: nextErrors, isValid } = runValidators(values, {
      full_name: validateFullName,
      email: validateEmail,
      password: validatePassword,
      confirm: (value, all) => validateMatch(value, all.password),
    });
    setErrors(nextErrors);
    if (!isValid) return;

    setSubmitting(true);
    try {
      const payload = await register({
        full_name: values.full_name.trim(),
        email: values.email.trim(),
        password: values.password,
      });
      setResult(payload);
    } catch (error) {
      setErrors(error.fields || {});
      setFormError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle={result.message || 'Verify your email address to activate the account.'}
      >
        <div className="sp-auth__form">
          <AuthAlert tone="success">
            Account created for <strong>{result.user?.email}</strong>. The account
            status is {result.user?.status?.replace('_', ' ') || 'pending verification'}.
          </AuthAlert>

          <DevTokenNotice
            token={result.verification_token}
            label="verification token"
            actionLabel="Verify now"
            onUse={(token) =>
              navigate('/verify-email', {
                state: { token, email: result.user?.email },
              })
            }
          />

          <Button variant="primary" fullWidth to="/verify-email">
            Go to email verification
          </Button>
          <p className="sp-auth__switch">
            Already verified? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set up a student account to organise courses, syllabus progress and study time."
      wide
    >
      <form className="sp-auth__form" onSubmit={onSubmit} noValidate>
        <AuthAlert tone="error">{formError}</AuthAlert>

        <Input
          label="Full name"
          name="full_name"
          autoComplete="name"
          placeholder="Aarav Sharma"
          value={values.full_name}
          onChange={onChange('full_name')}
          error={errors.full_name}
          required
        />

        <Input
          label="Email address"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={values.email}
          onChange={onChange('email')}
          error={errors.email}
          hint="Used for sign-in, verification and study reminders."
          required
        />

        <div>
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            name="password"
            autoComplete="new-password"
            value={values.password}
            onChange={onChange('password')}
            error={errors.password}
            hint={`At least ${PASSWORD_MIN_LENGTH} characters, including a letter and a number.`}
            required
          />
          <PasswordStrength value={values.password} />
        </div>

        <Input
          label="Confirm password"
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
          Create account
        </Button>

        <p className="sp-auth__switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
