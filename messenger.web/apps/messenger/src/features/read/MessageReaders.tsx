import { Avatar, Icon } from "@dio/messenger-ui";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRuntime } from "../../app/providers/RuntimeProvider.js";
import { ChatDialog } from "../../widgets/ChatDialog.js";
import { photoUrl, useProfiles, userLabel } from "../conversation/profiles.js";
import styles from "./MessageReaders.module.css";

export function MessageReaders({
  conversationId,
  messageId,
  expanded,
  onExpand,
  onClose,
  anchor,
}: {
  conversationId: string;
  messageId: string;
  expanded: boolean;
  onExpand?: (anchor: DOMRect) => void;
  anchor?: DOMRect;
  onClose: () => void;
}) {
  const { http, accountKey } = useRuntime();
  const query = useInfiniteQuery({
    queryKey: ["message-readers", accountKey, conversationId, messageId],
    enabled: !!http,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      http!.get<{
        readCount: number;
        eligibleCount: number;
        readers: { userId: string; readAt: string | null }[];
        nextOffset: number | null;
      }>(
        `/v1/conversations/${conversationId}/messages/${messageId}/readers?offset=${pageParam}`,
      ),
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    refetchInterval: 2200,
    retry: false,
  });
  const first = query.isError ? undefined : query.data?.pages[0];
  const readers = first
    ? (query.data?.pages.flatMap((page) => page.readers) ?? [])
    : [];
  const previews = readers.slice(0, 3);
  const profiles = useProfiles(
    (expanded ? readers : previews).map((reader) => reader.userId),
  );
  const single = first?.readCount === 1 && profiles.get(previews[0]?.userId ?? "");
  const label = first
    ? single
      ? userLabel(single)
      : `Прочитали ${first.readCount} из ${first.eligibleCount}`
    : query.isError
      ? "Не удалось загрузить прочтения"
      : "Загрузка прочтений…";

  if (!expanded)
    return (
      <button
        type="button"
        role="menuitem"
        className={styles.summary}
        onClick={(event) => onExpand?.(event.currentTarget.getBoundingClientRect())}
      >
        <Icon name="check-double" size={18} />
        <span>{label}</span>
        <span className={styles.avatars} aria-hidden="true">
          {previews.map(({ userId }) => {
            const profile = profiles.get(userId);
            return (
              <Avatar
                key={userId}
                name={userLabel(profile)}
                src={photoUrl(profile?.avatarUrl)}
                size="sm"
              />
            );
          })}
        </span>
      </button>
    );

  return (
    <ChatDialog
      title="Прочитали сообщение"
      onClose={onClose}
      variant="sheet"
      anchor={anchor}
    >
      {first ? (
        <>
          <strong>
            {first.readCount} из {first.eligibleCount} получателей
          </strong>
          <ul className={styles.list}>
            {readers.map(({ userId, readAt }) => {
              const profile = profiles.get(userId);
              const name = userLabel(profile);
              return (
                <li className={styles.person} key={userId}>
                  <Avatar name={name} src={photoUrl(profile?.avatarUrl)} size="sm" />
                  <span>
                    {name}
                    {readAt && (
                      <time dateTime={readAt}>
                        {new Intl.DateTimeFormat("ru-RU", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(readAt))}
                      </time>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {query.hasNextPage && (
            <button
              type="button"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              Показать ещё
            </button>
          )}
        </>
      ) : (
        <p role={query.isError ? "alert" : "status"}>{label}</p>
      )}
    </ChatDialog>
  );
}
