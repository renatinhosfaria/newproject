import type { BrokerContext, SessionUser } from "@pacaembu/contracts";
import { problem } from "../http/problem.filter.js";

export function requireBroker(
  user: SessionUser,
  requestId: string,
): BrokerContext {
  if (user.role !== "broker" || !user.broker_id)
    throw problem(403, "BROKER_CONTEXT_REQUIRED");
  return {
    user_id: user.id,
    workspace_id: user.workspace_id,
    membership_id: user.membership_id,
    broker_id: user.broker_id,
    role: "broker",
    request_id: requestId,
  };
}

export function assertResourceBroker(
  user: SessionUser,
  resourceBrokerId: string,
): void {
  if (user.role !== "broker" || user.broker_id !== resourceBrokerId)
    throw problem(404, "RESOURCE_NOT_FOUND");
}
