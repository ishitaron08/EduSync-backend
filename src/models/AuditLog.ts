import { model, Schema, Types } from "mongoose";

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

auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, resource: 1 });

export const AuditLog = model("AuditLog", auditLogSchema);
