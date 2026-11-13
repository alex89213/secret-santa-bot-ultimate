/**
 * Description:  Shows the error or success message from an action.
 * Author:       Alex Wu
 * Dependencies:
 * Usage:
 */
export function Feedback({ error, success }: { error?: string; success?: string }) {
  return (
    <div aria-live="polite">
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {success && <p className="notice success">{success}</p>}
    </div>
  );
}
