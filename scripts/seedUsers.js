/* eslint-disable no-console */
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config();

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["admin", "teacher", "student"],
      required: true
    },
    learningGoal: { type: String },
    streak: { type: Number, default: 0 },
    rewardPoints: { type: Number, default: 0 },
    pointsBreakdown: {
      aiTasks: { type: Number, default: 0 },
      tests: { type: Number, default: 0 },
      streakBonuses: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

const timetableSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  year: { type: Number, required: true },
  slots: [
    {
      day: String,
      startTime: String,
      endTime: String,
      subject: String,
      className: String,
      room: String
    }
  ]
});

const User = mongoose.models.User || mongoose.model("User", userSchema);
const Timetable = mongoose.models.Timetable || mongoose.model("Timetable", timetableSchema);

const seedUsers = [
  {
    name: "Admin User",
    email: "admin@edusync.local",
    password: "Admin@12345",
    role: "admin"
  },
  {
    name: "Teacher User",
    email: "teacher@edusync.local",
    password: "Teacher@12345",
    role: "teacher"
  },
  {
    name: "John Smith",
    email: "john.smith@edusync.local",
    password: "Student@12345",
    role: "student"
  },
  {
    name: "Emma Johnson",
    email: "emma.johnson@edusync.local",
    password: "Student@12345",
    role: "student"
  },
  {
    name: "Michael Brown",
    email: "michael.brown@edusync.local",
    password: "Student@12345",
    role: "student"
  },
  {
    name: "Sarah Davis",
    email: "sarah.davis@edusync.local",
    password: "Student@12345",
    role: "student"
  },
  {
    name: "James Wilson",
    email: "james.wilson@edusync.local",
    password: "Student@12345",
    role: "student"
  },
  {
    name: "Emily Martinez",
    email: "emily.martinez@edusync.local",
    password: "Student@12345",
    role: "student"
  },
  {
    name: "Daniel Taylor",
    email: "daniel.taylor@edusync.local",
    password: "Student@12345",
    role: "student"
  },
  {
    name: "Olivia Anderson",
    email: "olivia.anderson@edusync.local",
    password: "Student@12345",
    role: "student"
  },
  {
    name: "William Thomas",
    email: "william.thomas@edusync.local",
    password: "Student@12345",
    role: "student"
  }
];

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing in environment");
  }

  await mongoose.connect(mongoUri);

  const studentIds = [];

  for (const user of seedUsers) {
    const hashedPassword = await bcrypt.hash(user.password, 10);
    const updated = await User.findOneAndUpdate(
      { email: user.email.toLowerCase() },
      {
        $set: {
          name: user.name,
          email: user.email.toLowerCase(),
          password: hashedPassword,
          role: user.role
        },
        $setOnInsert: {
          rewardPoints: 100,
          streak: 5,
          learningGoal: user.role === "student" ? "Placement Preparation" : null,
          pointsBreakdown: { aiTasks: 60, tests: 40, streakBonuses: 0 }
        }
      },
      { upsert: true, new: true }
    );
    if (user.role === "student") {
      studentIds.push(updated._id);
    }
  }

  // Seed a dummy timetable for the first student
  if (studentIds.length > 0) {
    await Timetable.findOneAndUpdate(
      { student: studentIds[0] },
      {
        $set: {
          year: 2026,
          slots: [
            { day: "monday", startTime: "09:00", endTime: "10:00", subject: "Mathematics", className: "Year 3", room: "201" },
            { day: "monday", startTime: "11:00", endTime: "12:00", subject: "Physics", className: "Year 3", room: "302" },
            { day: "tuesday", startTime: "10:00", endTime: "11:30", subject: "Data Structures", className: "Year 3", room: "Lab 1" },
            { day: "wednesday", startTime: "14:00", endTime: "15:00", subject: "Algorithm Analysis", className: "Year 3", room: "205" }
          ]
        }
      },
      { upsert: true }
    );
  }

  console.log("Seed complete. Login users:");
  for (const user of seedUsers) {
    console.log(`- ${user.role}: ${user.email} / ${user.password}`);
  }
  console.log(`\nTotal students created: ${studentIds.length}`);
}

run()
  .catch((error) => {
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
