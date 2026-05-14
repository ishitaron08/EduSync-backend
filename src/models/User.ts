import bcrypt from "bcryptjs";
import { model, Schema } from "mongoose";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, trim: true, default: null },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["admin", "teacher", "student"],
      required: true,
      default: "student"
    },
    availability: {
      type: [
        {
          day: String,
          startTime: String,
          endTime: String
        }
      ],
      // V3
      validate: {
        validator: function(v: any[]) {
          return this.role === 'teacher' || v.length === 0;
        },
        message: 'availability slots can only be set on teacher accounts'
      },
      default: []
    },
    rewardPoints: { type: Number, default: 0 },
    learningGoal: {
      type: String,
      trim: true,
      default: null
    },
    streak: { type: Number, default: 0 },
    pointsBreakdown: {}
  },
  { timestamps: true, collection: "users" }
);

userSchema.index({ role: 1 });
userSchema.index({ lastActiveDate: -1 });

userSchema.pre("findOneAndUpdate", async function hashPasswordOnUpdate() {
  const update = this.getUpdate() as Record<string, unknown> | undefined;
  if (!update) {
    return;
  }

  const directPassword = update.password;
  const setPayload = update.$set as Record<string, unknown> | undefined;
  const setPassword = setPayload?.password;
  const passwordToHash = typeof directPassword === "string" ? directPassword : setPassword;

  if (typeof passwordToHash !== "string") {
    return;
  }

  const hashedPassword = await bcrypt.hash(passwordToHash, 10);
  if (typeof directPassword === "string") {
    update.password = hashedPassword;
  } else if (setPayload) {
    setPayload.password = hashedPassword;
  }
});

export const User = model("User", userSchema);
