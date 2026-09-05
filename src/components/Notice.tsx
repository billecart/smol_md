import { useEffect } from "react";

// Problems used to be written only to the status bar, which is transparent
// until hovered - so a refused save reported itself to nobody. This is the one
// surface allowed to appear unasked, and only for things that went wrong;
// ordinary progress messages still go to the status bar.
export const NOTICE_DURATION_MS = 6000;

export type NoticeMessage = {
  id: number;
  text: string;
};

type NoticeProps = {
  notice: NoticeMessage | null;
  onDismiss: () => void;
};

export function Notice({ notice, onDismiss }: NoticeProps) {
  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(onDismiss, NOTICE_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [notice, onDismiss]);

  if (!notice) {
    return null;
  }

  return (
    <div className="notice" role="alert" aria-live="assertive">
      <span className="notice-text">{notice.text}</span>
      <button
        type="button"
        className="notice-dismiss"
        onClick={onDismiss}
        aria-label="dismiss message"
      >
        ×
      </button>
    </div>
  );
}
