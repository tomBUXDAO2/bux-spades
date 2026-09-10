import { pushNotificationService } from '../services/PushNotificationService.js';
import { webPushNotificationService } from '../services/WebPushNotificationService.js';
import { emitToUser } from './chatMentions.js';

/**
 * Notify mentioned users via push + direct socket event.
 * Skips the sender. Prefer push even if socket-connected (mobile may be backgrounded).
 */
export async function notifyChatMentions({
  io,
  senderUserId,
  senderName,
  mentions,
  messageText,
  messageId,
  route,
  type,
  extraData = {},
  dedupeKeyPrefix,
  mentionEveryone = false
}) {
  if (!Array.isArray(mentions) || mentions.length === 0) return;

  const recipients = mentions
    .map((m) => m.userId)
    .filter((uid) => uid && uid !== senderUserId);

  if (!recipients.length) return;

  const title = mentionEveryone
    ? `${senderName || 'Someone'} mentioned @everyone`
    : `${senderName || 'Someone'} mentioned you`;
  const body = String(messageText || '').slice(0, 90);
  const data = {
    type: type || 'chat_mention',
    route: route || '/',
    messageId: messageId || '',
    mentionEveryone: mentionEveryone ? '1' : '0',
    ...extraData
  };

  const payload = {
    id: messageId,
    fromUserId: senderUserId,
    fromUserName: senderName,
    message: messageText,
    mentions,
    mentionEveryone: Boolean(mentionEveryone),
    route: data.route,
    type: data.type,
    ...extraData
  };

  for (const uid of recipients) {
    emitToUser(io, uid, 'chat_mention', payload);
  }

  try {
    const pushPayload = {
      userIds: recipients,
      title,
      body,
      data,
      dedupeKeyPrefix: dedupeKeyPrefix || `push:dedupe:chat_mention:${messageId || Date.now()}`
    };
    await Promise.all([
      pushNotificationService.sendToUsers(pushPayload),
      webPushNotificationService.sendToUsers(pushPayload)
    ]);
  } catch (e) {
    console.warn('[PUSH] Chat mention push failed:', e?.message || e);
  }
}
