import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, type PushNotificationActionPerformed } from '@capacitor/push-notifications';
import { api } from '@/services/lib/api';
import { useAuth } from '@/features/auth/AuthContext';

export function usePushNotifications() {
  const { user, loading } = useAuth();
  const registeredRef = useRef(false);

  useEffect(() => {
    // Reset on logout so a fresh login can retry permission
    if (!user?.id) {
      registeredRef.current = false;
      return;
    }

    const init = async () => {
      // Native only
      if (!Capacitor.isNativePlatform()) return;
      if (loading) return;
      if (registeredRef.current) return;

      registeredRef.current = true;

      try {
        const platform = Capacitor.getPlatform?.() || 'android';

        const perm = await PushNotifications.requestPermissions();
        if (perm && (perm as any).receive !== 'granted' && (perm as any).receive !== true) {
          console.log('[PUSH] Permissions not granted');
          return;
        }

        // Ensure token registration happens
        await PushNotifications.register();

        // Token callback
        const regListener = await PushNotifications.addListener('registration', async (token) => {
          const value = (token as any)?.value || (token as any)?.token || token;
          if (!value) return;
          console.log('[PUSH] Registered FCM token');
          await api.post('/api/push/register', { token: value, platform });
        });

        const regErrListener = await PushNotifications.addListener(
          'registrationError',
          (err) => {
            console.warn('[PUSH] registrationError:', err);
          }
        );

        const receivedListener = await PushNotifications.addListener(
          'pushNotificationReceived',
          (notification) => {
            // For foreground notifications, we just log for now.
            console.log('[PUSH] pushNotificationReceived:', notification);
          }
        );

        const actionListener = await PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (action: PushNotificationActionPerformed) => {
            try {
              const data = (action as any)?.notification?.data || (action as any)?.data || {};
              const route = data?.route;
              if (typeof route === 'string' && route.length > 0) {
                // Route is stored as an app pathname (e.g. /league/<id>).
                window.location.href = route.startsWith('/') ? route : `/${route}`;
              }
            } catch (e) {
              console.warn('[PUSH] action navigation failed:', e);
            }
          }
        );

        return () => {
          regListener.remove();
          regErrListener.remove();
          receivedListener.remove();
          actionListener.remove();
        };
      } catch (e) {
        console.warn('[PUSH] init failed:', e);
      }
    };

    const cleanupPromise = init();

    return () => {
      // best-effort cleanup handled by listener remove closures
      void cleanupPromise;
    };
  }, [user?.id, loading]);
}

