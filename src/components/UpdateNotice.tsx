type UpdateNoticeProps = {
  version: string | null;
  onDownload: () => void;
  onDismiss: () => void;
};

// Shares the notice's place and look, but stays until dismissed: it appears
// at launch, often before anyone is looking.
export function UpdateNotice({ version, onDownload, onDismiss }: UpdateNoticeProps) {
  if (!version) {
    return null;
  }

  return (
    <div className="notice update-notice" role="status">
      <span className="notice-text update-notice-text">
        smol_md {version} is out.
      </span>
      <button type="button" className="update-notice-download" onClick={onDownload}>
        Download
      </button>
      <button
        type="button"
        className="notice-dismiss"
        onClick={onDismiss}
        aria-label="dismiss update"
      >
        ×
      </button>
    </div>
  );
}
