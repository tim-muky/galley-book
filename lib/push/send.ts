import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

/**
 * GAL-329: push notification fan-out via the Expo Push API.
 *
 * Native clients register their Expo push token (one per device) in
 * `user_devices`. This module sends notifications to a list of users
 * or to "all members of a galley except the actor", looking up tokens
 * and per-user preferences along the way.
 *
 * v1 uses Expo's push service (`https://exp.host/--/api/v2/push/send`)
 * rather than direct APNs:
 *   - Free for our scale.
 *   - EAS already manages the APNs .p8.
 *   - One HTTP POST per fan-out batch (max 100 messages per call).
 *
 * Expo handles APNs/FCM under the hood. If we ever need raw control
 * (e.g. critical alerts, custom collapse keys beyond Expo's primitives),
 * switch to direct APNs HTTP/2.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_BATCH = 100;

export interface PushPayload {
  /** Event-type key matched against the recipient's notification_preferences. */
  eventType: string;
  title: string;
  body: string;
  /** Deep-link or screen routing hint. Native side reads it. */
  data?: Record<string, unknown>;
  /** Optional Apple sound key (e.g. "default"). Omit for silent-ish. */
  sound?: "default" | null;
}

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
  channelId?: string;
}

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoResponse {
  data?: ExpoTicket[];
  errors?: { message: string; code?: string }[];
}

/**
 * Fan-out to a list of user IDs. Filters out users who have opted out of
 * this event type (notification_preferences.prefs[eventType] === false)
 * and removes invalid tokens from the registry when Expo reports them.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<{ sent: number; muted: number; failed: number }> {
  if (userIds.length === 0) return { sent: 0, muted: 0, failed: 0 };
  const service = createServiceClient();

  const { data: prefRows } = await service
    .from("notification_preferences")
    .select("user_id, prefs")
    .in("user_id", userIds);

  const muted = new Set<string>();
  for (const row of prefRows ?? []) {
    const prefs = (row as { user_id: string; prefs: Record<string, unknown> })
      .prefs;
    if (prefs?.[payload.eventType] === false) muted.add(row.user_id);
  }
  const recipientUserIds = userIds.filter((id) => !muted.has(id));
  if (recipientUserIds.length === 0) {
    return { sent: 0, muted: muted.size, failed: 0 };
  }

  const { data: devices, error: devicesErr } = await service
    .from("user_devices")
    .select("expo_push_token, user_id")
    .in("user_id", recipientUserIds);
  if (devicesErr) {
    logger.error("push.send.device_lookup_failed", {
      message: devicesErr.message,
      eventType: payload.eventType,
    });
    return { sent: 0, muted: muted.size, failed: recipientUserIds.length };
  }
  const tokens = (devices ?? [])
    .map((d) => d.expo_push_token)
    .filter((t): t is string => typeof t === "string" && t.length > 0);
  if (tokens.length === 0) {
    return { sent: 0, muted: muted.size, failed: 0 };
  }

  const messages: ExpoMessage[] = tokens.map((to) => ({
    to,
    title: payload.title,
    body: payload.body,
    data: payload.data,
    sound: payload.sound === null ? undefined : "default",
    channelId: "default",
  }));

  let sent = 0;
  let failed = 0;
  const invalidTokens: string[] = [];

  for (let i = 0; i < messages.length; i += MAX_BATCH) {
    const batch = messages.slice(i, i + MAX_BATCH);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        failed += batch.length;
        logger.error("push.send.batch_http_error", {
          status: res.status,
          eventType: payload.eventType,
        });
        continue;
      }
      const body = (await res.json()) as ExpoResponse;
      const tickets = body.data ?? [];
      tickets.forEach((ticket, idx) => {
        if (ticket.status === "ok") {
          sent += 1;
        } else {
          failed += 1;
          // Expo reports DeviceNotRegistered when an Apple token has
          // been revoked (uninstall, signed out of Apple ID, etc.).
          // Drop those from the registry so we stop trying.
          if (ticket.details?.error === "DeviceNotRegistered") {
            invalidTokens.push(batch[idx].to);
          }
        }
      });
    } catch (err) {
      failed += batch.length;
      logger.error("push.send.batch_throw", {
        message: err instanceof Error ? err.message : "unknown",
        eventType: payload.eventType,
      });
    }
  }

  if (invalidTokens.length > 0) {
    await service.from("user_devices").delete().in("expo_push_token", invalidTokens);
  }

  logger.info("push.send.done", {
    eventType: payload.eventType,
    recipients: recipientUserIds.length,
    sent,
    failed,
    muted: muted.size,
    invalidatedTokens: invalidTokens.length,
  });
  return { sent, muted: muted.size, failed };
}

/**
 * Fan-out to all members of a galley except the actor who triggered
 * the event. Used for the broadcast events (recipe added, cook-next
 * add/clear).
 */
export async function sendPushToGalleyMembers(
  galleyId: string,
  actorUserId: string,
  payload: PushPayload,
): Promise<{ sent: number; muted: number; failed: number }> {
  const service = createServiceClient();
  const { data: members, error } = await service
    .from("galley_members")
    .select("user_id")
    .eq("galley_id", galleyId)
    .neq("user_id", actorUserId);
  if (error) {
    logger.error("push.send.member_lookup_failed", {
      galleyId,
      message: error.message,
    });
    return { sent: 0, muted: 0, failed: 0 };
  }
  const userIds = (members ?? []).map((m) => m.user_id);
  return sendPushToUsers(userIds, payload);
}
