/**
 * Description:  Button that asks for confirmation in a dialog before running an action. Used only
 *               inside client components.
 * Author:       Alex Wu
 * Dependencies: react
 * Usage:
 */
import { useRef } from 'react';
/** Shows a button that opens a confirmation dialog and runs `onConfirm` only when confirmed. */
export function ConfirmButton({
  label,
  title,
  body,
  confirmLabel,
  onConfirm,
  className = 'btn secondary',
  confirmClassName = 'btn primary',
  disabled,
}: {
  label: React.ReactNode;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<unknown>;
  className?: string;
  confirmClassName?: string;
  disabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => dialog.current?.showModal()}
      >
        {label}
      </button>
      <dialog ref={dialog} className="dialog" aria-label={title}>
        <h2>{title}</h2>
        <div className="muted stack">{body}</div>
        <div className="actions">
          <button type="button" className="btn secondary" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button
            type="button"
            className={confirmClassName}
            onClick={() => {
              dialog.current?.close();
              void onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
