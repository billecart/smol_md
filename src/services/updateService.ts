import { getVersion } from "@tauri-apps/api/app";
import { isRunningInTauri } from "./fileService";
import {
  LATEST_RELEASE_API_URL,
  findAvailableUpdate,
  loadDismissedUpdateVersion,
} from "../utils/updateCheck";

// Asks GitHub once per launch. Offline, rate-limited or any other failure
// is silent: a missed update notice is not worth an error message.
export async function checkForUpdate(): Promise<string | null> {
  if (!isRunningInTauri()) {
    return null;
  }

  try {
    const [currentVersion, response] = await Promise.all([
      getVersion(),
      fetch(LATEST_RELEASE_API_URL, {
        headers: { Accept: "application/vnd.github+json" },
      }),
    ]);

    if (!response.ok) {
      return null;
    }

    const release = (await response.json()) as { tag_name?: unknown };
    return findAvailableUpdate(
      release.tag_name,
      currentVersion,
      loadDismissedUpdateVersion(),
    );
  } catch {
    return null;
  }
}
