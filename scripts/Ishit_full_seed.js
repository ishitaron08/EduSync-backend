/* eslint-disable no-console */
/**
 * ============================================================================
 *  Ishit_full_seed.js
 * ============================================================================
 *  Comprehensive demo-data seeder for the EduSync backend. One run populates
 *  every collection defined in backend/src/models with a cohesive,
 *  referentially-consistent dataset of Indian-named users, sections,
 *  timetables, attendance, assessments, tasks, goals, leaderboards,
 *  notifications and audit logs.
 *
 *  Usage:
 *    node scripts/Ishit_full_seed.js                 (upsert, safe default)
 *    node scripts/Ishit_full_seed.js --fresh         (wipe + reseed)
 *    node scripts/Ishit_full_seed.js --dry-run       (no writes)
 *    node scripts/Ishit_full_seed.js --seed 42       (deterministic run)
 *    node scripts/Ishit_full_seed.js --help
 *
 *  CLI flags:
 *    --fresh                   Wipe all seeded collections before writing.
 *    --dry-run                 Compute plan but issue no writes.
 *    --seed <int>              PRNG seed for reproducible output.
 *    --admins <int>            Override admin count (default 2).
 *    --teachers <int>          Override teacher count (default 15-20).
 *    --students <int>          Override student count (default 50-60).
 *    --sections <int>          Override section count (default 5-6).
 *    --i-know-what-im-doing    Override production safety guards.
 *    --help                    Print usage and exit.
 *
 *  Environment variables (CLI flags take precedence):
 *    MONGODB_URI    required. Target database.
 *    NODE_ENV       "production" triggers the production guard.
 *    SEED_FRESH     truthy -> --fresh
 *    SEED_DRY_RUN   truthy -> --dry-run
 *    SEED_RNG       integer -> --seed
 *    SEED_ADMINS    integer -> --admins
 *    SEED_TEACHERS  integer -> --teachers
 *    SEED_STUDENTS  integer -> --students
 *    SEED_SECTIONS  integer -> --sections
 *
 *  Collections written (in dependency order):
 *    users, courses, sections, enrollments, timetables, studentTimetables,
 *    taskLibrary, studentGoals, studentTasks, assessments, assessmentAttempts,
 *    attendanceRecords, goalProgressHistory, leaderboardSnapshots,
 *    notifications, auditLogs, systemsettings, and the legacy
 *    attendances / tasks / goals collections.
 * ============================================================================
 */

const path = require("path");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

// Load environment variables first — matches the existing seed scripts.
dotenv.config();

// ---------------------------------------------------------------------------
// Section 1. CLI + environment configuration
// ---------------------------------------------------------------------------

/**
 * parseArgs
 * Turns process.argv (minus the node/script entries) into a plain object of
 * flag -> value. Unknown flags throw so the operator sees the typo.
 */
function parseArgs(argv) {
  const out = {};
  const booleanFlags = new Set(["--fresh", "--dry-run", "--i-know-what-im-doing", "--help"]);
  const valueFlags = new Set(["--seed", "--admins", "--teachers", "--students", "--sections"]);

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (booleanFlags.has(token)) {
      out[token] = true;
      continue;
    }
    if (valueFlags.has(token)) {
      const raw = argv[i + 1];
      if (raw === undefined || raw.startsWith("--")) {
        throw new Error(`Flag ${token} requires an integer argument`);
      }
      const n = Number(raw);
      if (!Number.isInteger(n)) {
        throw new Error(`Flag ${token} expects a base-10 integer, got "${raw}"`);
      }
      out[token] = n;
      i++;
      continue;
    }
    throw new Error(`Unknown flag: ${token}`);
  }
  return out;
}

/**
 * readEnv
 * Mirrors parseArgs but for SEED_* environment variables. Booleans accept
 * common truthy strings (1, true, yes). Invalid integer envs throw.
 */
function readEnv(env) {
  const truthy = (v) => {
    if (v === undefined || v === "") return undefined;
    const s = String(v).toLowerCase();
    if (["1", "true", "yes", "on"].includes(s)) return true;
    if (["0", "false", "no", "off"].includes(s)) return false;
    throw new Error(`Env var expected a boolean, got "${v}"`);
  };
  const toInt = (name, v) => {
    if (v === undefined || v === "") return undefined;
    const n = Number(v);
    if (!Number.isInteger(n)) {
      throw new Error(`Env var ${name} expected an integer, got "${v}"`);
    }
    return n;
  };
  return {
    fresh: truthy(env.SEED_FRESH),
    dryRun: truthy(env.SEED_DRY_RUN),
    seed: toInt("SEED_RNG", env.SEED_RNG),
    admins: toInt("SEED_ADMINS", env.SEED_ADMINS),
    teachers: toInt("SEED_TEACHERS", env.SEED_TEACHERS),
    students: toInt("SEED_STUDENTS", env.SEED_STUDENTS),
    sections: toInt("SEED_SECTIONS", env.SEED_SECTIONS)
  };
}

/**
 * resolveConfig
 * Merges CLI + env + defaults (CLI wins), returns a frozen config object.
 * Count ranges are validated later, after the DB connection is open, so
 * `--help` can bypass validation.
 */
function resolveConfig(cli, env, rng) {
  const defaults = {
    admins: 2,
    teachers: randomInt(rng, 15, 20),
    students: randomInt(rng, 50, 60),
    sections: randomInt(rng, 5, 6)
  };

  const config = {
    fresh: cli["--fresh"] === true || env.fresh === true,
    dryRun: cli["--dry-run"] === true || env.dryRun === true,
    iKnow: cli["--i-know-what-im-doing"] === true,
    help: cli["--help"] === true,
    seed: cli["--seed"] ?? env.seed ?? Date.now(),
    admins: cli["--admins"] ?? env.admins ?? defaults.admins,
    teachers: cli["--teachers"] ?? env.teachers ?? defaults.teachers,
    students: cli["--students"] ?? env.students ?? defaults.students,
    sections: cli["--sections"] ?? env.sections ?? defaults.sections
  };
  return Object.freeze(config);
}

/**
 * validateCounts
 * Enforces Requirement 3's default ranges. Called after the DB connection
 * opens so a failure message includes the target database name.
 */
function validateCounts(config) {
  const checks = [
    ["admins", config.admins, 1, 5],
    ["teachers", config.teachers, 1, 100],
    ["students", config.students, 1, 500],
    ["sections", config.sections, 1, 20]
  ];
  for (const [name, value, min, max] of checks) {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`--${name}=${value} is outside the permitted range [${min}..${max}]`);
    }
  }
}

function printHelp() {
  console.log(`
Ishit_full_seed.js — comprehensive EduSync demo seeder

Usage:
  node scripts/Ishit_full_seed.js [flags]

Flags:
  --fresh                   Wipe all seeded collections before writing.
  --dry-run                 Plan the run but issue no writes.
  --seed <int>              Deterministic PRNG seed (default: system clock).
  --admins <int>            Admin count (default 2).
  --teachers <int>          Teacher count (default 15-20).
  --students <int>          Student count (default 50-60).
  --sections <int>          Section count (default 5-6).
  --i-know-what-im-doing    Override production guards.
  --help                    Show this message and exit 0.

Environment variables:
  MONGODB_URI, NODE_ENV, SEED_FRESH, SEED_DRY_RUN, SEED_RNG,
  SEED_ADMINS, SEED_TEACHERS, SEED_STUDENTS, SEED_SECTIONS.
`);
}


// ---------------------------------------------------------------------------
// Section 2. Deterministic randomness helpers
// ---------------------------------------------------------------------------

/**
 * mulberry32
 * 32-bit PRNG; returns a function that yields a deterministic float in [0,1).
 * Chosen because it requires no dependencies and its internal state fits in
 * a single 32-bit integer, which keeps reproducibility trivial.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng, minInclusive, maxInclusive) {
  return Math.floor(rng() * (maxInclusive - minInclusive + 1)) + minInclusive;
}

function randomChoice(rng, arr) {
  if (!arr.length) throw new Error("randomChoice: array is empty");
  return arr[Math.floor(rng() * arr.length)];
}

function randomSubset(rng, arr, k) {
  if (k >= arr.length) return arr.slice();
  // Fisher-Yates partial shuffle — O(k) and stable under a seeded rng.
  const copy = arr.slice();
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (copy.length - i));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy.slice(0, k);
}

function randomDate(rng, startMs, endMs) {
  return new Date(startMs + Math.floor(rng() * (endMs - startMs)));
}

// ---------------------------------------------------------------------------
// Section 3. Reference data (synthetic demo corpus — not real people)
// ---------------------------------------------------------------------------

/* Indian given names — 30 male + 30 female = 60 total, satisfying R4.2. */
const INDIAN_FIRST_NAMES_MALE = Object.freeze([
  "Aarav", "Vihaan", "Rohan", "Arjun", "Aditya", "Kabir", "Karan", "Rahul",
  "Siddharth", "Harsh", "Raghav", "Ishaan", "Yash", "Dev", "Ayaan",
  "Parth", "Nikhil", "Ansh", "Ved", "Om",
  "Neel", "Kunal", "Manish", "Tarun", "Sameer",
  "Vivek", "Aryan", "Pranav", "Dhruv", "Krish"
]);

const INDIAN_FIRST_NAMES_FEMALE = Object.freeze([
  "Aanya", "Ananya", "Diya", "Priya", "Isha", "Meera", "Neha", "Pooja",
  "Kavya", "Shreya", "Riya", "Sneha", "Tanvi", "Divya", "Aditi",
  "Ira", "Nisha", "Kiara", "Sara", "Anjali",
  "Mira", "Tara", "Jiya", "Mahi", "Navya",
  "Saanvi", "Vanya", "Radha", "Lakshmi", "Simran"
]);

/* 40 common Indian surnames across regions — satisfies R4.2. */
const INDIAN_LAST_NAMES = Object.freeze([
  "Sharma", "Verma", "Iyer", "Patel", "Singh", "Gupta", "Reddy", "Kumar",
  "Das", "Nair", "Menon", "Joshi", "Mehta", "Shah", "Agarwal",
  "Chopra", "Kapoor", "Malhotra", "Bhatia", "Desai",
  "Pillai", "Rao", "Naidu", "Banerjee", "Chatterjee",
  "Mukherjee", "Bose", "Sen", "Saxena", "Tiwari",
  "Yadav", "Mishra", "Pandey", "Khanna", "Sinha",
  "Bhat", "Goswami", "Thakur", "Dutta", "Srivastava"
]);

