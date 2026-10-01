/**
 * One-time migration: divisions -> teams.
 *
 * Reads the old `divisions` collection ({key, label}) and, for each label,
 * finds-or-creates a matching `teams` document (same name, empty roster —
 * membership is still a separate, manual step afterward). Then backfills:
 *   - projects.teamIds  from projects.divisions   (array of keys -> team ids)
 *   - tasks.teamId      from tasks.division        (single key -> team id)
 *
 * Purely additive: the old `divisions` collection and the old
 * `divisions`/`division` fields on projects/tasks are left untouched, so
 * this is safe to re-run and easy to reason about if something looks off.
 *
 *   node --env-file=.env.local scripts/migrate-divisions-to-teams.mjs
 */
import { MongoClient, ObjectId } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "finesssepm";
if (!uri) {
  console.error("MONGODB_URI is not set. Run with --env-file=.env.local");
  process.exit(1);
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
try {
  await client.connect();
  const db = client.db(dbName);
  await db.command({ ping: 1 });
  console.log(`Connected to ${dbName}.\n`);

  const divisions = db.collection("divisions");
  const teams = db.collection("teams");
  const projects = db.collection("projects");
  const tasks = db.collection("tasks");
  const now = new Date();

  const oldDivisions = await divisions.find({}).toArray();
  if (!oldDivisions.length) {
    console.log("No `divisions` collection (or it's empty) — nothing to migrate.");
    process.exit(0);
  }

  // key -> team ObjectId, find-or-create by name so re-running is idempotent.
  const keyToTeamId = new Map();
  for (const d of oldDivisions) {
    let team = await teams.findOne({ name: d.label });
    if (!team) {
      const res = await teams.insertOne({
        name: d.label,
        memberIds: [],
        order: d.order ?? 0,
        createdAt: now,
        updatedAt: now,
      });
      team = { _id: res.insertedId, name: d.label };
      console.log(`Created team "${d.label}"`);
    }
    keyToTeamId.set(d.key, team._id);
  }

  let projectsUpdated = 0;
  const projectDocs = await projects.find({ divisions: { $exists: true, $ne: [] } }).toArray();
  for (const p of projectDocs) {
    const teamIds = [...new Set((p.divisions || []).map((k) => keyToTeamId.get(k)).filter(Boolean))];
    if (!teamIds.length) continue;
    await projects.updateOne({ _id: p._id }, { $set: { teamIds, updatedAt: now } });
    projectsUpdated += 1;
  }

  let tasksUpdated = 0;
  const taskDocs = await tasks.find({ division: { $exists: true, $ne: null } }).toArray();
  for (const t of taskDocs) {
    const teamId = keyToTeamId.get(t.division);
    if (!teamId) continue;
    await tasks.updateOne({ _id: t._id }, { $set: { teamId, updatedAt: now } });
    tasksUpdated += 1;
  }

  console.log(`\nTeams mapped: ${keyToTeamId.size}`);
  console.log(`Projects updated: ${projectsUpdated} / ${projectDocs.length} had a division set`);
  console.log(`Tasks updated: ${tasksUpdated} / ${taskDocs.length} had a division set`);
  console.log("\nDone. The old `divisions` collection and divisions/division fields were left in place.");
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exit(1);
} finally {
  await client.close();
}
