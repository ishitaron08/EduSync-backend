import { User } from "../../models/User";

export const usersRepository = {
  listPaginated(skip: number, limit: number) {
    return Promise.all([
      User.find().select("name email role availability rewardPoints createdAt updatedAt").sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments()
    ]);
  },
  create(payload: Record<string, unknown>) {
    return User.create(payload as any);
  },
  updateById(id: string, payload: Record<string, unknown>) {
    return User.findByIdAndUpdate(id, payload as any, { returnDocument: "after" });
  },
  deleteById(id: string) {
    return User.findByIdAndDelete(id);
  },
  setAvailability(userId: string, availability: unknown[]) {
    return User.findByIdAndUpdate(userId, { $set: { availability } }, { returnDocument: "after" });
  },
  getTopStudents() {
    return User.find({ role: "student" }).select("name email rewardPoints").sort({ rewardPoints: -1 }).limit(20);
  },
  getRewardPoints(userId: string) {
    return User.findById(userId).select("rewardPoints");
  },
  incrementRewardPoints(userId: string, value: number) {
    return User.findByIdAndUpdate(userId, { $inc: { rewardPoints: value } });
  },
  findByEmail(email: string, includePassword = false) {
    const query = User.findOne({ email });
    if (includePassword) {
      query.select("+password");
    }
    return query;
  },
  findById(id: string) {
    return User.findById(id);
  },
  findByIdWithPassword(id: string) {
    return User.findById(id).select("+password");
  }
};
