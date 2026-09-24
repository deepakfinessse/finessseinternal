import { GridFSBucket, ObjectId } from "mongodb";
import { collections, TEAM_GENERAL_ID } from "./db";
import { AccessError } from "./access";

const oid = (id) => (id instanceof ObjectId ? id : new ObjectId(String(id)));
const isChannel = (id) => id === TEAM_GENERAL_ID;
const EPOCH = new Date(0);

export const MAX_ATTACHMENT_BYTES = 1024 * 1024;
export const MAX_IMAGE_BYTES = 500 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

// Types the browser may render inline. Anything else (HTML, SVG, scripts…) is
// always served as a download so an upload can't run in our origin.
const INLINE_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif",
  "video/mp4", "video/webm", "video/quicktime",
  "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/webm",
  "application/pdf",
]);

export const isInlineType = (type) => INLINE_TYPES.has(type);

function kindOf(type) {
  if (!isInlineType(type)) return "file";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "file";
}

function serializeAttachment(a) {
  return {
    id: String(a.fileId),
    name: a.name,
    size: a.size,
    contentType: a.contentType,
    kind: kindOf(a.contentType),
    url: `/api/chat/files/${a.fileId}`,
  };
}

function serializeMessage(m) {
  return {
    id: String(m._id),
    conversationId: isChannel(m.conversationId) ? TEAM_GENERAL_ID : String(m.conversationId),
    senderId: String(m.senderId),
    text: m.text || "",
    attachments: (m.attachments || []).map(serializeAttachment),
    createdAt: (m.createdAt || m._id.getTimestamp()).toISOString(),
  };
}

async function chatFilesBucket() {
  const { db } = await collections();
  return new GridFSBucket(db, { bucketName: "chatFiles" });
}

function previewText(text, attachments) {
  if (text) return text;
  if (attachments.length === 1) return `📎 ${attachments[0].name}`;
  return `📎 ${attachments.length} files`;
}

function serializeConversation(c, { unreadCount = 0, otherUser = null } = {}) {
  return {
    id: isChannel(c._id) ? TEAM_GENERAL_ID : String(c._id),
    type: c.type,
    name: c.type === "channel" ? "Team" : otherUser?.name || otherUser?.email || "Unknown",
    otherUser,
    lastMessage: c.lastMessage
      ? {
          text: c.lastMessage.text,
          senderId: String(c.lastMessage.senderId),
          createdAt: new Date(c.lastMessage.createdAt).toISOString(),
        }
      : null,
    lastMessageAt: c.lastMessageAt ? new Date(c.lastMessageAt).toISOString() : null,
    unreadCount,
  };
}

/** Throws AccessError unless `userId` may read/write this conversation. */
export async function assertConversationAccess(conversationId, userId) {
  if (isChannel(conversationId)) return { _id: TEAM_GENERAL_ID, type: "channel" };
  if (!ObjectId.isValid(conversationId)) throw new AccessError("Conversation not found.");
  const { chatConversations } = await collections();
  const convo = await chatConversations.findOne({ _id: oid(conversationId) });
  if (!convo) throw new AccessError("Conversation not found.");
  const isParticipant = (convo.participantIds || []).some((p) => String(p) === String(userId));
  if (!isParticipant) throw new AccessError("You don't have access to this conversation.");
  return convo;
}

/** Idempotent — returns the existing DM conversation between two users, creating it if needed. */
export async function findOrCreateDirectConversation(userAId, userBId) {
  if (String(userAId) === String(userBId)) {
    throw new AccessError("Can't start a conversation with yourself.");
  }
  const { chatConversations, users } = await collections();
  const target = await users.findOne({ _id: oid(userBId) });
  if (!target || target.status !== "active") throw new AccessError("User not found.");

  const key = `dm:${[String(userAId), String(userBId)].sort().join(":")}`;
  const now = new Date();
  const doc = {
    type: "dm",
    key,
    participantIds: [oid(userAId), oid(userBId)],
    lastMessage: null,
    lastMessageAt: now,
    reads: {},
    createdAt: now,
    updatedAt: now,
  };
  try {
    const res = await chatConversations.findOneAndUpdate(
      { key },
      { $setOnInsert: doc },
      { upsert: true, returnDocument: "after" },
    );
    return res;
  } catch (err) {
    // Race: another request created it between our findOneAndUpdate attempts.
    if (err?.code === 11000) {
      const existing = await chatConversations.findOne({ key });
      if (existing) return existing;
    }
    throw err;
  }
}

async function unreadCountFor(convo, userId) {
  const { chatMessages } = await collections();
  const lastRead = convo.reads?.[String(userId)] ? new Date(convo.reads[String(userId)]) : EPOCH;
  return chatMessages.countDocuments({
    conversationId: isChannel(convo._id) ? TEAM_GENERAL_ID : convo._id,
    senderId: { $ne: oid(userId) },
    createdAt: { $gt: lastRead },
  });
}

