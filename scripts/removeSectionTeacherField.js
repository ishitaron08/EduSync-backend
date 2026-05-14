/* eslint-disable no-console */
require("dotenv").config();
const mongoose = require("mongoose");

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("MONGODB_URI is required");
  process.exit(1);
}

async function dropIndexIfExists(collection, indexName) {
  const indexes = await collection.indexes();
  if (indexes.some((index) => index.name === indexName)) {
    await collection.dropIndex(indexName);
    console.log(`[OK] dropped old index ${indexName}`);
  }
}

async function main() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const sections = db.collection("sections");

  const result = await sections.updateMany(
    { teacher: { $exists: true } },
    { $unset: { teacher: "" } }
  );
  console.log(`[OK] removed teacher field from ${result.modifiedCount} section(s)`);

  await dropIndexIfExists(sections, "teacher_1");
  console.log("[OK] section schema cleanup complete");

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[ERROR] section teacher cleanup failed", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
