import { NavLink } from 'react-router-dom';
import Icon from '../ui/Icon';

/**
 * Shared sidebar nav list. `aria-current="page"` is set by NavLink's isActive,
 * and the active item gets a left accent bar from the layout CSS.
 */
export default function SidebarNav({ items, onNavigate, ariaLabel }) {
  return (
    <nav className="sp-shell__nav" aria-label={ariaLabel}>
      <ul>
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `sp-shell__navlink ${isActive ? 'is-active' : ''}`
              }
              onClick={onNavigate}
              title={item.label}
            >
              <Icon name={item.icon} size={18} />
              <span className="sp-shell__navlabel">{item.label}</span>
              {item.badge ? (
                <span className="sp-shell__navbadge">{item.badge}</span>
              ) : null}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
