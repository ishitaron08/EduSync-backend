/**
 * Quick utility to list seeded user emails so you can log in.
 * Usage: node scripts/listSeededUsers.js
 */
const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const users = await db
    .collection("users")
    .find({}, { projection: { name: 1, email: 1, role: 1 } })
    .sort({ role: 1, name: 1 })
    .toArray();

  console.log("\n=== SEEDED USERS ===\n");
  console.log("ADMINS:");
  users.filter(u => u.role === "admin").forEach(u => console.log(`  ${u.email}  (${u.name})  | Password: Admin@12345`));
  console.log("\nTEACHERS:");
  users.filter(u => u.role === "teacher").forEach(u => console.log(`  ${u.email}  (${u.name})  | Password: Teacher@12345`));
  console.log("\nSTUDENTS (first 10):");
  users.filter(u => u.role === "student").slice(0, 10).forEach(u => console.log(`  ${u.email}  (${u.name})  | Password: Student@12345`));

  const studentCount = users.filter(u => u.role === "student").length;
  if (studentCount > 10) console.log(`  ... and ${studentCount - 10} more students`);

  console.log("\n");
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
