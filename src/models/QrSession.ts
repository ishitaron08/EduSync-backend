import { model, Schema, Types } from "mongoose";

const qrSessionSchema = new Schema(
  {
    teacher: { type: Types.ObjectId, ref: "User", required: [true, 'teacher is required'] },
    section: { type: Types.ObjectId, ref: "Section", required: [true, 'section is required'] },
    slotKey: { type: String, required: [true, 'slotKey is required'] },
    mode: {
      type: String,
      enum: {
        values: ["qr", "manual"],
        message: '{VALUE} is not a valid value for mode'
      },
      default: "qr",
      required: true
    },
    generatedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: [true, 'expiresAt is required'] },
    status: {
      type: String,
      enum: {
        values: ["active", "expired", "closed"],
        message: '{VALUE} is not a valid value for status'
      },
      default: "active"
    },
    scannedBy: [
      {
        student: { type: Types.ObjectId, ref: "User", required: [true, 'student is required'] },
        scannedAt: { type: Date, required: [true, 'scannedAt is required'] }
      }
    ]
  },
  { timestamps: true, collection: "qrSessions" }
);

// V3 pre-save hook
qrSessionSchema.pre("save", function () {
  if (this.status === 'active' && Date.now() > this.expiresAt.getTime()) {
    this.status = 'expired';
  }
});

// V3
qrSessionSchema.index({ teacher: 1, section: 1, slotKey: 1, status: 1 });
qrSessionSchema.index({ section: 1, generatedAt: -1 });
qrSessionSchema.index({ teacher: 1, generatedAt: -1 });
qrSessionSchema.index({ status: 1 });
qrSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 2592000 }); // TTL index - 30 days

export const QrSession = model("QrSession", qrSessionSchema);
export default QrSession;
