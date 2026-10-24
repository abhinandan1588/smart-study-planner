import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../../components/layout/AuthLayout';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import AuthAlert from '../components/AuthAlert';
import DevTokenNotice from '../components/DevTokenNotice';
import { authApi } from '../../../services/authApi';
import { validateEmail } from '../../../utils/validation';

/**
 * The backend answers with a generic message whether or not the account
 * exists, so nothing here confirms an email address. In dev mode it also
 * returns the reset token, which this page hands to the reset form.
 */
export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [resetToken, setResetToken] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    const emailError = validateEmail(email);
    setFieldError(emailError);
    if (emailError) return;

    setSubmitting(true);
    setError(null);
    try {
      const payload = await authApi.forgotPassword(email.trim());
      setMessage(payload.message);
      setResetToken(payload.reset_token || null);
    } catch (caught) {
      setFieldError(caught.fields?.email || null);
      setError(caught.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We will issue a recovery token for your account."
      wide
    >
      <form className="sp-auth__form" onSubmit={onSubmit} noValidate>
        <AuthAlert tone="success">{message}</AuthAlert>
        <AuthAlert tone="error">{error}</AuthAlert>

        <Input
          label="Email address"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setFieldError(null);
          }}
          error={fieldError}
          placeholder="you@example.com"
          required
        />

        <Button type="submit" variant="primary" loading={submitting} fullWidth>
          Send recovery token
        </Button>

        <DevTokenNotice
          token={resetToken}
          label="reset token"
          actionLabel="Set a new password"
          onUse={(token) => navigate('/reset-password', { state: { token } })}
        />

        <p className="sp-auth__switch">
          Have a token already? <Link to="/reset-password">Set a new password</Link>
        </p>
        <p className="sp-auth__switch">
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
