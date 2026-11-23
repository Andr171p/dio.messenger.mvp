import type { AccountKey } from "../models/types.js";

export function conversationKey(accountKey: AccountKey, conversationId: string): string {
  return `${accountKey}::${conversationId}`;
}

export function messageCompound(
  accountKey: AccountKey,
  conversationId: string,
): [AccountKey, string] {
  return [accountKey, conversationId];
}