import { model, Schema } from "mongoose";

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
      semesterEnd: {
        type: Date,
        default: () => {
          const d = new Date();
          d.setMonth(d.getMonth() + 6);
          return d;
        }
      }
    }
  },
  { timestamps: true }
);

export const SystemSettings = model("SystemSettings", systemSettingsSchema);
