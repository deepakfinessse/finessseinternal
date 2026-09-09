import { MongoClient } from "mongodb";

// Lazily create + connect a single client, memoised across HMR reloads in dev.
// The env check runs on first use (not at import) so `next build` doesn't need
// a live database.
let clientPromise;

export function getMongoClient() {
  if (clientPromise) return clientPromise;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Missing environment variable "MONGODB_URI"');
  }

  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = new MongoClient(uri).connect();
    }
    clientPromise = global._mongoClientPromise;
  } else {
    clientPromise = new MongoClient(uri).connect();
  }
  return clientPromise;
}

export async function getDb() {
  const client = await getMongoClient();
  return client.db(process.env.MONGODB_DB || "finesssepm");
}

export default getMongoClient;
