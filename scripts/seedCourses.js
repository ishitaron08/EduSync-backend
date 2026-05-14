/* eslint-disable no-console */
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config();

const courseSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    moderationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      required: true
    }
  },
  { timestamps: true, collection: "courses" }
);

courseSchema.index({ code: 1 }, { unique: true });
courseSchema.index({ moderationStatus: 1, createdAt: -1 });

const Course = mongoose.models.Course || mongoose.model("Course", courseSchema);

/**
 * Course catalog represents academic programs / engineering branches
 * (not individual subjects). `code` is the short department tag used
 * across the app; `name` is the human-readable program name.
 */
const seedCourses = [
  {
    code: "CSE",
    name: "Computer Science and Engineering",
    description: "Four-year undergraduate program covering programming, algorithms, systems, databases, networks, AI, and software engineering.",
    isActive: true,
    moderationStatus: "approved"
  },
  {
    code: "IT",
    name: "Information Technology",
    description: "Program focused on applied computing, web and enterprise systems, cloud infrastructure, cybersecurity, and IT service management.",
    isActive: true,
    moderationStatus: "approved"
  },
  {
    code: "AIML",
    name: "Artificial Intelligence and Machine Learning",
    description: "Specialization in machine learning, deep learning, natural language processing, computer vision, and applied AI systems.",
    isActive: true,
    moderationStatus: "approved"
  },
  {
    code: "DS",
    name: "Data Science",
    description: "Program combining statistics, data engineering, machine learning, and visualization to derive insight from large-scale datasets.",
    isActive: true,
    moderationStatus: "approved"
  },
  {
    code: "ECE",
    name: "Electronics and Communication Engineering",
    description: "Study of analog and digital electronics, signal processing, VLSI, embedded systems, and wireless communication.",
    isActive: true,
    moderationStatus: "approved"
  },
  {
    code: "EEE",
    name: "Electrical and Electronics Engineering",
    description: "Power systems, control engineering, electrical machines, power electronics, and renewable energy integration.",
    isActive: true,
    moderationStatus: "approved"
  },
  {
    code: "ME",
    name: "Mechanical Engineering",
    description: "Thermodynamics, fluid mechanics, manufacturing, design of machines, CAD/CAM, robotics, and automotive systems.",
    isActive: true,
    moderationStatus: "approved"
  },
  {
    code: "CE",
    name: "Civil Engineering",
    description: "Structural analysis, geotechnics, transportation, environmental engineering, construction management, and surveying.",
    isActive: true,
    moderationStatus: "approved"
  },
  {
    code: "BT",
    name: "Biotechnology",
    description: "Molecular biology, genetic engineering, bioprocess engineering, bioinformatics, and applications in health and agriculture.",
    isActive: true,
    moderationStatus: "approved"
  },
  {
    code: "CHE",
    name: "Chemical Engineering",
    description: "Chemical process design, reaction engineering, transport phenomena, petrochemicals, and sustainable process technology.",
    isActive: true,
    moderationStatus: "pending"
  },
  {
    code: "AE",
    name: "Aerospace Engineering",
    description: "Aerodynamics, propulsion, flight mechanics, aerospace structures, and avionics for aircraft and spacecraft systems.",
    isActive: false,
    moderationStatus: "rejected"
  }
];

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing in environment");
  }

  await mongoose.connect(mongoUri);

  console.log("Connected to MongoDB. Seeding courses...\n");

  let created = 0;
  let updated = 0;

  for (const course of seedCourses) {
    const result = await Course.findOneAndUpdate(
      { code: course.code },
      { $set: course },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (result.createdAt.getTime() === result.updatedAt.getTime()) {
      created++;
    } else {
      updated++;
    }
  }

  // Prune any legacy course documents whose code is no longer in the catalog.
  // This keeps the collection aligned with the current seed definition when
  // codes change (for example the previous subject-based codes like CS101).
  const catalogCodes = seedCourses.map((c) => c.code);
  const pruneResult = await Course.deleteMany({ code: { $nin: catalogCodes } });

  const total = await Course.countDocuments();

  console.log("Course seeding complete!");
  console.log(`- Created: ${created}`);
  console.log(`- Updated: ${updated}`);
  console.log(`- Removed (stale): ${pruneResult.deletedCount ?? 0}`);
  console.log(`- Total courses in database: ${total}`);
  console.log("\nSeeded courses:");
  for (const course of seedCourses) {
    const status = course.isActive ? "active" : "inactive";
    const mod = course.moderationStatus;
    console.log(`  [${course.code}] ${course.name} (${status}, ${mod})`);
  }
}

run()
  .catch((error) => {
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