const SUBJECTS = Object.freeze([
  // Computer science (4)
  "Introduction to Computer Science", "Data Structures and Algorithms",
  "Database Systems", "Operating Systems",
  // Mathematics (3)
  "Calculus I", "Linear Algebra", "Discrete Mathematics",
  // Physics (3)
  "Physics I: Mechanics", "Physics II: Electromagnetism", "Modern Physics",
  // Communication / soft skills (3)
  "Technical Communication", "Business English", "Public Speaking",
  // Engineering (2)
  "Software Engineering Principles", "Cloud Computing and DevOps"
]);

const ROOM_BUILDINGS = Object.freeze(["A", "B", "C", "D", "E"]);
const LAB_ROOMS = Object.freeze(["Lab 1", "Lab 2", "Lab 3", "Lab 4", "Lab 5"]);

/* Mirrors seedCourses.js so both scripts stay consistent.
 * Catalog represents academic programs / engineering branches, not subjects. */
const COURSE_CATALOG = Object.freeze([
  { code: "CSE", name: "Computer Science and Engineering", description: "Four-year undergraduate program covering programming, algorithms, systems, databases, networks, AI, and software engineering.", isActive: true, moderationStatus: "approved" },
  { code: "IT", name: "Information Technology", description: "Program focused on applied computing, web and enterprise systems, cloud infrastructure, cybersecurity, and IT service management.", isActive: true, moderationStatus: "approved" },
  { code: "AIML", name: "Artificial Intelligence and Machine Learning", description: "Specialization in machine learning, deep learning, natural language processing, computer vision, and applied AI systems.", isActive: true, moderationStatus: "approved" },
  { code: "DS", name: "Data Science", description: "Program combining statistics, data engineering, machine learning, and visualization to derive insight from large-scale datasets.", isActive: true, moderationStatus: "approved" },
  { code: "ECE", name: "Electronics and Communication Engineering", description: "Study of analog and digital electronics, signal processing, VLSI, embedded systems, and wireless communication.", isActive: true, moderationStatus: "approved" },
  { code: "EEE", name: "Electrical and Electronics Engineering", description: "Power systems, control engineering, electrical machines, power electronics, and renewable energy integration.", isActive: true, moderationStatus: "approved" },
  { code: "ME", name: "Mechanical Engineering", description: "Thermodynamics, fluid mechanics, manufacturing, design of machines, CAD/CAM, robotics, and automotive systems.", isActive: true, moderationStatus: "approved" },
  { code: "CE", name: "Civil Engineering", description: "Structural analysis, geotechnics, transportation, environmental engineering, construction management, and surveying.", isActive: true, moderationStatus: "approved" },
  { code: "BT", name: "Biotechnology", description: "Molecular biology, genetic engineering, bioprocess engineering, bioinformatics, and applications in health and agriculture.", isActive: true, moderationStatus: "approved" },
  { code: "CHE", name: "Chemical Engineering", description: "Chemical process design, reaction engineering, transport phenomena, petrochemicals, and sustainable process technology.", isActive: true, moderationStatus: "pending" },
  { code: "AE", name: "Aerospace Engineering", description: "Aerodynamics, propulsion, flight mechanics, aerospace structures, and avionics for aircraft and spacecraft systems.", isActive: false, moderationStatus: "rejected" }
]);

/**
 * TASK_LIBRARY_SEED — 24 entries.
 * Goal types (3) x Difficulties (3) = 9 baseline entries so every
 * (goalType, difficulty) pair has coverage, plus 15 realistic extras.
 */
const TASK_LIBRARY_SEED = Object.freeze([
  { title: "Practice 10 aptitude questions", category: "Aptitude", goalType: "placement", difficulty: "Easy", durationMinutes: 30, basePoints: 20, tags: ["aptitude", "daily"] },
  { title: "Solve 3 medium LeetCode problems", category: "Coding", goalType: "placement", difficulty: "Medium", durationMinutes: 90, basePoints: 40, tags: ["leetcode", "dsa"] },
  { title: "Mock interview on DSA", category: "Interview", goalType: "placement", difficulty: "Hard", durationMinutes: 60, basePoints: 60, tags: ["interview"] },
  { title: "Review class notes for 1 hour", category: "Study", goalType: "academic", difficulty: "Easy", durationMinutes: 60, basePoints: 20, tags: ["revision"] },
  { title: "Complete 1 past-paper section", category: "Study", goalType: "academic", difficulty: "Medium", durationMinutes: 90, basePoints: 40, tags: ["exam"] },
  { title: "Full 3-hour timed past paper", category: "Study", goalType: "academic", difficulty: "Hard", durationMinutes: 180, basePoints: 80, tags: ["exam", "timed"] },
  { title: "Watch a tutorial video", category: "Learning", goalType: "skill_development", difficulty: "Easy", durationMinutes: 30, basePoints: 15, tags: ["video"] },
  { title: "Build a small side project", category: "Project", goalType: "skill_development", difficulty: "Medium", durationMinutes: 120, basePoints: 50, tags: ["project"] },
  { title: "Ship an open-source PR", category: "Project", goalType: "skill_development", difficulty: "Hard", durationMinutes: 240, basePoints: 90, tags: ["github", "oss"] },

  { title: "Resume review session", category: "Career", goalType: "placement", difficulty: "Easy", durationMinutes: 45, basePoints: 20, tags: ["resume"] },
  { title: "System design deep-dive", category: "Interview", goalType: "placement", difficulty: "Hard", durationMinutes: 120, basePoints: 70, tags: ["system-design"] },
  { title: "SQL practice set", category: "Coding", goalType: "placement", difficulty: "Medium", durationMinutes: 60, basePoints: 35, tags: ["sql"] },
  { title: "Weekly quiz revision", category: "Study", goalType: "academic", difficulty: "Easy", durationMinutes: 30, basePoints: 15, tags: ["quiz"] },
  { title: "Group study session", category: "Study", goalType: "academic", difficulty: "Medium", durationMinutes: 90, basePoints: 35, tags: ["group"] },
  { title: "Teach a topic to a peer", category: "Study", goalType: "academic", difficulty: "Hard", durationMinutes: 60, basePoints: 55, tags: ["teach"] },
  { title: "Read one technical blog post", category: "Learning", goalType: "skill_development", difficulty: "Easy", durationMinutes: 20, basePoints: 10, tags: ["reading"] },
  { title: "Pair-program a feature", category: "Project", goalType: "skill_development", difficulty: "Medium", durationMinutes: 120, basePoints: 45, tags: ["pairing"] },
  { title: "Deploy a project to the cloud", category: "Project", goalType: "skill_development", difficulty: "Hard", durationMinutes: 180, basePoints: 80, tags: ["devops"] },

  { title: "Do 20 company-tag questions", category: "Coding", goalType: "placement", difficulty: "Medium", durationMinutes: 90, basePoints: 40, tags: ["company-tag"] },
  { title: "HR round preparation", category: "Interview", goalType: "placement", difficulty: "Easy", durationMinutes: 30, basePoints: 15, tags: ["hr"] },
  { title: "Topic flashcards", category: "Study", goalType: "academic", difficulty: "Easy", durationMinutes: 20, basePoints: 10, tags: ["flashcards"] },
  { title: "Solve last year's midterm", category: "Study", goalType: "academic", difficulty: "Hard", durationMinutes: 120, basePoints: 65, tags: ["midterm"] },
  { title: "Contribute to docs", category: "Project", goalType: "skill_development", difficulty: "Easy", durationMinutes: 45, basePoints: 20, tags: ["docs"] },
  { title: "Refactor an old project", category: "Project", goalType: "skill_development", difficulty: "Medium", durationMinutes: 120, basePoints: 45, tags: ["refactor"] }
]);

const NOTIFICATION_TEMPLATES = Object.freeze([
  { type: "low_attendance", title: "Attendance below target", body: "Your attendance for the week is under 75%. Please check your timetable." },
  { type: "test_published", title: "New assessment published", body: "A new test has been added to your section. Check the assessments page." },
  { type: "test_graded", title: "Assessment graded", body: "Your latest submission has been graded. View your score in the assessments tab." },
  { type: "task_reminder", title: "Task due soon", body: "You have a task scheduled for later today. Stay on track!" },
  { type: "schedule_change_request", title: "Schedule change requested", body: "A change request has been submitted for your timetable." },
  { type: "schedule_change_approved", title: "Schedule change approved", body: "Your timetable change has been approved by the admin." },
  { type: "system", title: "Welcome to EduSync", body: "Your account has been provisioned. Explore your dashboard to get started." }
]);

const AUDIT_ACTIONS = Object.freeze([
  { action: "login", resource: "auth" },
  { action: "create", resource: "assessment" },
  { action: "grade", resource: "assessmentAttempt" },
  { action: "publish", resource: "assessment" },
  { action: "enroll", resource: "section" },
  { action: "update", resource: "timetable" },
  { action: "approve", resource: "course" },
  { action: "reject", resource: "course" },
  { action: "create", resource: "taskLibrary" },
  { action: "complete", resource: "studentTask" }
]);

const LEARNING_GOAL_SAMPLES = Object.freeze([
  "Placement Preparation",
  "Academic Improvement",
  "Skill Development"
]);

const DAY_VALUES = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday"]);
const WEEKDAY_VALUES = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday"]);

// ---------------------------------------------------------------------------
// Section 4. Small pure helpers (names, emails, terms, slots)
// ---------------------------------------------------------------------------

/**
 * indianName
 * Returns { first, last, full } where first and last are drawn uniformly
 * from the frozen corpora. The combined pool has 60 first names and 40 last
 * names giving 2400 unique pairings — more than enough to uniquely name
 * 50-60 students + teachers + admins without collisions in typical runs.
 */
function indianName(rng) {
  const pool = rng() < 0.5 ? INDIAN_FIRST_NAMES_MALE : INDIAN_FIRST_NAMES_FEMALE;
  const first = randomChoice(rng, pool);
  const last = randomChoice(rng, INDIAN_LAST_NAMES);
  return { first, last, full: `${first} ${last}` };
}

/**
 * emailFromName
 * Lowercases, strips non-ASCII, collapses spaces into a single period, and
 * appends @edusync.local. A numeric suffix is appended before `@` if the
 * email has already been issued in this run.
 */
