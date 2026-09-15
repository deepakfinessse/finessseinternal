"use server";

import { getCurrentUser, AccessError } from "@/lib/access";
import {
  sendMessage as sendChatMessage,
  markConversationRead as markChatConversationRead,
  findOrCreateDirectConversation,
} from "@/lib/chat";

function fromAccessError(err) {
  if (err instanceof AccessError) return { ok: false, error: err.message };
  throw err;
}

export async function sendMessage(_prev, formData) {
  const me = await getCurrentUser();
  if (!me || me.status !== "active") return { ok: false, error: "Not signed in." };
  const conversationId = String(formData.get("conversationId") || "");
  const text = String(formData.get("text") || "");
  if (!conversationId) return { ok: false, error: "Missing conversation." };

  try {
    const message = await sendChatMessage({ conversationId, senderId: me.id, text });
    return { ok: true, message };
  } catch (err) {
    return fromAccessError(err);
  }
}

export async function markConversationRead(_prev, formData) {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Not signed in." };
  const conversationId = String(formData.get("conversationId") || "");
  if (!conversationId) return { ok: false, error: "Missing conversation." };

  try {
    await markChatConversationRead(conversationId, me.id);
    return { ok: true };
  } catch (err) {
    return fromAccessError(err);
  }
}

export async function startDirectConversation(_prev, formData) {
  const me = await getCurrentUser();
  if (!me || me.status !== "active") return { ok: false, error: "Not signed in." };
  const otherUserId = String(formData.get("userId") || "");
  if (!otherUserId) return { ok: false, error: "Missing user." };

  try {
    const convo = await findOrCreateDirectConversation(me.id, otherUserId);
    return { ok: true, conversationId: String(convo._id) };
  } catch (err) {
    return fromAccessError(err);
  }
}
