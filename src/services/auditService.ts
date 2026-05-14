import { AuditLog } from "../models/AuditLog";
import { User } from "../models/User";
import { Role } from "../types";

export async function createAuditLog(input: {
  actor: string;
  actorRole: Role;
  action: string;
  resource: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  // Look up actor name from the database
  let actorName = "Unknown";
  try {
    const actorUser = await User.findById(input.actor).select("name email").lean();
    if (actorUser) {
      actorName = actorUser.name;
    }
  } catch {
    // If lookup fails, continue with "Unknown"
  }

  await AuditLog.create({
    actor: input.actor,
    actorRole: input.actorRole,
    action: input.action,
    resource: input.resource,
    metadata: {
      ...input.metadata,
      actorName
    }
  });
}