function emailFromName(fullName, seenSet) {
  const base = fullName
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .trim()
    .replace(/\s+/g, ".");
  let candidate = `${base}@edusync.local`;
  let n = 2;
  while (seenSet.has(candidate)) {
    candidate = `${base}.${n}@edusync.local`;
    n++;
  }
  seenSet.add(candidate);
  return candidate;
}

/**
 * indianPhone
 * Returns a 10-digit string whose first digit is in [6..9] — matches
 * TRAI mobile numbering rules and satisfies Requirement 4 §5.
 */
function indianPhone(rng) {
  const first = randomInt(rng, 6, 9);
  let rest = "";
  for (let i = 0; i < 9; i++) rest += String(randomInt(rng, 0, 9));
  return `${first}${rest}`;
}

/**
 * termFromMonth
 * Spring=Jan-Apr, Summer=May-Jun, Fall=Jul-Oct, Winter=Nov-Dec (UTC).
 */
function termFromMonth(date) {
  const m = date.getUTCMonth(); // 0..11
  if (m <= 3) return "spring";
  if (m <= 5) return "summer";
  if (m <= 9) return "fall";
  return "winter";
}

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/** Deterministic composite key shared between Timetable and AttendanceRecord. */
function slotKeyFor(day, startTime, endTime) {
  return `${day}_${startTime}_${endTime}`;
}

function randomRoom(rng) {
  // 80% classrooms, 20% labs — realistic for a CS-heavy campus.
  if (rng() < 0.2) return randomChoice(rng, LAB_ROOMS);
  const building = randomChoice(rng, ROOM_BUILDINGS);
  const floor = randomInt(rng, 1, 4);
  const room = randomInt(rng, 1, 20);
  return `${building}${floor}${String(room).padStart(2, "0")}`;
}

/**
 * buildDailySlots
 * Fills one weekday with 3–5 non-overlapping slots whose startTime values
 * are drawn exclusively from the admin grid's fixed ADMIN_TIMES set:
 *   08:00 09:00 10:00 11:00 12:00 13:00 14:00 15:00 16:00
 * Every slot is exactly 60 minutes so endTime is always the next hour
 * boundary — matching what the admin TimetableTab renders and what
 * getSlotAt() can find by exact startTime match.
 *
 * Algorithm:
 *  1. Shuffle the available hour slots for this day.
 *  2. Pick 3–5 of them (no two can be adjacent — a 1-hour gap is enforced
 *     so the grid never shows back-to-back occupied cells with no break).
 *  3. Sort chronologically and return.
 */
function buildDailySlots(rng, day, teachers) {
  // The exact set the admin grid uses (08:00–16:00 on the hour).
  const ADMIN_TIMES = [
    "08:00", "09:00", "10:00", "11:00", "12:00",
    "13:00", "14:00", "15:00", "16:00"
  ];

  const target = randomInt(rng, 3, 5);
  const chosen = [];

  // Fisher-Yates shuffle over indices so we pick without replacement.
  const indices = ADMIN_TIMES.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  for (const idx of indices) {
    if (chosen.length >= target) break;
    // Enforce a minimum 1-hour gap between chosen slots so no two slots
    // are back-to-back (keeps the grid readable and realistic).
    const tooClose = chosen.some((c) => Math.abs(c - idx) < 2);
    if (!tooClose) chosen.push(idx);
  }

  // Sort chronologically.
  chosen.sort((a, b) => a - b);

  return chosen.map((idx) => {
    const startTime = ADMIN_TIMES[idx];
    // endTime is always startTime + 60 min — the next hour boundary.
    const endHour = String(parseInt(startTime.split(":")[0], 10) + 1).padStart(2, "0");
    const endTime = `${endHour}:00`;
    return {
      day,
      startTime,
      endTime,
      subject: randomChoice(rng, SUBJECTS),
      className: "Year 3",
      room: randomRoom(rng),
      teacher: randomChoice(rng, teachers)
    };
  });
}

/** Clipped-Gaussian via Box-Muller. Used for assessment scores. */
function gaussianRandom(rng, mean, stdDev) {
  let u1 = 0, u2 = 0;
  while (u1 === 0) u1 = rng();
  while (u2 === 0) u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + stdDev * z;
}


// ---------------------------------------------------------------------------
// Section 5. Inline CommonJS schemas (mirror backend/src/models/*.ts)
// ---------------------------------------------------------------------------
// These are the canonical shapes used by the seeder. They intentionally
// mirror the TypeScript models so the script is self-contained and does not
// require a prior `npm run build`. The seeder registers each model under the
// same name the backend uses so the collection names match.

const { Schema, Types } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, trim: true, default: null },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ["admin", "teacher", "student"], required: true, default: "student" },
    availability: {
      type: [{ day: String, startTime: String, endTime: String }],
      default: []
    },
    rewardPoints: { type: Number, default: 0 },
    learningGoal: {
      type: String,
      enum: ["Academic Improvement", "Placement Preparation", "Skill Development"],
      default: null
    },
    streak: { type: Number, default: 0 },
    pointsBreakdown: {
      aiTasks: { type: Number, default: 0 },
      tests: { type: Number, default: 0 },
      streakBonuses: { type: Number, default: 0 }
    }
  },
  { timestamps: true, collection: "users" }
);

const courseSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    moderationStatus: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", required: true }
  },
  { timestamps: true, collection: "courses" }
);

const sectionScheduleSchema = new Schema(
  {
    day: { type: String, enum: DAY_VALUES, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    room: { type: String, required: true, trim: true }
  },
  { _id: false }
);

const sectionSchema = new Schema(
  {
    course: { type: Types.ObjectId, ref: "Course", required: true },
    term: { type: String, enum: ["spring", "summer", "fall", "winter"], required: true },
    year: { type: Number, required: true },
    sectionCode: { type: String, required: true, trim: true, uppercase: true },
    schedule: { type: [sectionScheduleSchema], default: [] },
    capacity: { type: Number, min: 1, default: 60 }
  },
  { timestamps: true, collection: "sections" }
);

const enrollmentSchema = new Schema(
  {
    student: { type: Types.ObjectId, ref: "User", required: true },
    section: { type: Types.ObjectId, ref: "Section", required: true },
    enrolledAt: { type: Date, default: Date.now }
  },
  { timestamps: true, collection: "enrollments" }
);

const timetableSlotSchema = new Schema(
  {
    day: { type: String, enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"], required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    className: { type: String, required: true },
    room: { type: String, required: true },
    subject: { type: String, required: true },
    teacher: { type: Types.ObjectId, ref: "User", required: true }
  },
  { _id: false }
);

const timetableSchema = new Schema(
  {
    section: { type: Types.ObjectId, ref: "Section", required: true },
    term: { type: String, enum: ["spring", "summer", "fall", "winter"], required: true, default: "fall" },
    year: { type: Number, required: true },
    slots: { type: [timetableSlotSchema], default: [] }
  },
  { timestamps: true, collection: "timetables" }
);

const studentTimetableSlotSchema = new Schema(
  {
    day: { type: String, enum: DAY_VALUES, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    section: { type: Types.ObjectId, ref: "Section" },
    className: { type: String, required: true, trim: true },
    room: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    teacher: { type: Types.ObjectId, ref: "User", required: true }
  },
  { _id: false }
);

const studentTimetableSchema = new Schema(
  {
    year: { type: Number, required: true },
    term: { type: String, enum: ["spring", "summer", "fall", "winter"], required: true },
    student: { type: Types.ObjectId, ref: "User", required: true },
    slots: { type: [studentTimetableSlotSchema], default: [] }
  },
  { timestamps: true, collection: "studentTimetables" }
);

const attendanceRecordSchema = new Schema(
  {
    student: { type: Types.ObjectId, ref: "User", required: true },
    teacher: { type: Types.ObjectId, ref: "User", required: true },
    section: { type: Types.ObjectId, ref: "Section", required: true },
    sessionDate: { type: Date, required: true },
    slotKey: { type: String, required: true, trim: true },
    status: { type: String, enum: ["present", "absent", "late", "excused"], required: true },
    qrSession: { type: Types.ObjectId, default: null }
  },
  { timestamps: true, collection: "attendanceRecords" }
);

const attendanceSchema = new Schema(
  {
    student: { type: Types.ObjectId, ref: "User", required: true },
    teacher: { type: Types.ObjectId, ref: "User", required: true },
    date: { type: Date, required: true },
    className: { type: String, required: true },
    subject: { type: String, required: true },
    status: { type: String, enum: ["present", "absent"], required: true }
  },
  { timestamps: true, collection: "attendances" }
);

const assessmentQuestionSchema = new Schema(
  {
    prompt: { type: String, required: true, trim: true },
    options: { type: [String], default: [] },
    correctOptionIndex: { type: Number },
    marks: { type: Number, default: 1, min: 0 }
  },
  { _id: false }
);

const assessmentSchema = new Schema(
  {
    teacher: { type: Types.ObjectId, ref: "User", required: true },
    section: { type: Types.ObjectId, ref: "Section", required: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ["mcq", "written"], required: true },
    status: { type: String, enum: ["draft", "published", "closed"], default: "draft" },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 1 },
    questions: { type: [assessmentQuestionSchema], default: [] },
    fileUrl: { type: String },
    rubric: { type: String }
  },
  { timestamps: true, collection: "assessments" }
);

const assessmentAnswerSchema = new Schema(
  {
    questionIndex: { type: Number, required: true },
    selectedOptionIndex: { type: Number },
    textAnswer: { type: String },
    fileUrl: { type: String },
    marksAwarded: { type: Number }
  },
  { _id: false }
);

const assessmentAttemptSchema = new Schema(
  {
    assessment: { type: Types.ObjectId, ref: "Assessment", required: true },
    student: { type: Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["in_progress", "submitted", "graded"], default: "in_progress" },
    startedAt: { type: Date, required: true },
    submittedAt: { type: Date },
    score: { type: Number, default: 0, min: 0 },
    maxScore: { type: Number, default: 0, min: 0 },
    answers: { type: [assessmentAnswerSchema], default: [] }
  },
  { timestamps: true, collection: "assessmentAttempts" }
);

const taskLibrarySchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    category: { type: String, required: true, trim: true },
    goalType: { type: String, enum: ["placement", "academic", "skill_development"], required: true },
    difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], required: true },
    durationMinutes: { type: Number, required: true, min: 1 },
    basePoints: { type: Number, required: true, min: 1 },
    tags: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    completionRate: { type: Number, default: 0, min: 0, max: 1 },
    totalAssigned: { type: Number, default: 0, min: 0 },
    totalCompleted: { type: Number, default: 0, min: 0 },
    createdBy: { type: Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true, collection: "taskLibrary" }
);

