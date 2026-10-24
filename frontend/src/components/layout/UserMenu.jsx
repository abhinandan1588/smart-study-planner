import { useState } from 'react';
import Avatar from '../ui/Avatar';
import ConfirmDialog from '../ui/ConfirmDialog';
import Dropdown from '../ui/Dropdown';
import Icon from '../ui/Icon';
import { useAuth } from '../../context/AuthContext';
import { titleCase } from '../../utils/format';

/** Top-bar avatar menu. Signing out asks for confirmation first. */
export default function UserMenu({ settingsPath, extraItems = [], tone = 'light' }) {
  const { user, logout } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function onConfirmLogout() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
      setConfirming(false);
    }
  }

  const items = [
    { key: 'settings', label: 'Profile & settings', icon: 'settings', to: settingsPath },
    ...extraItems,
    { key: 'divider', divider: true },
    {
      key: 'logout',
      label: 'Sign out',
      icon: 'logout',
      tone: 'danger',
      onClick: () => setConfirming(true),
    },
  ];

  return (
    <>
      <Dropdown
        label="Account menu"
        items={items}
        width={236}
        header={
          <div className="sp-usermenu__header">
            <p className="sp-usermenu__name">{user?.full_name || 'Signed in'}</p>
            <p className="sp-usermenu__email">{user?.email}</p>
          </div>
        }
        trigger={({ ref, props, open }) => (
          <button
            ref={ref}
            type="button"
            className={`sp-usermenu__trigger sp-usermenu__trigger--${tone} ${open ? 'is-open' : ''}`}
            {...props}
          >
            <Avatar name={user?.full_name} src={user?.avatar_url} size="sm" />
            <span className="sp-usermenu__meta">
              <span className="sp-usermenu__triggername">{user?.full_name}</span>
              <span className="sp-usermenu__role">{titleCase(user?.role || '')}</span>
            </span>
            <Icon name="chevronDown" size={15} />
          </button>
        )}
      />

      <ConfirmDialog
        open={confirming}
        tone="warning"
        title="Sign out?"
        message="You will need to sign in again to reach your study plan."
        confirmLabel="Sign out"
        loading={signingOut}
        onConfirm={onConfirmLogout}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}
