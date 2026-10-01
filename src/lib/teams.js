import { ObjectId } from "mongodb";
import { collections } from "./db";

const oid = (id) => (id instanceof ObjectId ? id : new ObjectId(String(id)));

function serialize(t) {
  return {
    id: String(t._id),
    name: t.name,
    memberIds: (t.memberIds || []).map(String),
    order: t.order ?? 0,
    createdAt: (t.createdAt || t._id.getTimestamp()).toISOString(),
  };
}

export async function listTeams() {
  const { teams } = await collections();
  const docs = await teams.find({}).sort({ order: 1, name: 1 }).toArray();
  return docs.map(serialize);
}

/** Teams with their member user docs hydrated — for the settings page. */
export async function listTeamsWithMembers() {
  const { teams, users } = await collections();
  const docs = await teams.find({}).sort({ order: 1, name: 1 }).toArray();
  const allIds = [...new Set(docs.flatMap((t) => (t.memberIds || []).map(String)))];
  const uDocs = allIds.length ? await users.find({ _id: { $in: allIds.map(oid) } }).toArray() : [];
  const uMap = new Map(uDocs.map((u) => [String(u._id), u]));
  return docs.map((t) => ({
    ...serialize(t),
    members: (t.memberIds || [])
      .map((id) => uMap.get(String(id)))
      .filter(Boolean)
      .map((u) => ({ id: String(u._id), name: u.name || "", email: u.email, image: u.image || null })),
  }));
}

export async function getTeam(id) {
  const { teams } = await collections();
  let t;
  try {
    t = await teams.findOne({ _id: oid(id) });
  } catch {
    return null;
  }
  return t ? serialize(t) : null;
}

export async function teamIds() {
  const { teams } = await collections();
  const docs = await teams.find({}, { projection: { _id: 1 } }).toArray();
  return docs.map((d) => String(d._id));
}

let cache = null; // { at, map }
const CACHE_MS = 15000;

/**
 * id -> {id, name, memberIds}, cached briefly. Read on nearly every
 * project/task render, so a per-request DB round trip isn't worth it — a
 * rename or member change shows up everywhere within CACHE_MS.
 */
export async function teamsMap() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.map;
  const list = await listTeams();
  const map = new Map(list.map((t) => [t.id, t]));
  cache = { at: Date.now(), map };
  return map;
}

export function invalidateTeamsCache() {
  cache = null;
}
