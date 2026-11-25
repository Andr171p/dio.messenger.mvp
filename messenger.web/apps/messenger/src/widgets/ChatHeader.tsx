import type { Conversation } from "@dio/messenger-core";
import { Avatar, Badge, Icon, IconButton } from "@dio/messenger-ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../app/providers/AuthProvider.js";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useUiStore } from "../stores/uiStore.js";
import { useConversationMembers } from "../features/read/useConversationMembers.js";
import {
  chatTitle,
  photoUrl,
  useProfiles,
  userLabel,
  type Profile,
} from "../features/conversation/profiles.js";
import { groupPhoto } from "./groupPhoto.js";
import { ChatMemberPicker } from "./ChatMemberPicker.js";
import { ChatSharedContent } from "./ChatSharedContent.js";
import { ChatDialog } from "./ChatDialog.js";
import { useGroupTopics } from "./GroupTopics.js";
import { ProfileDialog } from "./ProfileDialog.js";
import dialog from "./NewChatModal.module.css";
import styles from "./ChatHeader.module.css";
import { ConversationPolicyDialog } from "./ConversationPolicyDialog.js";

function presenceLabel(
  kind: Conversation["kind"] | undefined,
  memberCount: number | undefined,
  peerOnline: boolean | null,
): string {
  if (kind === "group") {
    if (memberCount === undefined) return "Группа";
    const form = new Intl.PluralRules("ru").select(memberCount);
    return `${memberCount} ${form === "one" ? "участник" : form === "few" ? "участника" : "участников"}`;
  }
  if (peerOnline === true) return "В сети";
  if (peerOnline === false) return "не в сети";
  return "Личный чат";
}

