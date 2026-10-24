import { initials } from '../../utils/format';
import './Avatar.css';

/** size: xs | sm | md | lg — initials fallback when there is no image. */
export default function Avatar({ name, src, size = 'md', className = '', ...rest }) {
  const label = name || 'User';
  return (
    <span
      className={`sp-avatar sp-avatar--${size} ${className}`.trim()}
      title={label}
      {...rest}
    >
      {src ? (
        <img src={src} alt="" className="sp-avatar__img" />
      ) : (
        <span aria-hidden="true">{initials(label)}</span>
      )}
    </span>
  );
}
