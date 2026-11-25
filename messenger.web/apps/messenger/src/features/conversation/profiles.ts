import type { Conversation, HttpClient, MessengerDatabase } from "@dio/messenger-core";
import { useQueries } from "@tanstack/react-query";
import { useRuntime } from "../../app/providers/RuntimeProvider.js";
import { getRuntimeConfig } from "../../app/runtimeConfig.js";
import { useUiStore } from "../../stores/uiStore.js";

export interface Profile {
  id: string;
  email?: string;
  fullName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  principalKind?: string;
}

export interface DeskUser {
  id: string;
  email: string;
  full_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
}

export function fromDesk(user: DeskUser): Profile {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    username: user.username,
    avatarUrl: user.avatar_url,
  };
}

export function photoUrl(url?: string | null) {
  if (!url) return undefined;
  if (url.startsWith("data:image/")) return url;
  try {
    const base = new URL(getRuntimeConfig().deskApi + "/", location.origin);
    const image = new URL(url, base);
    return ["https:", "http:"].includes(image.protocol) ? image.href : undefined;
  } catch {
    return undefined;
  }
}

export function userLabel(profile?: Profile) {
  return (
    profile?.fullName?.trim() ||
    profile?.username?.trim() ||
    profile?.email ||
    "Участник"
  );
}

export function chatTitle(chat?: Conversation | null) {
  if (chat?.title && !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(chat.title))
    return chat.title;
  return chat?.kind === "direct" ? "Личный чат" : "Беседа";
}

export function useProfiles(ids: (string | undefined)[]) {
  const { desk, accountKey } = useRuntime();
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: ["desk-profile", accountKey, id],
      enabled: !!desk,
      staleTime: 120_000,
      retry: false,
      queryFn: async () =>
        fromDesk(await desk!.get<DeskUser>(`/api/v1/users/${encodeURIComponent(id)}`)),
    })),
  });
  return new Map(
    results.flatMap((result) =>
      result.data ? [[result.data.id, result.data] as const] : [],
    ),
  );
}

export interface ChatDto {
  id: string;
  type: "group" | "direct";
  title?: string | null;
  description?: string;
  avatarUrl?: string;
  peerId?: string;
  hasExternalMembers?: boolean;
}

export async function openChat(
  db: MessengerDatabase,
  accountKey: string,
  chat: ChatDto,
  peer?: Profile,
) {
  await db.transaction("rw", db.conversations, async () => {
    const existing = await db.conversations.get(chat.id);
    await db.conversations.put({
      unreadCount: 0,
      isPinned: false,
      updatedAt: Date.now(),
      ...existing,
      accountKey,
      id: chat.id,
      kind: chat.type,
      peerId: peer?.id ?? chat.peerId,
      title: chat.title || (peer ? userLabel(peer) : chatTitle(existing)),
      description: chat.description,
      avatarUrl: chat.avatarUrl ?? peer?.avatarUrl ?? undefined,
      isGuest: !!chat.hasExternalMembers,
      hasExternalMembers: chat.hasExternalMembers,
    });
  });
  useUiStore.getState().setSelectedConversation(chat.id);
}

export async function openDirect(
  http: HttpClient,
  db: MessengerDatabase,
  account: string,
  peer: Profile,
) {
  const chat = await http.post<ChatDto>("/v1/conversations/direct", {
    peerId: peer.id,
  });
  await openChat(db, account, chat, peer);
}
