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

export const AUTH_BROADCAST_CHANNEL = 'bux-auth';