export function ChatHeader() {
  const { db, sync, http, accountKey } = useRuntime();
  const { session } = useAuth();
  const conversationId = useUiStore((s) => s.selectedConversationId);
  const queries = useQueryClient();
  const avatarInput = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [more, setMore] = useState(false);
  const [adding, setAdding] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [removing, setRemoving] = useState(false);
  const muteKey = accountKey + ":" + conversationId;
  const muted = useUiStore((s) => s.mutedChats[muteKey]);
  const toggleMute = useUiStore((s) => s.toggleChatMute);
  const refreshMembers = () => {
    void queries.invalidateQueries({
      queryKey: ["conversation-members", accountKey, conversationId],
    });
  };
  const members = useConversationMembers(conversationId);
  const [memberLimit, setMemberLimit] = useState(40);
  const [infoFor, setInfoFor] = useState<string>();
  const [profile, setProfile] = useState<Profile>();
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

  const topics = useGroupTopics(conversation?.kind === "group" ? conversationId : null);
  const threadId = useUiStore((s) => s.selectedThreadId);
  const topicTitle = topics.data?.find((topic) => topic.id === threadId)?.title;
  const peerId =
    conversation?.kind === "direct"
      ? (conversation.peerId ??
        members.data?.find((m) => m.principalId !== session?.userId)?.principalId)
      : undefined;

  const typing =
    conversationId && sync ? (sync.getTyping(conversationId)?.userIds ?? []) : [];
  const typingOthers = typing.filter((id) => id !== session?.userId);
  const recordingOthers = (
    conversationId && sync
      ? (sync.getRecordingAudio(conversationId)?.userIds ?? [])
      : []
  ).filter((id) => id !== session?.userId);

  const visibleMembers =
    infoFor === conversationId ? (members.data?.slice(0, memberLimit) ?? []) : [];
  const profiles = useProfiles([
    peerId,
    ...typingOthers,
    ...recordingOthers,
    ...visibleMembers.map((m) => m.principalId),
  ]);

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
        ? userLabel(profiles.get(typingOthers[0]!)) + " печатает…"
        : "печатает…"
      : "Печатают несколько участников…";
  const recorderName = recordingOthers[0]
    ? profiles.get(recordingOthers[0])?.fullName
    : undefined;
  const activityLabel =
    recordingOthers.length > 1
      ? "Несколько участников записывают аудио…"
      : recordingOthers.length === 1
        ? (recorderName ??
            (conversation?.kind === "direct" ? "Собеседник" : "Участник")) +
          " записывает аудио…"
        : typingOthers.length
          ? typingLabel
          : null;

  const peer = peerId ? profiles.get(peerId) : undefined;
  const title =
    conversation?.kind === "direct" && peer ? userLabel(peer) : chatTitle(conversation);
  const photo = photoUrl(peer?.avatarUrl ?? conversation?.avatarUrl);
  async function saveAvatar(file: File | null) {
    if (!http || !db || !conversationId || avatarBusy) return;
    setAvatarBusy(true);
    setAvatarError("");
    try {
      const avatarUrl = file ? await groupPhoto(file) : null;
      await http.put(`/v1/conversations/${conversationId}/avatar`, { avatarUrl });
      await db.conversations.update(conversationId, {
        avatarUrl: avatarUrl ?? undefined,
      });
    } catch {
      setAvatarError(
        "Не удалось обновить фото. Выберите JPEG, PNG или WebP до 5 МБ или проверьте подключение.",
      );
    } finally {
      setAvatarBusy(false);
    }
  }

  function openInfo() {
    setAvatarError("");
    setMemberError("");
    setMore(false);
    setAdding(false);
    setMemberLimit(40);
    setInfoFor(conversationId!);
    setProfile(undefined);
  }
  return (
    <>
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
          <button
            className={styles.infoButton}
            aria-haspopup="dialog"
            aria-label={`Информация о беседе ${title}`}
            onClick={openInfo}
          >
            <Avatar name={title} src={photo} size="md" online={peerOnline === true} />
            <div className={styles.copy}>
              <h1 className={styles.title}>{topicTitle || title}</h1>
              <p className={styles.subtitle} aria-live="polite">
                {activityLabel ? (
                  <span className={styles.typing}>{activityLabel}</span>
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
          </button>
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
          <IconButton
            label="Участники беседы"
            icon="people"
            size="sm"
            onClick={openInfo}
          />
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
      {infoFor === conversationId && (
        <>
          <ChatDialog
            title={
              conversation?.kind === "direct"
                ? "Личная переписка"
                : "Информация о группе"
            }
            onClose={() => setInfoFor(undefined)}
            variant="chat"
            busy={avatarBusy}
          >
            <input
              ref={avatarInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void saveAvatar(file);
              }}
            />
            <div className={dialog.hero}>
              <Avatar name={title} src={photo} size="lg" />
              <h3>{topicTitle || title}</h3>
              {topicTitle && <p>{title}</p>}
              <div className={dialog.chatActions}>
                <button
                  type="button"
                  aria-pressed={!!muted}
                  onClick={() => toggleMute(muteKey)}
                >
                  <Icon name={muted ? "bell-slash" : "bell"} size={24} />
                  {muted ? "Включить уведомления" : "Выключить уведомления"}
                </button>
                <div className={dialog.moreAnchor}>
                  <button
                    type="button"
                    aria-expanded={more}
                    onClick={() => setMore(!more)}
                  >
                    <Icon name="more" size={24} />
                    Ещё
                  </button>
                  {more && (
                    <div className={dialog.chatMenu} aria-label="Действия чата">
                      <button
                        type="button"
                        disabled={conversation?.kind !== "group" || !role}
                        onClick={() => {
                          setMore(false);
                          setAdding(true);
                        }}
                      >
                        <Icon name="user-plus" />
                        Добавить участника
                      </button>
                      {canManage && conversation?.kind === "group" && (
                        <>
                          <button
                            type="button"
                            disabled={avatarBusy}
                            onClick={() => {
                              setMore(false);
                              avatarInput.current?.click();
                            }}
                          >
                            <Icon name="image" />
                            {photo ? "Сменить аватар" : "Добавить аватар"}
                          </button>
                          {photo && (
                            <button
                              type="button"
                              disabled={avatarBusy}
                              onClick={() => {
                                setMore(false);
                                void saveAvatar(null);
                              }}
                            >
                              <Icon name="trash" />
                              Удалить аватар
                            </button>
                          )}
                        </>
                      )}
                      <button type="button" disabled>
                        <Icon name="sliders" />
                        Управление группой
                      </button>
                      <button type="button" disabled>
                        <Icon name="copy" />
                        Копировать ссылку
                      </button>
                      <button type="button" disabled>
                        <Icon name="download" />
                        Экспорт истории
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {avatarBusy && <p role="status">Сохраняем аватар…</p>}
            {avatarError && <p role="alert">{avatarError}</p>}
            {conversation?.description && <p>{conversation.description}</p>}
            {conversation?.kind === "group" && !topics.data?.length && (
              <button
                className={dialog.textButton}
                onClick={() => {
                  useUiStore.getState().setTopicsOpen(true);
                  setInfoFor(undefined);
                }}
              >
                Темы группы
              </button>
            )}
            {conversation?.kind === "direct" && peerId && (
              <button
                className={dialog.userRow}
                onClick={() => setProfile(peer ?? { id: peerId, fullName: title })}
              >
                Открыть профиль собеседника
              </button>
            )}
            <ChatSharedContent
              key={threadId ?? conversationId}
              conversationId={conversationId}
              threadId={threadId}
            />
            <section className={dialog.sharedSection}>
              <h3>Участники{members.data ? ` · ${members.data.length}` : ""}</h3>
              {members.isPending && <p role="status">Загружаем участников…</p>}
              {members.isError && (
                <p role="status">Список участников пока недоступен.</p>
              )}
              {memberError && <p role="alert">{memberError}</p>}
              <ul className={dialog.users}>
                {visibleMembers.map((member) => {
                  const user = profiles.get(member.principalId) ?? {
                    id: member.principalId,
                  };
                  return (
                    <li key={user.id} className={dialog.memberLine}>
                      <button
                        className={dialog.userRow}
                        onClick={() => setProfile(user)}
                      >
                        <Avatar
                          name={userLabel(user)}
                          src={photoUrl(user.avatarUrl)}
                          size="sm"
                          online={onlineStates.get(user.id) === "online"}
                        />
                        <span className={dialog.userCopy}>
                          <strong>
                            {userLabel(user)}
                            {user.id === session?.userId ? " (вы)" : ""}
                          </strong>
                          <small>
                            {onlineStates.get(user.id) === "online"
                              ? "В сети"
                              : "Не в сети"}
                          </small>
                        </span>
                        {member.role !== "member" && (
                          <span className={dialog.roleBadge}>
                            {
                              {
                                owner: "Владелец",
                                admin: "Администратор",
                                guest: "Гость",
                              }[member.role]
                            }
                          </span>
                        )}
                      </button>
                      {role === "owner" && user.id !== session?.userId && (
                        <IconButton
                          icon="trash"
                          size="sm"
                          label={`Удалить участника ${userLabel(user)}`}
                          disabled={removing}
                          onClick={async () => {
                            if (
                              !http ||
                              removing ||
                              !window.confirm(
                                `Удалить участника ${userLabel(user)} из группы?`,
                              )
                            )
                              return;
                            setRemoving(true);
                            setMemberError("");
                            try {
                              await http.request(
                                `/v1/conversations/${conversationId}/members/${user.id}`,
                                { method: "DELETE" },
                              );
                              refreshMembers();
                            } catch {
                              setMemberError("Не удалось удалить участника.");
                            } finally {
                              setRemoving(false);
                            }
                          }}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
              {(members.data?.length ?? 0) > memberLimit && (
                <button
                  className={dialog.textButton}
                  onClick={() => setMemberLimit((n) => n + 40)}
                >
                  Ещё участники
                </button>
              )}
            </section>
          </ChatDialog>
          {adding && (
            <ChatMemberPicker
              conversationId={conversationId}
              members={members.data?.map((m) => m.principalId) ?? []}
              onClose={() => setAdding(false)}
              onAdded={refreshMembers}
            />
          )}
          {profile && (
            <ProfileDialog
              initial={profile}
              onClose={() => setProfile(undefined)}
              onOpenChat={() => setInfoFor(undefined)}
            />
          )}
        </>
      )}
    </>
  );
}
