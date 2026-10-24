import Dialog from './Dialog';

/**
 * Right-side panel reusing the Dialog mechanics (portal, focus trap, Escape).
 * Admin create/edit forms live here.
 */
export default function Drawer({ size = 'md', ...rest }) {
  return <Dialog placement="right" size={size} {...rest} />;
}
