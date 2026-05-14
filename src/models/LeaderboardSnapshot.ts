import { model, Schema, Types } from "mongoose";

const leaderboardSnapshotSchema = new Schema(
  {
    snapshotDate: { type: Date, required: [true, 'snapshotDate is required'], default: Date.now },
    goalType: {
      type: String,
      enum: {
        values: ["placement", "academic", "skill_development", "overall"],
        message: '{VALUE} is not a valid value for goalType'
      },
      required: [true, 'goalType is required']
    },
    entries: [
      {
        student: { type: Types.ObjectId, ref: "User", required: [true, 'student is required'] },
        rank: { type: Number, required: [true, 'rank is required'], min: [1, 'rank cannot be less than 1'] },
        totalPoints: { type: Number, required: [true, 'totalPoints is required'], min: [0, 'totalPoints cannot be negative'] },
        pointsBreakdown: {
          aiTasks: { type: Number, default: 0 },
          tests: { type: Number, default: 0 },
          streakBonuses: { type: Number, default: 0 }
        },
        streak: { type: Number, default: 0 },
        displayName: { type: String, required: [true, 'displayName is required'] }
      }
    ]
  },
  { timestamps: false, collection: "leaderboardSnapshots" }
);

// V3
leaderboardSnapshotSchema.index({ snapshotDate: -1, goalType: 1 }, { unique: true });
leaderboardSnapshotSchema.index({ snapshotDate: 1 }, { expireAfterSeconds: 7776000 }); // TTL index - 90 days

export default model("LeaderboardSnapshot", leaderboardSnapshotSchema);
