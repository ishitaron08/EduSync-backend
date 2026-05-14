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
  const timetables = db.collection("timetables");

  const sectionIdBackfill = await timetables.updateMany(
    { section: { $exists: false }, sectionId: { $exists: true, $ne: null } },
    [{ $set: { section: "$sectionId", term: { $ifNull: ["$term", "fall"] } } }]
  );
  console.log(`[OK] backfilled section from sectionId on ${sectionIdBackfill.modifiedCount} timetable(s)`);

  const termBackfill = await timetables.updateMany(
    { section: { $exists: true, $ne: null }, term: { $exists: false } },
    { $set: { term: "fall" } }
  );
  console.log(`[OK] backfilled default term on ${termBackfill.modifiedCount} timetable(s)`);

  const cleanup = await timetables.updateMany(
    { section: { $exists: true, $ne: null } },
    { $unset: { sectionId: "", student: "" } }
  );
  console.log(`[OK] removed legacy sectionId/student fields from ${cleanup.modifiedCount} section timetable(s)`);

  await dropIndexIfExists(timetables, "year_1_student_1");
  await dropIndexIfExists(timetables, "student_1_year_1");
  await dropIndexIfExists(timetables, "student_1_term_1_year_1");

  await timetables.createIndex(
    { section: 1, term: 1, year: 1 },
    {
      unique: true,
      partialFilterExpression: { section: { $exists: true } },
      name: "section_1_term_1_year_1"
    }
  );
  await timetables.createIndex({ "slots.teacher": 1 }, { name: "slots.teacher_1" });
  console.log("[OK] ensured section timetable indexes");

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[ERROR] timetable schema migration failed", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