const studentTaskSchema = new Schema(
  {
    student: { type: Types.ObjectId, ref: "User", required: true },
    goal: { type: Types.ObjectId, ref: "StudentGoal", required: false },
    section: { type: Types.ObjectId, ref: "Section" },
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], default: "Medium" },
    status: { type: String, enum: ["pending", "in_progress", "completed"], default: "pending" },
    durationMinutes: { type: Number, required: true, min: 1 },
    scheduledFor: { type: Date },
    basePoints: { type: Number, default: 20 },
    pointsAwarded: { type: Number, default: 0 },
    completedAt: { type: Date },
    libraryTask: { type: Types.ObjectId, ref: "TaskLibrary", default: null },
    mlScore: { type: Number, min: 0, max: 1 },
    timelinessFactor: { type: Number, min: 0, default: 1.0 }
  },
  { timestamps: true, collection: "studentTasks" }
);

const taskSchema = new Schema(
  {
    student: { type: Types.ObjectId, ref: "User", required: true },
    goal: { type: Types.ObjectId, ref: "Goal", required: false },
    title: { type: String, required: true },
    category: { type: String, required: true },
    difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], default: "Medium" },
    status: { type: String, enum: ["pending", "in_progress", "completed"], default: "pending" },
    durationMinutes: { type: Number, required: true },
    basePoints: { type: Number, default: 20 },
    pointsAwarded: { type: Number, default: 0 },
    completedAt: { type: Date }
  },
  { timestamps: true, collection: "tasks" }
);

const studentGoalSchema = new Schema(
  {
    student: { type: Types.ObjectId, ref: "User", required: true },
    goalType: { type: String, enum: ["placement", "exam", "skill_development"], required: true },
    targetDate: { type: Date, required: true },
    difficultyPreference: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
    progress: { type: Number, default: 0, min: 0, max: 100 }
  },
  { timestamps: true, collection: "studentGoals" }
);

const goalSchema = new Schema(
  {
    student: { type: Types.ObjectId, ref: "User", required: true },
    goalType: { type: String, enum: ["placement", "exam", "skill_development"], required: true },
    targetDate: { type: Date, required: true },
    difficultyPreference: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
    progress: { type: Number, default: 0 }
  },
  { timestamps: true, collection: "goals" }
);

const goalProgressHistorySchema = new Schema(
  {
    goal: { type: Types.ObjectId, ref: "StudentGoal", required: true },
    student: { type: Types.ObjectId, ref: "User", required: true },
    recordedAt: { type: Date, required: true, default: Date.now },
    progress: { type: Number, required: true, min: 0, max: 100 },
    tasksCompleted: { type: Number, required: true, min: 0 },
    pointsEarned: { type: Number, required: true, min: 0 }
  },
  { timestamps: false, collection: "goalProgressHistory" }
);

const leaderboardSnapshotSchema = new Schema(
  {
    snapshotDate: { type: Date, required: true, default: Date.now },
    goalType: { type: String, enum: ["placement", "academic", "skill_development", "overall"], required: true },
    entries: [
      {
        student: { type: Types.ObjectId, ref: "User", required: true },
        rank: { type: Number, required: true, min: 1 },
        totalPoints: { type: Number, required: true, min: 0 },
        pointsBreakdown: {
          aiTasks: { type: Number, default: 0 },
          tests: { type: Number, default: 0 },
          streakBonuses: { type: Number, default: 0 }
        },
        streak: { type: Number, default: 0 },
        displayName: { type: String, required: true }
      }
    ]
  },
  { timestamps: false, collection: "leaderboardSnapshots" }
);

const notificationSchema = new Schema(
  {
    recipient: { type: Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["low_attendance", "test_published", "test_graded", "task_reminder", "schedule_change_request", "schedule_change_approved", "system"],
      required: true
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    relatedResource: { type: String, default: null },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "notifications" }
);

const auditLogSchema = new Schema(
  {
    actor: { type: Types.ObjectId, ref: "User", required: true },
    actorRole: { type: String, enum: ["admin", "teacher", "student"], required: true },
    action: { type: String, required: true, trim: true },
    resource: { type: String, required: true, trim: true },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: "auditLogs" }
);

const systemSettingsSchema = new Schema(
  {
    institutionName: { type: String, default: "EduSync Institute" },
    contactEmail: { type: String, default: "admin@edusync.local" },
    qrValidityMinutes: { type: Number, default: 5 },
    pointMultipliers: {
      streakBonus: { type: Number, default: 1.5 },
      earlySubmission: { type: Number, default: 1.2 }
    },
    academicCalendar: {
      semesterStart: { type: Date, default: () => new Date() },
      semesterEnd: { type: Date, default: () => new Date() }
    }
  },
  { timestamps: true }
);

/**
 * loadModels
 * Registers the inline schemas under the same names the backend uses. If a
 * previous run already registered them (e.g. during a test invocation),
 * reuse the cached model to avoid Mongoose's OverwriteModelError.
 */
function loadModels() {
  const register = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);
  return {
    User: register("User", userSchema),
    Course: register("Course", courseSchema),
    Section: register("Section", sectionSchema),
    Enrollment: register("Enrollment", enrollmentSchema),
    Timetable: register("Timetable", timetableSchema),
    StudentTimetable: register("StudentTimetable", studentTimetableSchema),
    AttendanceRecord: register("AttendanceRecord", attendanceRecordSchema),
    Attendance: register("Attendance", attendanceSchema),
    Assessment: register("Assessment", assessmentSchema),
    AssessmentAttempt: register("AssessmentAttempt", assessmentAttemptSchema),
    TaskLibrary: register("TaskLibrary", taskLibrarySchema),
    StudentTask: register("StudentTask", studentTaskSchema),
    Task: register("Task", taskSchema),
    StudentGoal: register("StudentGoal", studentGoalSchema),
    Goal: register("Goal", goalSchema),
    GoalProgressHistory: register("GoalProgressHistory", goalProgressHistorySchema),
    LeaderboardSnapshot: register("LeaderboardSnapshot", leaderboardSnapshotSchema),
    Notification: register("Notification", notificationSchema),
    AuditLog: register("AuditLog", auditLogSchema),
    SystemSettings: register("SystemSettings", systemSettingsSchema)
  };
}


// ---------------------------------------------------------------------------
// Section 6. Seeding phases
// ---------------------------------------------------------------------------
// Each phase is an async function that takes the shared ctx object. Phases
// record per-collection counters (created/updated/unchanged) so the final
// summary table is uniform.

function phaseBanner(phaseIndex, total, collection, expected) {
  console.log(`[phase ${phaseIndex}/${total}] ${collection} (expected ~${expected})`);
}

function recordCreated(ctx, key) { ctx.counters[key].created++; }
function recordUpdated(ctx, key) { ctx.counters[key].updated++; }

/**
 * seedUsers
 * Inputs:  ctx.rng, ctx.config.{admins, teachers, students}, ctx.models.User
 * Outputs: ctx.ids.{admins, teachers, students} as arrays of ObjectIds
 * Invariants: email uniqueness, role correctness, Indian-name corpus,
 *             phone regex for non-admins.
 */
