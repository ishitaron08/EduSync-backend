import mongoose from 'mongoose';
import 'dotenv/config';

async function runMigration() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("Error: MONGO_URI or MONGODB_URI is not set in .env");
    process.exit(1);
  }

  let totalUpdated = 0;
  let totalIndexes = 0;
  let totalSkipped = 0;

  try {
    await mongoose.connect(uri);
    const db = mongoose.connection.db;

    // Step 1 - Add `term` field to timetables
    const timetablesCollection = db.collection('timetables');
    const ttUpdateResult = await timetablesCollection.updateMany(
      { term: { $exists: false } },
      { $set: { term: "fall" } }
    );
    if (ttUpdateResult.modifiedCount > 0) {
      console.log(`[OK] ${ttUpdateResult.modifiedCount} timetable documents updated with default term "fall"`);
      totalUpdated += ttUpdateResult.modifiedCount;
    } else {
      console.log("[SKIP] all timetables already have a term field");
      totalSkipped++;
    }

    // Step 2 - Fix the timetables unique index
    try {
      const ttIndexes = await timetablesCollection.indexes();
      
      // a. Check if { student: 1, year: 1 } unique index exists
      const oldIndex = ttIndexes.find(idx => idx.key.student === 1 && idx.key.year === 1 && Object.keys(idx.key).length === 2);
      if (oldIndex) {
        await timetablesCollection.dropIndex(oldIndex.name);
        console.log("[OK] dropped old index { student, year }");
      } else {
        console.log("[SKIP] old index not found");
        totalSkipped++;
      }
      
      // b. Create { student: 1, term: 1, year: 1 } unique index
      const newIndexExists = ttIndexes.find(idx => idx.key.student === 1 && idx.key.term === 1 && idx.key.year === 1);
      if (newIndexExists) {
        console.log("[SKIP] new index already exists");
        totalSkipped++;
      } else {
        await timetablesCollection.createIndex({ student: 1, term: 1, year: 1 }, { unique: true });
        console.log("[OK] created new index { student, term, year }");
        totalIndexes++;
      }
    } catch (e) {
      // If collection doesn't exist yet, creating the index is fine
      await timetablesCollection.createIndex({ student: 1, term: 1, year: 1 }, { unique: true });
      console.log("[OK] created new index { student, term, year }");
      totalIndexes++;
    }

    // Step 3 - Add studentTasks V3 fields
    const studentTasksCollection = db.collection('studentTasks');
    const tasksUpdateResult = await studentTasksCollection.updateMany(
      { libraryTask: { $exists: false } },
      { $set: { libraryTask: null, mlScore: null, timelinessFactor: 1.0 } }
    );
    if (tasksUpdateResult.modifiedCount > 0) {
      console.log(`[OK] ${tasksUpdateResult.modifiedCount} studentTask documents backfilled`);
      totalUpdated += tasksUpdateResult.modifiedCount;
    } else {
      console.log("[SKIP] studentTasks already have V3 fields");
      totalSkipped++;
    }

    // TTL Indexes helper
    async function ensureTtlIndex(collectionName, fieldName, expireSeconds) {
      const coll = db.collection(collectionName);
      try {
        const indexes = await coll.indexes();
        const hasTtl = indexes.find(idx => idx.key[fieldName] === 1 && idx.expireAfterSeconds === expireSeconds);
        if (hasTtl) {
          console.log(`[SKIP] TTL index already exists on ${collectionName}`);
          totalSkipped++;
        } else {
          await coll.createIndex({ [fieldName]: 1 }, { expireAfterSeconds: expireSeconds });
          console.log(`[OK] TTL index created on ${collectionName}`);
          totalIndexes++;
        }
      } catch (e) {
        // Create if collection has no indexes / doesn't exist
        await coll.createIndex({ [fieldName]: 1 }, { expireAfterSeconds: expireSeconds });
        console.log(`[OK] TTL index created on ${collectionName}`);
        totalIndexes++;
      }
    }

    // Step 4 - Add TTL index on auditLogs.createdAt (90 days)
    await ensureTtlIndex('auditLogs', 'createdAt', 7776000);
    
    // Step 5 - Add TTL index on qrSessions.expiresAt (30 days)
    await ensureTtlIndex('qrSessions', 'expiresAt', 2592000);
    
    // Step 6 - Add TTL index on notifications.createdAt (90 days)
    await ensureTtlIndex('notifications', 'createdAt', 7776000);
    
    // Step 7 - Add TTL index on leaderboardSnapshots.snapshotDate (90 days)
    await ensureTtlIndex('leaderboardSnapshots', 'snapshotDate', 7776000);
    
    // Step 8 - Add TTL index on goalProgressHistory.recordedAt (180 days)
    await ensureTtlIndex('goalProgressHistory', 'recordedAt', 15552000);

    // Step 9 - Print summary
    console.log("\nTotal documents updated:", totalUpdated);
    console.log("Total indexes created:  ", totalIndexes);
    console.log("Total steps skipped:    ", totalSkipped);
    console.log("Migration complete.");

    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
