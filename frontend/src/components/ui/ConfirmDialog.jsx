import Button from './Button';
import Dialog from './Dialog';
import Icon from './Icon';
import './Dialog.css';

/**
 * Confirmation used for every destructive action (PRD 9).
 * tone: danger | warning | primary
 */
export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  details,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
  onConfirm,
  onClose,
}) {
  return (
    <Dialog
      open={open}
      size="sm"
      title={undefined}
      showClose={false}
      closeOnBackdrop={!loading}
      onClose={loading ? undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="sp-confirm">
        <span className={`sp-confirm__icon sp-confirm__icon--${tone}`}>
          <Icon name={tone === 'danger' ? 'warning' : 'info'} size={20} />
        </span>
        <div className="sp-confirm__text">
          <h2 className="sp-confirm__title">{title}</h2>
          {message ? <p className="sp-confirm__message">{message}</p> : null}
          {details ? <div className="sp-confirm__details">{details}</div> : null}
        </div>
      </div>
    </Dialog>
  );
}
