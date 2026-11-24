import type { Conversation } from "@dio/messenger-core";
import { Avatar, Badge, Icon, IconButton } from "@dio/messenger-ui";
import { useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { useAuth } from "../app/providers/AuthProvider.js";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useUiStore } from "../stores/uiStore.js";
import {
  useConversationMembers,
  useDirectoryProfiles,
} from "../features/read/useConversationMembers.js";
import styles from "./ChatHeader.module.css";
import { ConversationPolicyDialog } from "./ConversationPolicyDialog.js";

function presenceLabel(
  kind: Conversation["kind"] | undefined,
  memberCount: number | undefined,
  peerOnline: boolean | null,
): string {
  if (kind === "group") {
    const count = memberCount !== undefined ? `${memberCount} участников` : "Группа";
    return count;
  }
  if (peerOnline === true) return "В сети";
  if (peerOnline === false) return "не в сети";
  return "Личный чат";
}

export function ChatHeader() {
  const { db, sync, http } = useRuntime();
  const { session } = useAuth();
  const conversationId = useUiStore((s) => s.selectedConversationId);
  const members = useConversationMembers(conversationId);
  const profiles = useDirectoryProfiles(!!conversationId);
  const presence = useQuery({
    queryKey: ["conversation-presence", conversationId],
    enabled: !!conversationId && !!http,
    queryFn: () =>
      http!.get<{ userId: string; status: "online" | "offline" }[]>(
        "/v1/conversations/" + conversationId + "/presence",
      ),
    refetchInterval: 8_000,
    retry: false,
  });
  const mobilePane = useUiStore((s) => s.mobilePane);
  const setMobilePane = useUiStore((s) => s.setMobilePane);
  const setSearchOpen = useUiStore((s) => s.setSearchPanelOpen);
  const [, bump] = useState(0);
  const [policyFor, setPolicyFor] = useState<string | null>(null);
  const role = members.data?.find(
    (member) => member.principalId === session?.userId,
  )?.role;
  const canManage = role === "owner" || role === "admin";

  useEffect(() => {
    if (!sync) return;
    return sync.subscribePresence(() => bump((n) => n + 1));
  }, [sync]);

  const conversation = useLiveQuery(async () => {
    if (!db || !conversationId) return null;
    return db.conversations.get(conversationId);
  }, [db, conversationId]);

  const peerId = members.data?.find(
    (member) => member.principalId !== session?.userId,
  )?.principalId;

  const typing =
    conversationId && sync ? (sync.getTyping(conversationId)?.userIds ?? []) : [];
  const typingOthers = typing.filter((id) => id !== session?.userId);

  if (!conversationId) {
    return (
      <header className={styles.root}>
        <h1 className={styles.title}>DIO Chat</h1>
      </header>
    );
  }

  const guest = conversation?.isGuest || conversation?.hasExternalMembers === true;
  const onlineStates = new Map(
    presence.isError
      ? []
      : presence.data?.map((item) => [item.userId, item.status] as const),
  );
  const peerPresence = peerId ? onlineStates.get(peerId) : undefined;
  const peerOnline =
    conversation?.kind === "direct"
      ? peerPresence
        ? peerPresence === "online"
        : null
      : null;
  const baseSubtitle = presenceLabel(
    conversation?.kind,
    members.data?.length || conversation?.memberCount,
    peerOnline,
  );
  const groupKind =
    conversation?.kind === "group"
      ? guest
        ? "внешние участники"
        : "внутренняя группа"
      : null;
  const onlineCount = [...onlineStates.values()].filter(
    (status) => status === "online",
  ).length;
  const subtitle = groupKind
    ? [baseSubtitle, groupKind, ...(onlineCount ? [onlineCount + " в сети"] : [])].join(
        " · ",
      )
    : baseSubtitle;
  const typingLabel =
    typingOthers.length === 1
      ? conversation?.kind === "group"
        ? (profiles.data?.[typingOthers[0]!] ?? "Участник") + " печатает…"
        : "печатает…"
      : "Печатают несколько участников…";

  return (
    <header className={styles.root}>
      <div className={styles.identity}>
        {mobilePane === "chat" ? (
          <IconButton
            className={styles.backBtn}
            label="Назад к списку"
            icon="back"
            size="sm"
            onClick={() => setMobilePane("list")}
          />
        ) : null}
        <Avatar
          name={
            (conversation?.kind === "direct" && peerId && profiles.data?.[peerId]) ||
            conversation?.title ||
            "Беседа"
          }
          size="md"
          online={peerOnline === true}
        />
        <div className={styles.copy}>
          <h1 className={styles.title}>
            {conversation?.kind === "direct" && peerId
              ? (profiles.data?.[peerId] ?? "Личный чат")
              : (conversation?.title ?? "Беседа")}
          </h1>
          <p className={styles.subtitle} aria-live="polite">
            {typingOthers.length ? (
              <span className={styles.typing}>{typingLabel}</span>
            ) : (
              <span className={peerOnline === true ? styles.online : undefined}>
                {subtitle}
              </span>
            )}
          </p>
          {guest ? (
            <div className={styles.guest}>
              <Badge tone="warning">Гостевой доступ — внешние участники</Badge>
            </div>
          ) : null}
        </div>
      </div>
      <div className={styles.actions}>
        {canManage ? (
          <IconButton
            label="Настройки беседы"
            icon="settings"
            size="sm"
            onClick={() => setPolicyFor(conversationId)}
          />
        ) : null}
        <details className={styles.members}>
          <summary aria-label="Участники беседы">
            <Icon name="people" size={20} />
          </summary>
          <div className={styles.membersPanel}>
            <strong>Участники</strong>
            {members.isError ? (
              <p>Список участников недоступен</p>
            ) : (
              <ul>
                {members.data?.map((member) => (
                  <li key={member.principalId}>
                    {member.principalId === session?.userId
                      ? "Вы"
                      : (profiles.data?.[member.principalId] ?? "Участник")}
                    {member.role === "guest" ? " · внешний участник" : ""}
                    {onlineStates.get(member.principalId) === "online" ? (
                      <span className={styles.online}> · в сети</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
        <IconButton
          label="Поиск в беседе"
          icon="search"
          size="sm"
          iconSize={20}
          onClick={() => setSearchOpen(true, conversationId)}
        />
      </div>
      {canManage && policyFor === conversationId ? (
        <ConversationPolicyDialog
          key={conversationId}
          conversationId={conversationId}
          onClose={() => setPolicyFor(null)}
        />
      ) : null}
    </header>
  );
}
