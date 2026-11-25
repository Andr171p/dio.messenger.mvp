import type { AccountKey } from "../models/types.js";

export function conversationKey(
  accountKey: AccountKey,
  conversationId: string,
  threadId?: string,
): string {
  return [accountKey, conversationId, ...(threadId ? [threadId] : [])].join("::");
}

export function messageCompound(
  accountKey: AccountKey,
  conversationId: string,
): [AccountKey, string] {
  return [accountKey, conversationId];
}
