import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../../../components/layout/AuthLayout';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import AuthAlert from '../components/AuthAlert';
import DevTokenNotice from '../components/DevTokenNotice';
import { authApi } from '../../../services/authApi';
import { validateEmail } from '../../../utils/validation';

/**
 * Verifies an account from a token. The token arrives either in the URL
 * (`/verify-email?token=…`), from the registration response in dev mode, or
 * pasted by hand.
 */
export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [token, setToken] = useState(
    searchParams.get('token') || location.state?.token || '',
  );
  const [email, setEmail] = useState(location.state?.email || '');
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState(location.state?.notice || null);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resentToken, setResentToken] = useState(null);
  const [autoRan, setAutoRan] = useState(false);

  async function verify(nextToken) {
    const value = (nextToken ?? token).trim();
    if (!value) {
      setFieldErrors({ token: 'Paste the verification token.' });
      return;
    }
    setVerifying(true);
    setError(null);
    setFieldErrors({});
    try {
      const payload = await authApi.verifyEmail(value);
      setVerified(true);
      setMessage(payload.message);
    } catch (caught) {
      setFieldErrors(caught.fields || {});
      setError(caught.message);
    } finally {
      setVerifying(false);
    }
  }

  // A token in the query string verifies on arrival.
  useEffect(() => {
    const queryToken = searchParams.get('token');
    if (queryToken && !autoRan) {
      setAutoRan(true);
      verify(queryToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, autoRan]);

  async function onResend(event) {
    event.preventDefault();
    const emailError = validateEmail(email);
    if (emailError) {
      setFieldErrors({ email: emailError });
      return;
    }
    setResending(true);
    setError(null);
    setFieldErrors({});
    try {
      const payload = await authApi.resendVerification(email.trim());
      setMessage(payload.message);
      setResentToken(payload.verification_token || null);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setResending(false);
    }
  }

  if (verified) {
    return (
      <AuthLayout title="Email verified" subtitle={message}>
        <div className="sp-auth__form">
          <AuthAlert tone="success">
            Your account is active. Sign in to reach your dashboard.
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
      title="Verify your email"
      subtitle="Enter the verification token issued when you registered."
      wide
    >
      <div className="sp-auth__form">
        <AuthAlert tone="info">{message}</AuthAlert>
        <AuthAlert tone="error">{error}</AuthAlert>

        <form
          className="sp-auth__form"
          onSubmit={(event) => {
            event.preventDefault();
            verify();
          }}
          noValidate
        >
          <Input
            label="Verification token"
            name="token"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            error={fieldErrors.token}
            placeholder="Paste the token from your email"
            required
          />
          <Button type="submit" variant="primary" loading={verifying} fullWidth>
            Verify email
          </Button>
        </form>

        <hr />

        <form className="sp-auth__form" onSubmit={onResend} noValidate>
          <Input
            label="Resend verification"
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={fieldErrors.email}
            placeholder="you@example.com"
            hint="We issue a new token if an unverified account exists for that address."
          />
          <Button type="submit" variant="secondary" loading={resending} fullWidth>
            Send a new token
          </Button>
        </form>

        <DevTokenNotice
          token={resentToken}
          label="verification token"
          actionLabel="Verify with this token"
          onUse={(value) => {
            setToken(value);
            verify(value);
          }}
        />

        <p className="sp-auth__switch">
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