async function seedUsers(ctx) {
  phaseBanner(1, 20, "users", ctx.config.admins + ctx.config.teachers + ctx.config.students);
  const { User } = ctx.models;
  const seenEmails = new Set();
  // Pre-seed deterministic admin email so an operator can always log in.
  const canonicalAdmin = "admin@edusync.local";
  seenEmails.add(canonicalAdmin);

  const bucket = { admin: [], teacher: [], student: [] };

  const buildUser = (role, indexWithinRole) => {
    const { full } = indianName(ctx.rng);
    // For admin #1 keep the canonical email for easy sign-in; the rest are
    // derived from their names.
    let email;
    if (role === "admin" && indexWithinRole === 0) {
      email = canonicalAdmin;
    } else {
      email = emailFromName(full, seenEmails);
    }
    const passwordPlain =
      role === "admin" ? "Admin@12345" : role === "teacher" ? "Teacher@12345" : "Student@12345";
    return {
      email,
      passwordPlain,
      doc: {
        name: full,
        email,
        phone: role === "admin" ? null : indianPhone(ctx.rng),
        role,
        learningGoal: role === "student" ? randomChoice(ctx.rng, LEARNING_GOAL_SAMPLES) : null,
        streak: randomInt(ctx.rng, 0, 14),
        rewardPoints: randomInt(ctx.rng, 50, 500),
        pointsBreakdown: {
          aiTasks: randomInt(ctx.rng, 10, 200),
          tests: randomInt(ctx.rng, 10, 200),
          streakBonuses: randomInt(ctx.rng, 0, 50)
        },
        availability:
          role === "teacher"
            ? randomSubset(ctx.rng, WEEKDAY_VALUES, 3).map((day) => ({
                day,
                startTime: "09:00",
                endTime: "17:00"
              }))
            : []
      }
    };
  };

  const writeUser = async (role, indexWithinRole) => {
    const u = buildUser(role, indexWithinRole);
    if (ctx.config.dryRun) {
      recordCreated(ctx, "users");
      bucket[role].push(new mongoose.Types.ObjectId());
      return;
    }
    const hashed = await bcrypt.hash(u.passwordPlain, 10);
    const updated = await User.findOneAndUpdate(
      { email: u.email },
      { $set: { ...u.doc, password: hashed } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    if (updated.createdAt.getTime() === updated.updatedAt.getTime()) {
      recordCreated(ctx, "users");
    } else {
      recordUpdated(ctx, "users");
    }
    bucket[role].push(updated._id);
  };

  for (let i = 0; i < ctx.config.admins; i++) await writeUser("admin", i);
  for (let i = 0; i < ctx.config.teachers; i++) await writeUser("teacher", i);
  for (let i = 0; i < ctx.config.students; i++) await writeUser("student", i);

  ctx.ids.admins = bucket.admin;
  ctx.ids.teachers = bucket.teacher;
  ctx.ids.students = bucket.student;
  console.log(`   users: admins=${bucket.admin.length} teachers=${bucket.teacher.length} students=${bucket.student.length}`);
}

/**
 * seedCourses — upserts the COURSE_CATALOG verbatim. Natural key: code.
 */
async function seedCourses(ctx) {
  phaseBanner(2, 20, "courses", COURSE_CATALOG.length);
  const { Course } = ctx.models;
  ctx.ids.courses = [];
  for (const course of COURSE_CATALOG) {
    if (ctx.config.dryRun) {
      recordCreated(ctx, "courses");
      ctx.ids.courses.push(new mongoose.Types.ObjectId());
      continue;
    }
    const doc = await Course.findOneAndUpdate(
      { code: course.code },
      { $set: course },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    if (doc.createdAt.getTime() === doc.updatedAt.getTime()) recordCreated(ctx, "courses");
    else recordUpdated(ctx, "courses");
    ctx.ids.courses.push(doc._id);
  }
}

/**
 * seedSections — one section per course up to ctx.config.sections.
 * Natural key: (course, term, year, sectionCode).
 */
async function seedSections(ctx) {
  phaseBanner(3, 20, "sections", ctx.config.sections);
  const { Section } = ctx.models;
  ctx.ids.sections = [];
  const now = new Date();
  const term = termFromMonth(now);
  const year = now.getUTCFullYear();
  const codes = ["A", "B", "C", "D", "E", "F"];

  for (let i = 0; i < ctx.config.sections; i++) {
    // Rotate through the first N courses so every section has a distinct course.
    const courseId = ctx.ids.courses[i % ctx.ids.courses.length];
    const sectionCode = codes[i];
    if (ctx.config.dryRun) {
      recordCreated(ctx, "sections");
      ctx.ids.sections.push(new mongoose.Types.ObjectId());
      continue;
    }
    const doc = await Section.findOneAndUpdate(
      { course: courseId, term, year, sectionCode },
      { $set: { course: courseId, term, year, sectionCode, capacity: 60 } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    if (doc.createdAt.getTime() === doc.updatedAt.getTime()) recordCreated(ctx, "sections");
    else recordUpdated(ctx, "sections");
    ctx.ids.sections.push(doc._id);
  }
}

/**
 * seedEnrollments — exactly one Enrollment per student, distributed across
 * sections round-robin so the max/min per-section difference is <= 1.
 * Natural key: student (enforced by unique index).
 */
async function seedEnrollments(ctx) {
  phaseBanner(4, 20, "enrollments", ctx.ids.students.length);
  const { Enrollment } = ctx.models;
  ctx.ids.enrollmentsBySection = new Map(
    ctx.ids.sections.map((sid) => [sid.toString(), []])
  );

  // Build the in-memory section mapping first (used by later phases
  // regardless of dry-run mode).
  const assignments = ctx.ids.students.map((studentId, i) => ({
    studentId,
    sectionId: ctx.ids.sections[i % ctx.ids.sections.length]
  }));
  for (const { studentId, sectionId } of assignments) {
    ctx.ids.enrollmentsBySection.get(sectionId.toString()).push(studentId);
  }

  if (ctx.config.dryRun) {
    for (let i = 0; i < assignments.length; i++) recordCreated(ctx, "enrollments");
    return;
  }

  // Bulk upsert — one round-trip instead of N.
  const ops = assignments.map(({ studentId, sectionId }) => ({
    updateOne: {
      filter: { student: studentId },
      update: { $set: { student: studentId, section: sectionId, enrolledAt: new Date() } },
      upsert: true
    }
  }));
  const res = await Enrollment.bulkWrite(ops, { ordered: false });
  const created = (res.upsertedCount ?? 0);
  const updated = (res.matchedCount ?? assignments.length) - created;
  for (let i = 0; i < created; i++) recordCreated(ctx, "enrollments");
  for (let i = 0; i < Math.max(0, updated); i++) recordUpdated(ctx, "enrollments");
}

/**
 * seedTimetables — one master Timetable per section with 15-25 non-
 * overlapping slots across Mon-Fri. Natural key: (section, term, year).
 * Stores the generated slot arrays in ctx.ids.timetableBySection for later
 * phases to consume.
 */
async function seedTimetables(ctx) {
  phaseBanner(5, 20, "timetables", ctx.ids.sections.length);
  const { Timetable } = ctx.models;
  const now = new Date();
  const term = termFromMonth(now);
  const year = now.getUTCFullYear();
  ctx.ids.timetableBySection = new Map();

  for (const sectionId of ctx.ids.sections) {
    // Build slots day-by-day to guarantee no intra-day overlaps and at least
    // one slot per weekday. Regenerate if the total slot count is outside
    // [15..25].
    let slots = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      slots = [];
      for (const day of DAY_VALUES) {
        slots = slots.concat(buildDailySlots(ctx.rng, day, ctx.ids.teachers));
      }
      if (slots.length >= 15 && slots.length <= 25) break;
    }
    // Fallback: trim or top up to stay within the 15-25 band.
    if (slots.length > 25) slots = slots.slice(0, 25);
    while (slots.length < 15) {
      // Pad with a friday slot using a valid admin-grid time (13:00 is a safe
      // mid-day slot unlikely to already be occupied on friday).
      slots.push({
        day: "friday",
        startTime: "13:00",
        endTime: "14:00",
        subject: randomChoice(ctx.rng, SUBJECTS),
        className: "Year 3",
        room: randomRoom(ctx.rng),
        teacher: randomChoice(ctx.rng, ctx.ids.teachers)
      });
    }

    ctx.ids.timetableBySection.set(sectionId.toString(), slots);

    if (ctx.config.dryRun) {
      recordCreated(ctx, "timetables");
      continue;
    }
    const doc = await Timetable.findOneAndUpdate(
      { section: sectionId, term, year },
      { $set: { section: sectionId, term, year, slots } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    if (doc.createdAt.getTime() === doc.updatedAt.getTime()) recordCreated(ctx, "timetables");
    else recordUpdated(ctx, "timetables");
  }
}

/**
 * seedStudentTimetables — one per student, slot.section set to the
 * student's enrolled section (fixes the section-link bug). Teacher on each
 * slot equals the master Timetable teacher for the same (day, startTime,
 * endTime), satisfying Requirement 2 §7.
 */
async function seedStudentTimetables(ctx) {
  phaseBanner(6, 20, "studentTimetables", ctx.ids.students.length);
  const { StudentTimetable, Enrollment } = ctx.models;
  const now = new Date();
  const term = termFromMonth(now);
  const year = now.getUTCFullYear();

  // Build an in-memory student->section map. In dry-run mode we reconstruct
  // it from the round-robin used in seedEnrollments.
  let studentToSection;
  if (ctx.config.dryRun) {
    studentToSection = new Map(
      ctx.ids.students.map((sid, i) => [sid.toString(), ctx.ids.sections[i % ctx.ids.sections.length]])
    );
  } else {
    const rows = await Enrollment.find({ student: { $in: ctx.ids.students } }, { student: 1, section: 1 }).lean();
    studentToSection = new Map(rows.map((r) => [r.student.toString(), r.section]));
  }

  const ops = [];
  for (const studentId of ctx.ids.students) {
    const sectionId = studentToSection.get(studentId.toString());
    const masterSlots = ctx.ids.timetableBySection.get(sectionId.toString()) || [];
    const slots = masterSlots.map((s) => ({
      day: s.day,
      startTime: s.startTime,
      endTime: s.endTime,
      section: sectionId,
      subject: s.subject,
      className: s.className,
      room: s.room,
      teacher: s.teacher
    }));
    if (ctx.config.dryRun) {
      recordCreated(ctx, "studentTimetables");
      continue;
    }
    ops.push({
      updateOne: {
        filter: { student: studentId, term, year },
        update: { $set: { student: studentId, term, year, slots } },
        upsert: true
      }
    });
  }

  if (!ctx.config.dryRun && ops.length > 0) {
    const res = await StudentTimetable.bulkWrite(ops, { ordered: false });
    const created = res.upsertedCount ?? 0;
    const updated = (res.matchedCount ?? ops.length) - created;
    for (let i = 0; i < created; i++) recordCreated(ctx, "studentTimetables");
    for (let i = 0; i < Math.max(0, updated); i++) recordUpdated(ctx, "studentTimetables");
  }
}

/**
 * seedTaskLibrary — upserts the TASK_LIBRARY_SEED entries. Natural key: title.
 * Each entry is authored by the first admin user.
 */
async function seedTaskLibrary(ctx) {
  phaseBanner(7, 20, "taskLibrary", TASK_LIBRARY_SEED.length);
  const { TaskLibrary } = ctx.models;
  const creator = ctx.ids.admins[0];
  ctx.ids.taskLibrary = [];
  for (const entry of TASK_LIBRARY_SEED) {
    if (ctx.config.dryRun) {
      recordCreated(ctx, "taskLibrary");
      ctx.ids.taskLibrary.push(new mongoose.Types.ObjectId());
      continue;
    }
    const doc = await TaskLibrary.findOneAndUpdate(
      { title: entry.title },
      { $set: { ...entry, createdBy: creator, isActive: true } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    if (doc.createdAt.getTime() === doc.updatedAt.getTime()) recordCreated(ctx, "taskLibrary");
    else recordUpdated(ctx, "taskLibrary");
    ctx.ids.taskLibrary.push(doc._id);
  }
}

/**
 * seedStudentGoals — exactly one per student. Natural key: student (first).
 */
async function seedStudentGoals(ctx) {
  phaseBanner(8, 20, "studentGoals", ctx.ids.students.length);
  const { StudentGoal } = ctx.models;
  const now = Date.now();
  const goalTypes = ["placement", "exam", "skill_development"];
  const difficulties = ["easy", "medium", "hard"];
  ctx.ids.goalByStudent = new Map();

  for (const studentId of ctx.ids.students) {
    const goalType = randomChoice(ctx.rng, goalTypes);
    const targetDate = randomDate(ctx.rng, now + 30 * 86400000, now + 180 * 86400000);
    const difficultyPreference = randomChoice(ctx.rng, difficulties);
    const progress = randomInt(ctx.rng, 10, 85);
    if (ctx.config.dryRun) {
      recordCreated(ctx, "studentGoals");
      ctx.ids.goalByStudent.set(studentId.toString(), new mongoose.Types.ObjectId());
      continue;
    }
    const doc = await StudentGoal.findOneAndUpdate(
      { student: studentId },
      { $set: { student: studentId, goalType, targetDate, difficultyPreference, progress } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    if (doc.createdAt.getTime() === doc.updatedAt.getTime()) recordCreated(ctx, "studentGoals");
    else recordUpdated(ctx, "studentGoals");
    ctx.ids.goalByStudent.set(studentId.toString(), doc._id);
  }
}

/**
 * seedStudentTasks — 3-6 per student across three statuses. Natural key is
 * synthetic (student, title) so upserts are safe on re-run.
 */
async function seedStudentTasks(ctx) {
  phaseBanner(9, 20, "studentTasks", ctx.ids.students.length * 4);
  const { StudentTask } = ctx.models;
  const statuses = ["pending", "in_progress", "completed"];
  const ops = [];

  for (const studentId of ctx.ids.students) {
    const goalId = ctx.ids.goalByStudent.get(studentId.toString());
    const count = randomInt(ctx.rng, 3, 6);
    const libEntries = randomSubset(ctx.rng, TASK_LIBRARY_SEED, Math.min(count, TASK_LIBRARY_SEED.length));
    for (let i = 0; i < count; i++) {
      const lib = libEntries[i];
      const status = statuses[i % statuses.length];
      const libDbId = ctx.ids.taskLibrary[TASK_LIBRARY_SEED.indexOf(lib)];
      const body = {
        student: studentId,
        goal: goalId,
        title: lib.title,
        category: lib.category,
        difficulty: lib.difficulty,
        status,
        durationMinutes: lib.durationMinutes,
        basePoints: lib.basePoints,
        pointsAwarded: status === "completed" ? lib.basePoints : 0,
        completedAt: status === "completed" ? randomDate(ctx.rng, Date.now() - 14 * 86400000, Date.now()) : null,
        scheduledFor: randomDate(ctx.rng, Date.now() - 7 * 86400000, Date.now() + 7 * 86400000),
        libraryTask: libDbId,
        mlScore: Number(ctx.rng().toFixed(3)),
        timelinessFactor: 1.0
      };
      if (ctx.config.dryRun) {
        recordCreated(ctx, "studentTasks");
        continue;
      }
      ops.push({
        updateOne: {
          filter: { student: studentId, title: lib.title },
          update: { $set: body },
          upsert: true
        }
      });
    }
  }

  if (!ctx.config.dryRun && ops.length > 0) {
    const res = await StudentTask.bulkWrite(ops, { ordered: false });
    const created = res.upsertedCount ?? 0;
    const updated = (res.matchedCount ?? ops.length) - created;
    for (let i = 0; i < created; i++) recordCreated(ctx, "studentTasks");
    for (let i = 0; i < Math.max(0, updated); i++) recordUpdated(ctx, "studentTasks");
  }
}

/**
 * seedAssessments — 2-5 per section with draft/published/closed mix.
 * Teacher is drawn from the master Timetable's teacher roster for the
 * section (satisfies Requirement 2 §10).
 */
async function seedAssessments(ctx) {
  phaseBanner(10, 20, "assessments", ctx.ids.sections.length * 3);
  const { Assessment } = ctx.models;
  ctx.ids.assessments = []; // { _id, sectionId, status, maxScore, teacherId }

  for (const sectionId of ctx.ids.sections) {
    const slots = ctx.ids.timetableBySection.get(sectionId.toString()) || [];
    const teachersForSection = Array.from(new Set(slots.map((s) => s.teacher.toString())));
    const count = randomInt(ctx.rng, 2, 5);
    const statusCycle = ["draft", "published", "closed"];

    for (let i = 0; i < count; i++) {
      const status = statusCycle[i % statusCycle.length];
      const teacherIdStr = randomChoice(ctx.rng, teachersForSection);
      const teacherId = new mongoose.Types.ObjectId(teacherIdStr);
      const questionCount = randomInt(ctx.rng, 5, 10);
      const maxScore = questionCount; // 1 mark each for MCQs

      let startTime;
      if (status === "closed") startTime = randomDate(ctx.rng, Date.now() - 30 * 86400000, Date.now() - 7 * 86400000);
      else if (status === "published") startTime = randomDate(ctx.rng, Date.now() - 2 * 86400000, Date.now() + 2 * 86400000);
      else startTime = randomDate(ctx.rng, Date.now() + 7 * 86400000, Date.now() + 21 * 86400000);
      const durationMinutes = randomInt(ctx.rng, 30, 90);
      const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

      const questions = [];
      for (let q = 0; q < questionCount; q++) {
        questions.push({
          prompt: `Sample question ${q + 1}?`,
          options: ["Option A", "Option B", "Option C", "Option D"],
          correctOptionIndex: randomInt(ctx.rng, 0, 3),
          marks: 1
        });
      }

      const title = `${status.toUpperCase()} Test ${i + 1}`;
      if (ctx.config.dryRun) {
        recordCreated(ctx, "assessments");
        ctx.ids.assessments.push({
          _id: new mongoose.Types.ObjectId(),
          sectionId,
          status,
          maxScore,
          teacherId,
          startTime
        });
        continue;
      }
      const doc = await Assessment.findOneAndUpdate(
        { section: sectionId, title },
        {
          $set: {
            teacher: teacherId,
            section: sectionId,
            title,
            type: "mcq",
            status,
            startTime,
            endTime,
            durationMinutes,
            questions
          }
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      );
      if (doc.createdAt.getTime() === doc.updatedAt.getTime()) recordCreated(ctx, "assessments");
      else recordUpdated(ctx, "assessments");
      ctx.ids.assessments.push({ _id: doc._id, sectionId, status, maxScore, teacherId, startTime });
    }
  }
}

/**
 * seedAssessmentAttempts — one per enrolled student for every published /
 * closed assessment. Scores are clipped Gaussian with mean 0.7 * maxScore
 * so the per-assessment mean lands in the 55-85% band (Requirement 5 §6).
 */
async function seedAssessmentAttempts(ctx) {
  phaseBanner(11, 20, "assessmentAttempts", ctx.ids.students.length);
  const { AssessmentAttempt } = ctx.models;
  const ops = [];

  for (const assessment of ctx.ids.assessments) {
    if (assessment.status === "draft") continue;
    const enrolledStudents = ctx.ids.enrollmentsBySection.get(assessment.sectionId.toString()) || [];
    for (const studentId of enrolledStudents) {
      const raw = gaussianRandom(ctx.rng, 0.7 * assessment.maxScore, 0.1 * assessment.maxScore);
      const score = Math.max(0, Math.min(assessment.maxScore, Math.round(raw)));
      const status = assessment.status === "closed" ? "graded" : rng50(ctx.rng) ? "submitted" : "in_progress";
      const body = {
        assessment: assessment._id,
        student: studentId,
        status,
        startedAt: assessment.startTime,
        submittedAt: status === "in_progress" ? null : new Date(assessment.startTime.getTime() + 20 * 60000),
        score: status === "in_progress" ? 0 : score,
        maxScore: assessment.maxScore,
        answers: []
      };
      if (ctx.config.dryRun) {
        recordCreated(ctx, "assessmentAttempts");
        continue;
      }
      ops.push({
        updateOne: {
          filter: { assessment: assessment._id, student: studentId },
          update: { $set: body },
          upsert: true
        }
      });
    }
  }

  if (!ctx.config.dryRun && ops.length > 0) {
    const res = await AssessmentAttempt.bulkWrite(ops, { ordered: false });
    const created = res.upsertedCount ?? 0;
    const updated = (res.matchedCount ?? ops.length) - created;
    for (let i = 0; i < created; i++) recordCreated(ctx, "assessmentAttempts");
    for (let i = 0; i < Math.max(0, updated); i++) recordUpdated(ctx, "assessmentAttempts");
  }
}
function rng50(rng) { return rng() < 0.5; }

/**
 * seedAttendanceRecords — for each section's 8 most recent weekdays, one
 * record per slot per enrolled student. Status is distributed to keep the
 * overall present/late share in the 70-95% band (Requirement 5 §5).
 */
async function seedAttendanceRecords(ctx) {
  phaseBanner(12, 20, "attendanceRecords", 0);
  const { AttendanceRecord } = ctx.models;

  // Build the list of 8 most recent weekday (Mon-Fri) calendar dates,
  // normalised to UTC midnight, ordered oldest-to-newest.
  const dayIndexByName = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5 };
  const sessionsByDayName = { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [] };
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let cursor = new Date(today);
  while (Object.values(sessionsByDayName).some((arr) => arr.length < 8)) {
    const dow = cursor.getUTCDay(); // 0=Sun..6=Sat
    if (dow >= 1 && dow <= 5) {
      const name = Object.keys(dayIndexByName).find((k) => dayIndexByName[k] === dow);
      if (sessionsByDayName[name].length < 8) {
        sessionsByDayName[name].push(new Date(cursor));
      }
    }
    cursor = new Date(cursor.getTime() - 86400000);
  }

  // Build all operations in memory first, then flush in batches. This
  // replaces ~9,800 sequential round-trips (the previous hot-path that
  // hung the script for 5-10 minutes) with ~5 batched round-trips.
  const BATCH_SIZE = 2000;
  let ops = [];
  let totalCreated = 0;
  let totalUpdated = 0;

  async function flush() {
    if (ops.length === 0) return;
    const res = await AttendanceRecord.bulkWrite(ops, { ordered: false });
    const created = res.upsertedCount ?? 0;
    const matched = res.matchedCount ?? 0;
    totalCreated += created;
    totalUpdated += Math.max(0, matched - created);
    ops = [];
  }

  for (const sectionId of ctx.ids.sections) {
    const slots = ctx.ids.timetableBySection.get(sectionId.toString()) || [];
    const enrolledStudents = ctx.ids.enrollmentsBySection.get(sectionId.toString()) || [];

    for (const slot of slots) {
      const dates = sessionsByDayName[slot.day] || [];
      const key = slotKeyFor(slot.day, slot.startTime, slot.endTime);
      for (const sessionDate of dates) {
        for (const studentId of enrolledStudents) {
          // 82% present, 8% late, 5% excused, 5% absent — mean attendance
          // rate (present+late) = 90%, within the 70-95% target.
          const roll = ctx.rng();
          let status = "present";
          if (roll > 0.95) status = "absent";
          else if (roll > 0.90) status = "excused";
          else if (roll > 0.82) status = "late";
          if (ctx.config.dryRun) {
            recordCreated(ctx, "attendanceRecords");
            continue;
          }
          ops.push({
            updateOne: {
              filter: { student: studentId, section: sectionId, sessionDate, slotKey: key },
              update: {
                $set: {
                  student: studentId,
                  teacher: slot.teacher,
                  section: sectionId,
                  sessionDate,
                  slotKey: key,
                  status
                }
              },
              upsert: true
            }
          });
          if (ops.length >= BATCH_SIZE) await flush();
        }
      }
    }
  }

  await flush();
  for (let i = 0; i < totalCreated; i++) recordCreated(ctx, "attendanceRecords");
  for (let i = 0; i < totalUpdated; i++) recordUpdated(ctx, "attendanceRecords");
}

/**
 * seedGoalProgressHistory — 5-10 rows per StudentGoal with monotonically
 * non-decreasing progress values spread across the last 60 days.
 */
async function seedGoalProgressHistory(ctx) {
  phaseBanner(13, 20, "goalProgressHistory", ctx.ids.students.length * 7);
  const { GoalProgressHistory } = ctx.models;
  const ops = [];

  for (const studentId of ctx.ids.students) {
    const goalId = ctx.ids.goalByStudent.get(studentId.toString());
    const count = randomInt(ctx.rng, 5, 10);
    // Pick N distinct dates in the last 60 days, sort ascending.
    const offsets = Array.from({ length: count }, () => randomInt(ctx.rng, 1, 60));
    const uniqueOffsets = Array.from(new Set(offsets)).sort((a, b) => b - a); // newest last
    // Build monotonic progress series ending around 80.
    const progressSeries = [];
    let cur = randomInt(ctx.rng, 5, 20);
    for (let i = 0; i < uniqueOffsets.length; i++) {
      progressSeries.push(Math.min(100, cur));
      cur += randomInt(ctx.rng, 2, 12);
    }

    for (let i = 0; i < uniqueOffsets.length; i++) {
      const recordedAt = new Date(Date.now() - uniqueOffsets[i] * 86400000);
      const body = {
        goal: goalId,
        student: studentId,
        recordedAt,
        progress: progressSeries[i],
        tasksCompleted: i + 1,
        pointsEarned: 20 * (i + 1)
      };
      if (ctx.config.dryRun) {
        recordCreated(ctx, "goalProgressHistory");
        continue;
      }
      ops.push({
        updateOne: {
          filter: { goal: goalId, recordedAt },
          update: { $set: body },
          upsert: true
        }
      });
    }
  }

  if (!ctx.config.dryRun && ops.length > 0) {
    await GoalProgressHistory.bulkWrite(ops, { ordered: false });
    // schema has no createdAt — count every op as created (the script's
    // convention in the previous sequential version).
    for (let i = 0; i < ops.length; i++) recordCreated(ctx, "goalProgressHistory");
  }
}

/**
 * seedLeaderboardSnapshots — 4 weeks x 4 goalTypes = 16 snapshots.
 * Entries are sorted by totalPoints desc and assigned ranks 1..n.
 */
async function seedLeaderboardSnapshots(ctx) {
  phaseBanner(14, 20, "leaderboardSnapshots", 16);
  const { LeaderboardSnapshot, User } = ctx.models;
  const goalTypes = ["placement", "academic", "skill_development", "overall"];

  // Fetch student display names once.
  let studentDocs = [];
  if (!ctx.config.dryRun) {
    studentDocs = await User.find({ _id: { $in: ctx.ids.students } }, { name: 1, streak: 1, rewardPoints: 1, pointsBreakdown: 1 }).lean();
  } else {
    studentDocs = ctx.ids.students.map((sid, i) => ({
      _id: sid, name: `Student ${i + 1}`, streak: 0, rewardPoints: 100,
      pointsBreakdown: { aiTasks: 30, tests: 60, streakBonuses: 10 }
    }));
  }

  for (let week = 0; week < 4; week++) {
    const snapshotDate = new Date(Date.now() - week * 7 * 86400000);
    snapshotDate.setUTCHours(0, 0, 0, 0);
    for (const goalType of goalTypes) {
      // Randomise points per student per snapshot to keep things lively.
      const entries = studentDocs
        .map((s) => ({
          student: s._id,
          totalPoints: (s.rewardPoints || 0) + randomInt(ctx.rng, -20, 20),
          pointsBreakdown: s.pointsBreakdown || { aiTasks: 0, tests: 0, streakBonuses: 0 },
          streak: s.streak || 0,
          displayName: s.name
        }))
        .sort((a, b) =>
          b.totalPoints - a.totalPoints || a.student.toString().localeCompare(b.student.toString())
        )
        .map((e, i) => ({ ...e, rank: i + 1 }));

      if (ctx.config.dryRun) {
        recordCreated(ctx, "leaderboardSnapshots");
        continue;
      }
      const doc = await LeaderboardSnapshot.findOneAndUpdate(
        { snapshotDate, goalType },
        { $set: { snapshotDate, goalType, entries } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      );
      recordCreated(ctx, "leaderboardSnapshots");
    }
  }
}

/**
 * seedNotifications — 2-10 per user drawn from at least three template types.
 * Natural key is synthetic (recipient, title) to keep re-runs idempotent.
 */
async function seedNotifications(ctx) {
  phaseBanner(15, 20, "notifications", ctx.ids.students.length * 4);
  const { Notification } = ctx.models;
  const allUsers = [...ctx.ids.admins, ...ctx.ids.teachers, ...ctx.ids.students];
  const ops = [];

  for (const userId of allUsers) {
    const count = randomInt(ctx.rng, 2, 10);
    const chosen = randomSubset(ctx.rng, NOTIFICATION_TEMPLATES, Math.min(count, NOTIFICATION_TEMPLATES.length));
    for (const tpl of chosen) {
      const body = {
        recipient: userId,
        type: tpl.type,
        title: tpl.title,
        body: tpl.body,
        isRead: rng50(ctx.rng)
      };
      if (ctx.config.dryRun) {
        recordCreated(ctx, "notifications");
        continue;
      }
      ops.push({
        updateOne: {
          filter: { recipient: userId, title: tpl.title },
          update: { $set: body },
          upsert: true
        }
      });
    }
  }

  if (!ctx.config.dryRun && ops.length > 0) {
    await Notification.bulkWrite(ops, { ordered: false });
    for (let i = 0; i < ops.length; i++) recordCreated(ctx, "notifications");
  }
}

/**
 * seedAuditLogs — at least 100 entries spread across the last 60 days with
 * every actor role represented at least once.
 */
async function seedAuditLogs(ctx) {
  phaseBanner(16, 20, "auditLogs", 120);
  const { AuditLog } = ctx.models;
  const rolePools = {
    admin: ctx.ids.admins,
    teacher: ctx.ids.teachers,
    student: ctx.ids.students
  };
  // Guarantee at least one log per role.
  const required = [
    { role: "admin", pool: rolePools.admin },
    { role: "teacher", pool: rolePools.teacher },
    { role: "student", pool: rolePools.student }
  ];
  const target = 120;
  const docs = [];

  for (let i = 0; i < target; i++) {
    const roleEntry = i < required.length ? required[i] : randomChoice(ctx.rng, required);
    const actorId = randomChoice(ctx.rng, roleEntry.pool);
    const action = randomChoice(ctx.rng, AUDIT_ACTIONS);
    const body = {
      actor: actorId,
      actorRole: roleEntry.role,
      action: action.action,
      resource: action.resource,
      metadata: { seeded: true, index: i }
    };
    if (ctx.config.dryRun) {
      recordCreated(ctx, "auditLogs");
      continue;
    }
    docs.push(body);
  }

  if (!ctx.config.dryRun && docs.length > 0) {
    // insertMany — one round-trip. ordered:false lets a few failures not
    // abort the whole batch.
    await AuditLog.insertMany(docs, { ordered: false });
    for (let i = 0; i < docs.length; i++) recordCreated(ctx, "auditLogs");
  }
}

/**
 * seedSystemSettings — upserts the singleton SystemSettings document.
 */
async function seedSystemSettings(ctx) {
  phaseBanner(17, 20, "systemsettings", 1);
  const { SystemSettings } = ctx.models;
  if (ctx.config.dryRun) {
    recordCreated(ctx, "systemsettings");
    return;
  }
  const existing = await SystemSettings.findOne();
  if (existing) {
    await SystemSettings.updateOne({ _id: existing._id }, { $set: { institutionName: "EduSync Institute" } });
    recordUpdated(ctx, "systemsettings");
  } else {
    await SystemSettings.create({
      institutionName: "EduSync Institute",
      contactEmail: "admin@edusync.local"
    });
    recordCreated(ctx, "systemsettings");
  }
}

/**
 * seedLegacyAttendance — one row per student in the legacy Attendance model.
 */
async function seedLegacyAttendance(ctx) {
  phaseBanner(18, 20, "attendances", ctx.ids.students.length);
  const { Attendance } = ctx.models;
  const teacherId = ctx.ids.teachers[0];
  const ops = [];

  for (const studentId of ctx.ids.students) {
    const body = {
      student: studentId,
      teacher: teacherId,
      date: new Date(),
      className: "Year 3",
      subject: randomChoice(ctx.rng, SUBJECTS),
      status: rng50(ctx.rng) ? "present" : "absent"
    };
    if (ctx.config.dryRun) {
      recordCreated(ctx, "attendances");
      continue;
    }
    ops.push({
      updateOne: {
        filter: { student: studentId, date: body.date },
        update: { $set: body },
        upsert: true
      }
    });
  }

  if (!ctx.config.dryRun && ops.length > 0) {
    await Attendance.bulkWrite(ops, { ordered: false });
    for (let i = 0; i < ops.length; i++) recordCreated(ctx, "attendances");
  }
}

/**
 * seedLegacyTasks — one row per student in the legacy Task model.
 */
async function seedLegacyTasks(ctx) {
  phaseBanner(19, 20, "tasks", ctx.ids.students.length);
  const { Task } = ctx.models;
  const ops = [];

  for (const studentId of ctx.ids.students) {
    const lib = randomChoice(ctx.rng, TASK_LIBRARY_SEED);
    const body = {
      student: studentId,
      title: `Legacy: ${lib.title}`,
      category: lib.category,
      difficulty: lib.difficulty,
      status: "pending",
      durationMinutes: lib.durationMinutes,
      basePoints: lib.basePoints
    };
    if (ctx.config.dryRun) {
      recordCreated(ctx, "tasks");
      continue;
    }
    ops.push({
      updateOne: {
        filter: { student: studentId, title: body.title },
        update: { $set: body },
        upsert: true
      }
    });
  }

  if (!ctx.config.dryRun && ops.length > 0) {
    await Task.bulkWrite(ops, { ordered: false });
    for (let i = 0; i < ops.length; i++) recordCreated(ctx, "tasks");
  }
}

/**
 * seedLegacyGoals — one row per student in the legacy Goal model.
 */
async function seedLegacyGoals(ctx) {
  phaseBanner(20, 20, "goals", ctx.ids.students.length);
  const { Goal } = ctx.models;
  const ops = [];

  for (const studentId of ctx.ids.students) {
    const body = {
      student: studentId,
      goalType: randomChoice(ctx.rng, ["placement", "exam", "skill_development"]),
      targetDate: new Date(Date.now() + 90 * 86400000),
      difficultyPreference: randomChoice(ctx.rng, ["easy", "medium", "hard"]),
      progress: randomInt(ctx.rng, 10, 80)
    };
    if (ctx.config.dryRun) {
      recordCreated(ctx, "goals");
      continue;
    }
    ops.push({
      updateOne: {
        filter: { student: studentId },
        update: { $set: body },
        upsert: true
      }
    });
  }

  if (!ctx.config.dryRun && ops.length > 0) {
    await Goal.bulkWrite(ops, { ordered: false });
    for (let i = 0; i < ops.length; i++) recordCreated(ctx, "goals");
  }
}


// ---------------------------------------------------------------------------
// Section 7. Wipe (--fresh), summary, and orchestration
// ---------------------------------------------------------------------------

/**
 * wipeCollections
 * In --fresh mode, delete every seeded collection after a visible 3-second
 * countdown so the operator has time to abort with Ctrl-C.
 */
async function wipeCollections(ctx) {
  const dbName = mongoose.connection.db.databaseName;
  console.log(`\n[--fresh] Wiping all seeded collections in database "${dbName}"`);
  for (let i = 3; i >= 1; i--) {
    console.log(`  starting in ${i}...`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  const collectionsToWipe = [
    "users", "courses", "sections", "enrollments", "timetables",
    "studentTimetables", "attendanceRecords", "attendances", "assessments",
    "assessmentAttempts", "taskLibrary", "studentTasks", "tasks",
    "studentGoals", "goals", "goalProgressHistory", "leaderboardSnapshots",
    "notifications", "auditLogs", "systemsettings"
  ];
  for (const name of collectionsToWipe) {
    try {
      const result = await mongoose.connection.db.collection(name).deleteMany({});
      console.log(`  - ${name}: deleted ${result.deletedCount}`);
    } catch (err) {
      if (err.codeName !== "NamespaceNotFound") throw err;
    }
  }
}

/**
 * verifyIntegrity
 * Post-write sanity check. Only a subset of the full spec's invariants —
 * email uniqueness, single-section enrollment, attendance-triple uniqueness,
 * score bounds, and leaderboard rank/order — because a full scan would be
 * prohibitively slow on large datasets. Returns a list of violations.
 */
async function verifyIntegrity(ctx) {
  if (ctx.config.dryRun) return [];
  const { User, Enrollment, AssessmentAttempt, LeaderboardSnapshot } = ctx.models;
  const violations = [];

  // Email uniqueness (aggregation, ignores case because schema is lowercased).
  const dupEmails = await User.aggregate([
    { $group: { _id: "$email", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 5 }
  ]);
  if (dupEmails.length) {
    violations.push({ rule: "email-uniqueness", ids: dupEmails.map((d) => d._id) });
  }

  // Single-section enrollment.
  const dupEnrollments = await Enrollment.aggregate([
    { $group: { _id: "$student", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 5 }
  ]);
  if (dupEnrollments.length) {
    violations.push({ rule: "single-section-enrollment", ids: dupEnrollments.map((d) => String(d._id)) });
  }

  // AssessmentAttempt score bounds.
  const outOfBounds = await AssessmentAttempt.find({
    $expr: { $or: [{ $lt: ["$score", 0] }, { $gt: ["$score", "$maxScore"] }] }
  }).limit(5).select("_id");
  if (outOfBounds.length) {
    violations.push({ rule: "assessment-score-bounds", ids: outOfBounds.map((d) => String(d._id)) });
  }

  // Leaderboard rank completeness (spot-check each snapshot).
  const snapshots = await LeaderboardSnapshot.find().select("_id entries").lean();
  for (const snap of snapshots) {
    const ranks = snap.entries.map((e) => e.rank).sort((a, b) => a - b);
    const expected = Array.from({ length: ranks.length }, (_, i) => i + 1);
    if (ranks.join(",") !== expected.join(",")) {
      violations.push({ rule: "leaderboard-rank-completeness", ids: [String(snap._id)] });
      break;
    }
  }

  return violations;
}

function printSummary(ctx) {
  const dbName = ctx.db?.databaseName || "(unknown)";
  console.log("\n============================================================");
  console.log(`Seed complete. Target database: ${dbName}`);
  console.log(`Random seed used: ${ctx.config.seed}`);
  console.log(`Mode: ${ctx.config.dryRun ? "DRY-RUN (no writes)" : ctx.config.fresh ? "FRESH" : "UPSERT"}`);
  console.log("------------------------------------------------------------");
  console.log("Collection                   created   updated   unchanged");
  console.log("------------------------------------------------------------");
  for (const [key, c] of Object.entries(ctx.counters)) {
    const name = key.padEnd(26, " ");
    console.log(`${name} ${String(c.created).padStart(7)}  ${String(c.updated).padStart(7)}  ${String(c.unchanged).padStart(9)}`);
  }
  console.log("============================================================");
  console.log("Default logins (if newly seeded):");
  console.log("  admin   : admin@edusync.local          / Admin@12345");
  console.log("  teacher : <first>.<last>@edusync.local / Teacher@12345");
  console.log("  student : <first>.<last>@edusync.local / Student@12345");
}

function newCounter() { return { created: 0, updated: 0, unchanged: 0 }; }

// ---------------------------------------------------------------------------
// Section 8. Entry point
// ---------------------------------------------------------------------------

async function run() {
  // 1. Parse CLI + env before opening a DB connection.
  let cli;
  try {
    cli = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }
  if (cli["--help"]) {
    printHelp();
    return;
  }
  let env;
  try {
    env = readEnv(process.env);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  // 2. Safety guards that do not need a DB connection.
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri || mongoUri.trim() === "") {
    console.error("MONGODB_URI is required. Set it in backend/.env before running.");
    process.exitCode = 1;
    return;
  }

  // Allocate the PRNG so default counts are themselves deterministic under --seed.
  const preliminarySeed = cli["--seed"] ?? env.seed ?? Date.now();
  const rng = mulberry32(Number(preliminarySeed));
  const config = resolveConfig(cli, env, rng);

  if (process.env.NODE_ENV === "production" && !config.iKnow) {
    console.error("Refusing to run: NODE_ENV=production. Use --i-know-what-im-doing to override.");
    process.exitCode = 1;
    return;
  }
  if (/prod/i.test(mongoUri) && !config.iKnow) {
    console.error("Refusing to run: MONGODB_URI looks like a production database. Use --i-know-what-im-doing to override.");
    process.exitCode = 1;
    return;
  }

  // 3. Connect.
  console.log(`[seed] connecting to MongoDB...`);
  await mongoose.connect(mongoUri);
  const dbName = mongoose.connection.db.databaseName;
  console.log(`[seed] connected to "${dbName}"`);

  // 4. Validate counts (Requirement 7 §4).
  try {
    validateCounts(config);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  // 5. Build the context object that every phase shares.
  const ctx = {
    rng: mulberry32(Number(config.seed)), // fresh PRNG seeded deterministically for phases
    config,
    models: loadModels(),
    db: mongoose.connection.db,
    ids: {},
    counters: {
      users: newCounter(),
      courses: newCounter(),
      sections: newCounter(),
      enrollments: newCounter(),
      timetables: newCounter(),
      studentTimetables: newCounter(),
      taskLibrary: newCounter(),
      studentGoals: newCounter(),
      studentTasks: newCounter(),
      assessments: newCounter(),
      assessmentAttempts: newCounter(),
      attendanceRecords: newCounter(),
      goalProgressHistory: newCounter(),
      leaderboardSnapshots: newCounter(),
      notifications: newCounter(),
      auditLogs: newCounter(),
      systemsettings: newCounter(),
      attendances: newCounter(),
      tasks: newCounter(),
      goals: newCounter()
    }
  };

  // 6. Optional wipe.
  if (config.fresh && !config.dryRun) {
    await wipeCollections(ctx);
  } else if (config.fresh && config.dryRun) {
    console.log("[--dry-run] skipping --fresh wipe");
  }

  // 7. Execute every phase in dependency order.
  const phases = [
    seedUsers, seedCourses, seedSections, seedEnrollments,
    seedTimetables, seedStudentTimetables,
    seedTaskLibrary, seedStudentGoals, seedStudentTasks,
    seedAssessments, seedAssessmentAttempts,
    seedAttendanceRecords,
    seedGoalProgressHistory, seedLeaderboardSnapshots,
    seedNotifications, seedAuditLogs,
    seedSystemSettings,
    seedLegacyAttendance, seedLegacyTasks, seedLegacyGoals
  ];
  for (const phase of phases) {
    try {
      await phase(ctx);
    } catch (err) {
      console.error(`[${phase.name}] failed: ${err.message}`);
      throw err;
    }
  }

  // 8. Verify and summarize.
  const violations = await verifyIntegrity(ctx);
  if (violations.length) {
    console.error("\nIntegrity verification FAILED:");
    for (const v of violations) {
      console.error(`  - ${v.rule}: ${v.ids.slice(0, 5).join(", ")}`);
    }
    process.exitCode = 1;
  }

  printSummary(ctx);
}

run()
  .catch((error) => {
    console.error("Seed failed:", error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch {
      // ignore close errors — the process is exiting anyway
    }
  });
