// The light alternative to a real updater: nothing is downloaded or
// installed, the app only notices that GitHub has a newer release and says so.

export const LATEST_RELEASE_API_URL =
  "https://api.github.com/repos/billecart/smol_md/releases/latest";
export const LATEST_RELEASE_PAGE_URL =
  "https://github.com/billecart/smol_md/releases/latest";

const DISMISSED_UPDATE_KEY = "smol_md.dismissedUpdateVersion";

// Release tags look like "app-v1.1.15". Anything that isn't three numbers
// is treated as unknown rather than guessed at.
export function parseReleaseVersion(tag: unknown): string | null {
  if (typeof tag !== "string") {
    return null;
  }

  const match = /^(?:app-)?v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const candidateParts = candidate.split(".").map(Number);
  const currentParts = current.split(".").map(Number);

  for (let index = 0; index < 3; index += 1) {
    const difference = (candidateParts[index] ?? 0) - (currentParts[index] ?? 0);
    if (difference !== 0) {
      return difference > 0;
    }
  }

  return false;
}

// The version to tell the user about, or null. Dismissing an update hides it
// for that version only, so the next release is announced again.
export function findAvailableUpdate(
  latestTag: unknown,
  currentVersion: string,
  dismissedVersion: string | null,
): string | null {
  const latestVersion = parseReleaseVersion(latestTag);
  const current = parseReleaseVersion(currentVersion);

  if (!latestVersion || !current || latestVersion === dismissedVersion) {
    return null;
  }

  return isNewerVersion(latestVersion, current) ? latestVersion : null;
}

export function loadDismissedUpdateVersion(): string | null {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    return localStorage.getItem(DISMISSED_UPDATE_KEY);
  } catch {
    return null;
  }
}

export function saveDismissedUpdateVersion(version: string) {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(DISMISSED_UPDATE_KEY, version);
  } catch {
    // Losing this only means the same update is mentioned again next launch.
  }
}
