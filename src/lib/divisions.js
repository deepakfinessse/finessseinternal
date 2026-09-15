import { ObjectId } from "mongodb";
import { collections } from "./db";

const oid = (id) => (id instanceof ObjectId ? id : new ObjectId(String(id)));

export const slugifyDivisionKey = (s) =>
  String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function serialize(d) {
  return {
    id: String(d._id),
    key: d.key,
    label: d.label,
    order: d.order ?? 0,
    createdAt: (d.createdAt || d._id.getTimestamp()).toISOString(),
  };
}

export async function listDivisions() {
  const { divisions } = await collections();
  const docs = await divisions.find({}).sort({ order: 1, label: 1 }).toArray();
  return docs.map(serialize);
}

export async function getDivision(id) {
  const { divisions } = await collections();
  let d;
  try {
    d = await divisions.findOne({ _id: oid(id) });
  } catch {
    return null;
  }
  return d ? serialize(d) : null;
}

export async function divisionKeys() {
  const { divisions } = await collections();
  const docs = await divisions.find({}, { projection: { key: 1 } }).toArray();
  return docs.map((d) => d.key);
}

let cache = null; // { at, map }
const CACHE_MS = 15000;

/**
 * key -> label, cached briefly. Read on nearly every project/task render, so a
 * per-request DB round trip isn't worth it — a super-admin rename shows up
 * everywhere within CACHE_MS.
 */
export async function divisionLabelMap() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.map;
  const list = await listDivisions();
  const map = Object.fromEntries(list.map((d) => [d.key, d.label]));
  cache = { at: Date.now(), map };
  return map;
}

export function invalidateDivisionsCache() {
  cache = null;
}
