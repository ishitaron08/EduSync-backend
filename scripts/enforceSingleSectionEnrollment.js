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
  const enrollments = db.collection("enrollments");

  const duplicates = await enrollments
    .aggregate([
      { $group: { _id: "$student", count: { $sum: 1 }, enrollmentIds: { $push: "$_id" }, sectionIds: { $push: "$section" } } },
      { $match: { count: { $gt: 1 } } }
    ])
    .toArray();

  if (duplicates.length > 0) {
    console.error("[ERROR] Cannot enforce one-section-per-student while duplicates exist.");
    for (const duplicate of duplicates) {
      console.error(
        `student=${duplicate._id} enrollments=${duplicate.enrollmentIds.join(",")} sections=${duplicate.sectionIds.join(",")}`
      );
    }
    console.error("Remove the extra enrollment(s), then run this migration again.");
    process.exit(1);
  }

  await dropIndexIfExists(enrollments, "student_1");
  await enrollments.createIndex({ student: 1 }, { unique: true, name: "student_1" });
  await enrollments.createIndex({ section: 1 }, { name: "section_1" });
  console.log("[OK] ensured each student can be enrolled in only one section");

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[ERROR] enrollment index migration failed", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
