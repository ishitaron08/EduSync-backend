import { model, Schema, Types } from "mongoose";

const notificationSchema = new Schema(
  {
    recipient: { type: Types.ObjectId, ref: "User", required: [true, 'recipient is required'] },
    type: {
      type: String,
      enum: {
        values: [
          "low_attendance",
          "test_published",
          "test_graded",
          "task_reminder",
          "schedule_change_request",
          "schedule_change_approved",
          "system"
        ],
        message: '{VALUE} is not a valid value for type'
      },
      required: [true, 'type is required']
    },
    title: { type: String, required: [true, 'title is required'], trim: true },
    body: { type: String, required: [true, 'body is required'], trim: true },
    relatedResource: { type: String, default: null },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  },
  { 
    timestamps: { createdAt: true, updatedAt: false }, 
    collection: "notifications" 
  }
);

// V3
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // TTL index - 90 days

export default model("Notification", notificationSchema);