export async function listConversationsForUser(userId) {
  const { chatConversations, users } = await collections();
  const [dms, channel] = await Promise.all([
    chatConversations.find({ participantIds: oid(userId) }).toArray(),
    chatConversations.findOne({ _id: TEAM_GENERAL_ID }),
  ]);
  const all = channel ? [channel, ...dms] : dms;

  const otherIds = dms.flatMap((c) => (c.participantIds || []).filter((p) => String(p) !== String(userId)));
  const otherDocs = otherIds.length
    ? await users.find({ _id: { $in: otherIds.map(oid) } }).toArray()
    : [];
  const otherMap = new Map(otherDocs.map((u) => [String(u._id), u]));

  const withUnread = await Promise.all(
    all.map(async (c) => {
      const unreadCount = await unreadCountFor(c, userId);
      const other = c.type === "dm"
        ? otherMap.get(String((c.participantIds || []).find((p) => String(p) !== String(userId))))
        : null;
      return serializeConversation(c, {
        unreadCount,
        otherUser: other
          ? { id: String(other._id), name: other.name || "", email: other.email, image: other.image || null }
          : null,
      });
    }),
  );

  return withUnread.sort((a, b) => {
    if (a.type !== b.type) return a.type === "channel" ? -1 : 1;
    return new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0);
  });
}

export async function listMessages(conversationId, userId, { limit = 50, after } = {}) {
  await assertConversationAccess(conversationId, userId);
  const { chatMessages } = await collections();
  const cid = isChannel(conversationId) ? TEAM_GENERAL_ID : oid(conversationId);

  if (after) {
    const docs = await chatMessages
      .find({ conversationId: cid, createdAt: { $gt: new Date(after) } })
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray();
    return docs.map(serializeMessage);
  }
  const docs = await chatMessages
    .find({ conversationId: cid })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return docs.reverse().map(serializeMessage);
}

/**
 * `files` are Web `File`s (from a multipart request). They're validated up
 * front, then streamed into GridFS before the message is written; if anything
 * fails mid-way the already-stored files are removed.
 */
export async function sendMessage({ conversationId, senderId, text, files = [] }) {
  const trimmed = String(text || "").trim();
  if (!trimmed && !files.length) throw new AccessError("Message can't be empty.");
  if (trimmed.length > 4000) throw new AccessError("Message is too long.");
  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new AccessError(`You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files at once.`);
  }
  for (const f of files) {
    if (!f.size) throw new AccessError(`"${f.name}" is empty.`);
    if (f.type?.startsWith("image/") && f.size > MAX_IMAGE_BYTES) {
      throw new AccessError(`Image "${f.name}" is larger than 500 KB.`);
    }
    if (f.size > MAX_ATTACHMENT_BYTES) throw new AccessError(`"${f.name}" is larger than 1 MB.`);
  }

  await assertConversationAccess(conversationId, senderId);
  const { chatMessages, chatConversations } = await collections();
  const cid = isChannel(conversationId) ? TEAM_GENERAL_ID : oid(conversationId);
  const now = new Date();

  const attachments = [];
  if (files.length) {
    const bucket = await chatFilesBucket();
    try {
      for (const f of files) {
        const name = String(f.name || "file").slice(0, 200);
        const contentType = f.type || "application/octet-stream";
        const fileId = new ObjectId();
        const upload = bucket.openUploadStreamWithId(fileId, name, {
          metadata: { conversationId: cid, uploaderId: oid(senderId), contentType },
        });
        const buf = Buffer.from(await f.arrayBuffer());
        await new Promise((resolve, reject) => {
          upload.once("finish", resolve);
          upload.once("error", reject);
          upload.end(buf);
        });
        attachments.push({ fileId, name, size: f.size, contentType });
      }
    } catch (err) {
      await Promise.all(attachments.map((a) => bucket.delete(a.fileId).catch(() => {})));
      throw err;
    }
  }

  const doc = {
    conversationId: cid,
    senderId: oid(senderId),
    text: trimmed,
    ...(attachments.length ? { attachments } : {}),
    createdAt: now,
  };
  const res = await chatMessages.insertOne(doc);

  await chatConversations.updateOne(
    { _id: cid },
    {
      $set: {
        lastMessage: { text: previewText(trimmed, attachments), senderId: oid(senderId), createdAt: now },
        lastMessageAt: now,
        updatedAt: now,
        [`reads.${String(senderId)}`]: now,
      },
    },
  );

  return serializeMessage({ _id: res.insertedId, ...doc });
}

/**
 * Returns `{ file, stream }` for a chat attachment, after checking `userId` is
 * in the conversation it was shared in. Throws AccessError otherwise.
 */
export async function openChatFile(fileId, userId) {
  if (!ObjectId.isValid(fileId)) throw new AccessError("File not found.");
  const bucket = await chatFilesBucket();
  const [file] = await bucket.find({ _id: oid(fileId) }).limit(1).toArray();
  if (!file) throw new AccessError("File not found.");
  const convoId = file.metadata?.conversationId;
  await assertConversationAccess(isChannel(convoId) ? TEAM_GENERAL_ID : String(convoId), userId);
  return { file, stream: bucket.openDownloadStream(file._id) };
}

export async function markConversationRead(conversationId, userId) {
  await assertConversationAccess(conversationId, userId);
  const { chatConversations } = await collections();
  const cid = isChannel(conversationId) ? TEAM_GENERAL_ID : oid(conversationId);
  await chatConversations.updateOne(
    { _id: cid },
    { $set: { [`reads.${String(userId)}`]: new Date() } },
  );
}

export async function unreadChatCount(userId) {
  const conversations = await listConversationsForUser(userId);
  return conversations.reduce((n, c) => n + c.unreadCount, 0);
}
