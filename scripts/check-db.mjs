/**
 * MongoDB connectivity check + one-shot seed of system roles / onboarding
 * checklist / indexes. Safe to run repeatedly (upserts only).
 *
 *   node --env-file=.env.local scripts/check-db.mjs
 *
 * The app also seeds these automatically on the first sign-in; this just lets
 * you verify the connection and pre-populate.
 */
import { MongoClient } from "mongodb";
import { SYSTEM_ROLES } from "../src/lib/rbac-catalog.js";

const DEFAULT_ONBOARDING = {
  _id: "onboarding",
  steps: [
    { key: "account", title: "Sign in with your Workspace account", description: "Confirms SSO works for the new member.", auto: true },
    { key: "profile", title: "Complete profile & skill tags", description: "Name, title, timezone and skills.", auto: false },
    { key: "security", title: "Review authorized devices", description: "Check the sessions list and revoke anything unexpected.", auto: false },
    { key: "welcome", title: "Read the welcome guide", description: "Team norms and where things live.", auto: false, url: "" },
  ],
};

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
  console.log(`Connected to ${dbName}.`);

  const roles = db.collection("roles");
  const settings = db.collection("settings");
  const now = new Date();

  await Promise.all([
    roles.createIndex({ key: 1 }, { unique: true }),
    db.collection("invitations").createIndex({ token: 1 }, { unique: true, sparse: true }),
    db.collection("invitations").createIndex({ email: 1 }),
    db.collection("users").createIndex({ email: 1 }, { unique: true, sparse: true }),
    db.collection("sessions").createIndex({ userId: 1 }),
    db.collection("releaseVersions").createIndex({ version: 1 }, { unique: true }),
    db.collection("auditLogs").createIndex({ createdAt: -1 }),
  ]);

  for (const role of SYSTEM_ROLES) {
    await roles.updateOne(
      { key: role.key },
      { $setOnInsert: { ...role, createdAt: now, updatedAt: now } },
      { upsert: true },
    );
  }
  await settings.updateOne(
    { _id: DEFAULT_ONBOARDING._id },
    { $setOnInsert: { ...DEFAULT_ONBOARDING, updatedAt: now } },
    { upsert: true },
  );

  console.log("\nSeeded. Current state:");
  for (const name of ["users", "roles", "invitations", "sessions", "releaseVersions", "auditLogs"]) {
    const n = await db.collection(name).countDocuments().catch(() => 0);
    console.log(`  ${name.padEnd(16)} ${n}`);
  }
  const roleDocs = await roles.find({}).sort({ priority: -1 }).toArray();
  console.log("\nRoles:", roleDocs.map((r) => r.name).join(", "));
} catch (err) {
  console.error("Connection failed:", err.message);
  process.exit(1);
} finally {
  await client.close();
}
