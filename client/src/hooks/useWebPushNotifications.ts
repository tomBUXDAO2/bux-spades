import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { api } from '@/services/lib/api';
import { useAuth } from '@/features/auth/AuthContext';

/**
 * Web Push (PushManager / VAPID) for browser and installed PWA.
 * Skipped entirely on native Capacitor (which uses FCM via usePushNotifications).
 */
export function useWebPushNotifications() {
  const { user, loading } = useAuth();
  const registeredRef = useRef(false);

  useEffect(() => {
    // Reset on logout so a fresh login can retry permission
    if (!user?.id) {
      registeredRef.current = false;
      return;
    }

    const init = async () => {
      // Native Android/iOS uses Capacitor FCM instead
      if (Capacitor.isNativePlatform()) return;
      if (loading) return;
      if (registeredRef.current) return;
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

      const publicKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined;
      if (!publicKey) {
        console.warn('[WEB PUSH] VITE_WEB_PUSH_PUBLIC_KEY not set — skipping');
        return;
      }

      registeredRef.current = true;

      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.log('[WEB PUSH] Permission not granted:', permission);
          return;
        }

        const registration = await navigator.serviceWorker.ready;

        // Check for an existing subscription first to avoid re-subscribing needlessly
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
        }

        await api.post('/api/push/web/register', { subscription });
        console.log('[WEB PUSH] Subscription registered with server');
      } catch (e) {
        console.warn('[WEB PUSH] init failed:', e);
      }
    };

    init();
  }, [user?.id, loading]);
}

/** Convert VAPID public key from URL-safe base64 to Uint8Array */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
