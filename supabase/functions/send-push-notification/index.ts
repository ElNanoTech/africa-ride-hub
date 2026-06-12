import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushNotificationPayload {
  driverId: string;
  title: string;
  body: string;
  icon?: string;
  url?: string;
  tag?: string;
  /**
   * When true, the function does NOT insert the backup in-app notifications
   * row. Callers that already persist their own (properly typed) row — e.g.
   * SendDriverMessageDialog — pass this to avoid a duplicate notification.
   * Optional, defaults to false: all existing callers keep the backup row.
   */
  skipInApp?: boolean;
}

// Send via FCM HTTP v1 API (works for both Android and iOS via APNs proxy)
async function sendFCMNotification(
  token: string,
  title: string,
  body: string,
  fcmServerKey: string,
  data?: Record<string, string>
): Promise<boolean> {
  try {
    const response = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `key=${fcmServerKey}`,
      },
      body: JSON.stringify({
        to: token,
        notification: {
          title,
          body,
          sound: "default",
          badge: 1,
        },
        data: data || {},
        priority: "high",
      }),
    });

    const result = await response.json();

    if (result.success === 1) {
      console.log(`FCM notification sent successfully to token: ${token.substring(0, 20)}...`);
      return true;
    } else {
      console.log(`FCM notification failed:`, result);
      return false;
    }
  } catch (error) {
    console.error("Error sending FCM notification:", error);
    return false;
  }
}

// Send via Web Push (existing subscriptions)
async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; icon?: string; url?: string; tag?: string }
): Promise<boolean> {
  try {
    const payloadString = JSON.stringify(payload);

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        TTL: "86400",
      },
      body: payloadString,
    });

    if (response.ok || response.status === 201) {
      console.log("Web push notification sent successfully");
      return true;
    } else {
      console.log(`Web push failed with status: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error("Error sending web push:", error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const fcmServerKey = Deno.env.get("FCM_SERVER_KEY") || "";

    const payload: PushNotificationPayload = await req.json();
    const { driverId, title, body, icon, url, tag, skipInApp } = payload;

    console.log(`Sending push notification to driver: ${driverId}`);
    console.log(`Title: ${title}, Body: ${body}`);

    let nativePushSent = 0;
    let webPushSent = 0;

    // 1. Send to native device tokens (FCM for Android + iOS)
    if (fcmServerKey) {
      const { data: deviceTokens, error: dtError } = await supabase
        .from("device_tokens")
        .select("*")
        .eq("driver_id", driverId);

      if (dtError) {
        console.error("Error fetching device tokens:", dtError);
      } else if (deviceTokens && deviceTokens.length > 0) {
        console.log(`Found ${deviceTokens.length} native device token(s)`);

        const nativeResults = await Promise.all(
          deviceTokens.map(async (dt) => {
            const success = await sendFCMNotification(
              dt.token,
              title,
              body,
              fcmServerKey,
              { type: tag || "general", url: url || "" }
            );

            if (!success) {
              // Remove invalid token
              await supabase.from("device_tokens").delete().eq("id", dt.id);
            }

            return success;
          })
        );

        nativePushSent = nativeResults.filter(Boolean).length;
      }
    }

    // 2. Send to web push subscriptions (existing PWA support)
    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("driver_id", driverId);

    if (subError) {
      console.error("Error fetching web subscriptions:", subError);
    } else if (subscriptions && subscriptions.length > 0) {
      console.log(`Found ${subscriptions.length} web push subscription(s)`);

      const webResults = await Promise.all(
        subscriptions.map(async (sub) => {
          const success = await sendWebPush(
            { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
            { title, body, icon, url, tag }
          );

          if (!success) {
            await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          }

          return success;
        })
      );

      webPushSent = webResults.filter(Boolean).length;
    }

    // 3. Create an in-app notification as backup — unless the caller already
    // inserted its own row (skipInApp), in which case this would duplicate it.
    if (!skipInApp) {
      await supabase.from("notifications").insert({
        driver_id: driverId,
        title,
        message: body,
        notification_type: tag || "kyc_update",
        is_read: false,
      });
    }

    const totalPushSent = nativePushSent + webPushSent;
    console.log(`Push notifications sent: ${totalPushSent} (native: ${nativePushSent}, web: ${webPushSent})`);

    return new Response(
      JSON.stringify({
        success: true,
        pushSent: totalPushSent > 0,
        nativePushSent,
        webPushSent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error sending push notification:", error);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
