import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../../../components/layout/AuthLayout';
import Button from '../../../components/ui/Button';
import Checkbox from '../../../components/ui/Checkbox';
import Input from '../../../components/ui/Input';
import AuthAlert from '../components/AuthAlert';
import { homeForRole, useAuth } from '../../../context/AuthContext';
import { runValidators, validateEmail, requiredField } from '../../../utils/validation';

export default function LoginPage() {
  const { login, sessionMessage, clearSessionMessage } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [values, setValues] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [notice, setNotice] = useState(location.state?.notice || null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (sessionMessage) {
      setFormError(sessionMessage);
      clearSessionMessage();
    }
  }, [sessionMessage, clearSessionMessage]);

  function onChange(field) {
    return (event) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
      setErrors((current) => ({ ...current, [field]: undefined }));
    };
  }

  async function onSubmit(event) {
    event.preventDefault();
    setFormError(null);
    setNotice(null);

    const { errors: nextErrors, isValid } = runValidators(values, {
      email: validateEmail,
      password: (value) => requiredField(value, 'Enter your password.'),
    });
    setErrors(nextErrors);
    if (!isValid) return;

    setSubmitting(true);
    try {
      const user = await login(values.email.trim(), values.password);
      const target = location.state?.from?.pathname;
      navigate(target && target !== '/' ? target : homeForRole(user?.role), {
        replace: true,
      });
    } catch (error) {
      if (error.code === 'EMAIL_NOT_VERIFIED') {
        navigate('/verify-email', {
          state: { email: values.email.trim(), notice: error.message },
        });
        return;
      }
      setErrors(error.fields || {});
      setFormError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Pick up where you left off in your study plan."
      footer={
        <span>
          Smart Study Planner · Students and administrators use the same sign-in.
        </span>
      }
    >
      <form className="sp-auth__form" onSubmit={onSubmit} noValidate>
        <AuthAlert tone="info">{notice}</AuthAlert>
        <AuthAlert tone="error">{formError}</AuthAlert>

        <Input
          label="Email address"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={values.email}
          onChange={onChange('email')}
          error={errors.email}
          required
        />

        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          name="password"
          autoComplete="current-password"
          placeholder="Your password"
          value={values.password}
          onChange={onChange('password')}
          error={errors.password}
          required
          labelAction={
            <Link to="/forgot-password" className="sp-auth__link">
              Forgot password?
            </Link>
          }
        />

        <div className="sp-auth__meta">
          <Checkbox
            label="Show password"
            checked={showPassword}
            onChange={(event) => setShowPassword(event.target.checked)}
          />
          <Link to="/verify-email">Verify email</Link>
        </div>

        <Button type="submit" variant="primary" loading={submitting} fullWidth>
          Sign in
        </Button>

        <p className="sp-auth__switch">
          New here? <Link to="/register">Create a student account</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
