/** True when running as installed home-screen PWA (not a normal browser tab). */
export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
  } catch {
    /* ignore */
  }
  // iOS Safari legacy
  return Boolean((window.navigator as any).standalone);
}

export function isAndroidBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}

/**
 * Start OAuth without destroying the Android home-screen PWA.
 * Android Chrome always opens facebook.com outside the PWA; using location.href
 * navigates the PWA away so handoff claim never runs. window.open keeps the app alive.
 * iOS standalone can keep OAuth in-app via location.href.
 */
export function openOAuthUrl(url: string): void {
  if (isStandalonePwa() && isAndroidBrowser()) {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      // Popup blocked — last resort (will leave the PWA)
      window.location.href = url;
    }
    return;
  }
  window.location.href = url;
}

export const AUTH_BROADCAST_CHANNEL = 'bux-auth';
export const OAUTH_DEVICE_ID_KEY = 'oauthDeviceId';
