import { passwordStrength } from '../../../utils/validation';

const COLORS = [
  'var(--c-danger)',
  'var(--c-danger)',
  '#d97706',
  '#d97706',
  'var(--c-success)',
  'var(--c-success)',
];

export default function PasswordStrength({ value }) {
  if (!value) return null;
  const { score, label } = passwordStrength(value);
  return (
    <div className="sp-auth__strength">
      <span className="sp-auth__strengthbar">
        <span
          className="sp-auth__strengthfill"
          style={{
            width: `${(score / 5) * 100}%`,
            background: COLORS[score],
          }}
        />
      </span>
      <span>{label}</span>
    </div>
  );
}
