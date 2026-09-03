import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { api } from '@/services/lib/api';
import { useAuth } from '@/features/auth/AuthContext';

const DISMISS_KEY = 'webPushPromptDismissed';

type PromptKind = 'ask' | 'blocked' | null;

/**
 * Web Push (PushManager / VAPID) for browser and installed PWA.
 * Skipped entirely on native Capacitor (which uses FCM via usePushNotifications).
 *
 * Chrome/Android will not show a system permission dialog unless it is triggered
 * by a user tap — so we never call requestPermission() from a login effect.
 */
export function useWebPushNotifications() {
  const { user, loading } = useAuth();
  const registeredRef = useRef(false);
  const [promptKind, setPromptKind] = useState<PromptKind>(null);

  const subscribeAndRegister = useCallback(async () => {
    const publicKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined;
    if (!publicKey) {
      console.warn('[WEB PUSH] VITE_WEB_PUSH_PUBLIC_KEY not set — skipping');
      return false;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    await api.post('/api/push/web/register', { subscription });
    console.log('[WEB PUSH] Subscription registered with server');
    registeredRef.current = true;
    return true;
  }, []);

  useEffect(() => {
    if (!user?.id) {
      registeredRef.current = false;
      setPromptKind(null);
      return;
    }
    if (Capacitor.isNativePlatform()) return;
    if (loading) return;
    if (!('Notification' in window)) return;

    const publicKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined;
    if (!publicKey) return;

    const dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    const permission = Notification.permission;

    if (permission === 'granted') {
      if (!registeredRef.current) {
        void subscribeAndRegister().catch((e) => {
          console.warn('[WEB PUSH] auto-register failed:', e);
        });
      }
      setPromptKind(null);
      return;
    }

    if (dismissed) {
      setPromptKind(null);
      return;
    }

    // 'default' = never asked (or Chrome may later auto-deny). Show in-app Enable button.
    // 'denied' = blocked (including silent auto-deny) — show how to unblock.
    setPromptKind(permission === 'denied' ? 'blocked' : 'ask');
  }, [user?.id, loading, subscribeAndRegister]);

  const enableNotifications = useCallback(async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPromptKind(permission === 'denied' ? 'blocked' : 'ask');
        return false;
      }
      const ok = await subscribeAndRegister();
      if (ok) {
        localStorage.removeItem(DISMISS_KEY);
        setPromptKind(null);
      }
      return ok;
    } catch (e) {
      console.warn('[WEB PUSH] enable failed:', e);
      return false;
    }
  }, [subscribeAndRegister]);

  const dismissPrompt = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, '1');
    setPromptKind(null);
  }, []);

  return {
    promptKind,
    enableNotifications,
    dismissPrompt,
  };
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
