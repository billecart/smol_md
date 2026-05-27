export function isMacOs() {
  const platform = window.navigator.platform.toLowerCase();
  const userAgent = window.navigator.userAgent.toLowerCase();

  return platform.includes("mac") || userAgent.includes("mac os");
}
