import { collections } from "./db";

/** First 3 letters of the project name, uppercased, e.g. "Website Redesign" -> "WEB". */
function prefixFromName(name) {
  const letters = String(name || "").replace(/[^a-zA-Z]/g, "").toUpperCase();
  return (letters.slice(0, 3) || "PRJ").padEnd(3, "X");
}

/** Atomically allocates the next number for a named counter. */
async function nextSeq(key) {
  const { counters } = await collections();
  const doc = await counters.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  return doc.seq;
}

/**
 * Project number: 3-letter prefix from the name + a 001-style sequence shared
 * by every project with that same prefix, e.g. "WEB001", "WEB002".
 */
export async function nextProjectNumber(name) {
  const prefix = prefixFromName(name);
  const seq = await nextSeq(`project:${prefix}`);
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

/**
 * Task number: the owning project's number + a 01-style sequence scoped to
 * that project, e.g. "WEB001-01", "WEB001-02". Allocated atomically off the
 * project document so it can never collide, even created concurrently.
 */
export async function nextTaskNumber(project) {
  const { projects } = await collections();
  const updated = await projects.findOneAndUpdate(
    { _id: project._id },
    { $inc: { taskSeq: 1 } },
    { returnDocument: "after" },
  );
  const seq = updated?.taskSeq || 1;
  return `${project.projectNumber || "TSK"}-${String(seq).padStart(2, "0")}`;
}
