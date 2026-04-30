import { useEffect } from "react";
import { isRunningInTauri } from "../services/fileService";

export function useBeforeCloseWarning(isDirty: boolean) {
  useEffect(() => {
    if (isRunningInTauri()) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!isRunningInTauri()) {
      return;
    }

    let unlisten: (() => void) | undefined;

    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => {
        const appWindow = getCurrentWindow();

        return appWindow.onCloseRequested(async (event) => {
          event.preventDefault();

          if (!isDirty) {
            await appWindow.destroy();
            return;
          }

          const { confirm } = await import("@tauri-apps/plugin-dialog");
          const shouldClose = await confirm(
            "You have unsaved changes. Close without saving?",
            {
              title: "Unsaved changes",
              kind: "warning",
              okLabel: "Close without saving",
              cancelLabel: "Keep editing",
            },
          );

          if (shouldClose) {
            await appWindow.destroy();
          }
        });
      })
      .then((cleanup) => {
        unlisten = cleanup;
      })
      .catch(() => undefined);

    return () => {
      unlisten?.();
    };
  }, [isDirty]);
}
