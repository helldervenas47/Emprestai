import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";

const VAPID_PUBLIC_KEY = "BDSknih4ImnAFRrO5UiitinHcs4tMGOds1cuOQHcV6yIvWKZjXisAHh7C7QEV04oHvkhFcxk5OzHVitM9MdHDSU";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const isInStandaloneMode = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as any).standalone === true;

const isIOSDevice = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function usePushNotifications() {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [sendTime, setSendTime] = useState("08:00");
  const [needsInstall, setNeedsInstall] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
    }

    // On iOS, push only works in standalone (installed) mode
    if (isIOSDevice() && !isInStandaloneMode()) {
      setNeedsInstall(true);
    }

    if (supported && user) {
      checkExistingSubscription();
    } else {
      setIsLoading(false);
    }
  }, [user]);

  const checkExistingSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw-push.js");
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        if (mountedRef.current) setIsSubscribed(!!subscription);
      }

      // Load send_time from DB
      if (user) {
        const { data } = await supabase
          .from("push_tokens" as any)
          .select("send_time")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();
        if ((data as any)?.send_time && mountedRef.current) {
          setSendTime((data as any).send_time);
        }
      }
    } catch {
      // ignore
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };


  const subscribe = useCallback(async () => {
    if (!user || !isSupported) return false;
    setIsLoading(true);

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setIsLoading(false);
        return false;
      }

      const registration = await navigator.serviceWorker.register("/sw-push.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
      });

      const json = subscription.toJSON();
      const endpoint = json.endpoint!;
      const p256dh = json.keys!.p256dh!;
      const auth = json.keys!.auth!;

      const { error } = await supabase.from("push_tokens" as any).upsert(
        { user_id: user.id, endpoint, p256dh, auth, send_time: sendTime },
        { onConflict: "user_id,endpoint" }
      );

      if (error) throw error;

      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error("Push subscribe error:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, isSupported, sendTime]);

  const unsubscribe = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw-push.js");
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          const endpoint = subscription.endpoint;
          await subscription.unsubscribe();

          await supabase
            .from("push_tokens" as any)
            .delete()
            .eq("user_id", user.id)
            .eq("endpoint", endpoint);
        }
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error("Push unsubscribe error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const updateSendTime = useCallback(async (newTime: string) => {
    if (!user) return;
    setSendTime(newTime);

    await supabase
      .from("push_tokens" as any)
      .update({ send_time: newTime })
      .eq("user_id", user.id);
  }, [user]);

  const sendTestNotification = useCallback(async (): Promise<boolean> => {
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw-push.js");
      if (!registration) return false;

      await registration.showNotification("📊 Empréstai — Teste", {
        body: "Esta é uma notificação de teste. Suas notificações estão funcionando!",
        icon: "/logo-icon.png",
        badge: "/logo-icon.png",
      } as NotificationOptions);
      return true;
    } catch (err) {
      console.error("Test notification error:", err);
      return false;
    }
  }, []);

  return { isSupported, isSubscribed, isLoading, permission, sendTime, needsInstall, subscribe, unsubscribe, updateSendTime, sendTestNotification };
}
