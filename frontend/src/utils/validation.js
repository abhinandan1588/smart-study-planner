/**
 * Client-side form validation. The backend validates everything again — this
 * only gives immediate feedback and mirrors the backend's password policy
 * (minimum 8 characters, PASSWORD_MIN_LENGTH in backend/config.py).
 */

export const PASSWORD_MIN_LENGTH = 8;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function requiredField(value, message = 'This field is required.') {
  if (value === null || value === undefined) return message;
  if (typeof value === 'string' && value.trim() === '') return message;
  return null;
}

export function validateEmail(value) {
  const missing = requiredField(value, 'Enter your email address.');
  if (missing) return missing;
  if (!EMAIL_RE.test(String(value).trim())) {
    return 'Enter a valid email address.';
  }
  return null;
}

export function validatePassword(value, { field = 'password' } = {}) {
  const missing = requiredField(value, 'Enter a password.');
  if (missing) return missing;
  const password = String(value);
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Include at least one letter and one number.';
  }
  if (field === 'new_password' && password.length > 128) {
    return 'Use 128 characters or fewer.';
  }
  return null;
}

export function validateFullName(value) {
  const missing = requiredField(value, 'Enter your full name.');
  if (missing) return missing;
  const name = String(value).trim();
  if (name.length < 2) return 'Use at least 2 characters.';
  if (name.length > 120) return 'Use 120 characters or fewer.';
  return null;
}

export function validateMatch(value, other, message = 'The passwords do not match.') {
  if (!value) return 'Confirm the password.';
  return value === other ? null : message;
}

export function passwordStrength(value) {
  const password = String(value || '');
  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Strong'];
  return { score, label: labels[score] };
}

/** Run a map of `{ field: validatorFn }` and return `{ errors, isValid }`. */
export function runValidators(values, validators) {
  const errors = {};
  Object.entries(validators).forEach(([field, validator]) => {
    const error = validator(values[field], values);
    if (error) errors[field] = error;
  });
  return { errors, isValid: Object.keys(errors).length === 0 };
}
