import { HttpError, type PollState } from "@dio/messenger-core";
import { Avatar, Icon } from "@dio/messenger-ui";
import { useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { useRuntime } from "../../app/providers/RuntimeProvider.js";
import { ChatDialog } from "../../widgets/ChatDialog.js";
import { MessageMedia } from "../../widgets/MessageMedia.js";
import { AddPollOptionDialog } from "./AddPollOptionDialog.js";
import { photoUrl, useProfiles, userLabel } from "../conversation/profiles.js";
import styles from "./Poll.module.css";

export function PollCard({
  id,
  conversationId,
  userId,
  question,
  onPreview,
}: {
  id: string;
  conversationId: string;
  userId?: string;
  question: string;
  onPreview: (assetId: string, file: { filename: string; contentType: string }) => void;
}) {
  const { db, http, sync, accountKey } = useRuntime();
  const endpoint = `/v1/conversations/${conversationId}/polls/${id}`;
  const cached = useLiveQuery(() => db?.polls.get(id), [db, id]);
  const [selection, setSelection] = useState<string[]>();
  const ballotAttempt = useRef<
    { selection: string[] | undefined; operationId: string } | undefined
  >(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [addingOption, setAddingOption] = useState(false);
  async function store(state: PollState) {
    if (!db) return;
    await db.transaction("rw", db.polls, db.conversations, async () => {
      if (!(await db.conversations.get(conversationId))) return;
      const existing = await db.polls.get(id);
      if (existing?.state && existing.state.eventSeq > state.eventSeq) return;
      await db.polls.put({
        id,
        conversationId,
        eventSeq: existing?.eventSeq ?? 0,
        state,
      });
    });
  }
  const query = useQuery({
    queryKey: ["poll", accountKey, id, cached?.eventSeq || 0],
    enabled: !!http,
    queryFn: async () => {
      const state = await http!.get<PollState>(endpoint);
      await store(state);
      return state;
    },
    retry: false,
    refetchOnWindowFocus: true,
  });
  const { refetch } = query;
  useEffect(() => {
    if (!sync) return;
    let connected = sync.getStatus().wsConnected;
    return sync.subscribe((status) => {
      if (status.wsConnected && !connected) void refetch();
      connected = status.wsConnected;
    });
  }, [sync, refetch]);
  const inaccessible =
    query.error instanceof HttpError && [401, 403, 404].includes(query.error.status);
  const poll = inaccessible ? undefined : (cached?.state ?? query.data);
  const choosing =
    !!poll && !poll.isClosed && (selection !== undefined || !poll.myOptionIds.length);
  const voters = useQuery({
    queryKey: ["poll-voters", accountKey, id, cached?.eventSeq, showResults],
    enabled:
      !!http && !!poll?.showVoters && !!poll.totalVoters && (!choosing || showResults),
    queryFn: () =>
      http!.get<Record<string, string[]>>(`${endpoint}/voters?preview=${!showResults}`),
    placeholderData: (previous) => previous,
    retry: false,
  });
  const profiles = useProfiles(Object.values(voters.data ?? {}).flat());

  async function submit(action: "votes" | "close", optionIds = selection) {
    if (!http || busy) return;
    setBusy(true);
    setError("");
    try {
      if (
        action === "votes" &&
        (!ballotAttempt.current ||
          !optionIds ||
          ballotAttempt.current.selection?.join() !== optionIds.join())
      ) {
        ballotAttempt.current = {
          selection: optionIds,
          operationId: crypto.randomUUID(),
        };
      }
      await store(
        await http.post<PollState>(
          `${endpoint}/${action}`,
          action === "votes"
            ? { optionIds, operationId: ballotAttempt.current?.operationId }
            : undefined,
        ),
      );
      setSelection(undefined);
      void refetch();
    } catch {
      setError("Не удалось сохранить изменения.");
      void refetch();
    } finally {
      setBusy(false);
    }
  }

  if (!poll)
    return (
      <div className={styles.card}>
        <h3>{question}</h3>
        <p className={styles.muted}>
          {query.isFetching ? "Загрузка опроса…" : "Опрос недоступен"}
        </p>
      </div>
    );
  const canAdd =
    !poll.isClosed && poll.createdBy === userId && poll.options.length < 10;
  return (
    <section className={styles.card} aria-label="Опрос">
      <h3>{poll.question}</h3>
      {poll.description && <p className={styles.description}>{poll.description}</p>}
      <p className={styles.muted}>
        {poll.showVoters ? "Публичный опрос" : "Анонимный опрос"} ·{" "}
        {poll.isClosed
          ? "Закрыт"
          : poll.allowsMultiple
            ? "Несколько ответов"
            : "Один ответ"}
      </p>
      {poll.options.map((option) => {
        const selected = poll.myOptionIds.includes(option.id);
        const percent = poll.totalVoters
          ? Math.round((100 * option.voteCount) / poll.totalVoters)
          : 0;
        return (
          <div
            key={option.id}
            className={`${styles.choice} ${selected ? styles.selected : ""}`}
          >
            {choosing ? (
              <label className={styles.choiceInput}>
                <input
                  type={poll.allowsMultiple ? "checkbox" : "radio"}
                  name={id}
                  checked={selection?.includes(option.id) ?? false}
                  disabled={busy}
                  onChange={(event) => {
                    if (!poll.allowsMultiple) {
                      setSelection([option.id]);
                      void submit("votes", [option.id]);
                    } else if (event.target.checked)
                      setSelection([...(selection ?? []), option.id]);
                    else
                      setSelection((items) =>
                        items?.filter((item) => item !== option.id),
                      );
                  }}
                />{" "}
                {option.label}
              </label>
            ) : (
              <>
                <span className={styles.percent}>{percent}%</span>
                <span className={styles.resultLabel}>
                  <span>{option.label}</span>
                  {poll.showVoters && option.voteCount > 0 && (
                    <span className={styles.voterPreview}>
                      <span>{option.voteCount}</span>
                      {voters.data?.[option.id]?.slice(0, 2).map((voter) => {
                        const profile = profiles.get(voter);
                        return (
                          <Avatar
                            key={voter}
                            name={userLabel(profile)}
                            src={photoUrl(profile?.avatarUrl)}
                            size="sm"
                          />
                        );
                      })}
                    </span>
                  )}
                </span>
                {selected && (
                  <span className={styles.check} aria-label="Ваш выбор">
                    <Icon name="check" size={14} />
                  </span>
                )}
                <span aria-hidden="true" className={styles.bar}>
                  <span className={styles.fill} style={{ width: `${percent}%` }} />
                </span>
              </>
            )}
            {(option.link || option.assetId) && (
              <div className={styles.extras}>
                {option.link && (
                  <a href={option.link} target="_blank" rel="noopener noreferrer">
                    {new URL(option.link).hostname} ↗
                  </a>
                )}
                {option.assetId && (
                  <MessageMedia
                    assetId={option.assetId}
                    onPreview={(file) => onPreview(option.assetId!, file)}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
      {canAdd && (
        <button
          className={styles.addOption}
          type="button"
          onClick={() => setAddingOption(true)}
        >
          ＋ <span>Добавить вариант</span>
        </button>
      )}
      {query.isPaused && <p className={styles.muted}>Нет подключения</p>}
      <div className={styles.cardActions}>
        {choosing && (poll.allowsMultiple || !!error) && (
          <button
            type="button"
            disabled={busy || !selection?.length || query.isPaused}
            onClick={() => void submit("votes")}
          >
            Проголосовать
          </button>
        )}
        {choosing && poll.myOptionIds.length > 0 && (
          <button type="button" disabled={busy} onClick={() => setSelection(undefined)}>
            Отмена
          </button>
        )}
        {!choosing && !poll.isClosed && poll.allowsRevoting && (
          <button type="button" onClick={() => setSelection(poll.myOptionIds)}>
            Изменить голос
          </button>
        )}
        {!choosing && (
          <button
            className={styles.votesButton}
            type="button"
            onClick={() => setShowResults(true)}
          >
            Голоса ({poll.totalVoters})
          </button>
        )}
        {!poll.isClosed && userId === poll.createdBy && (
          <button
            className={styles.secondaryAction}
            type="button"
            disabled={busy || query.isPaused}
            onClick={() => void submit("close")}
          >
            Закрыть опрос
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {addingOption && canAdd && (
        <AddPollOptionDialog
          poll={poll}
          onSave={store}
          onClose={() => setAddingOption(false)}
        />
      )}
      {showResults && (
        <ChatDialog
          title={`Голоса (${poll.totalVoters})`}
          onClose={() => setShowResults(false)}
          variant="sheet"
        >
          {!poll.showVoters && <p className={styles.muted}>Анонимный опрос</p>}
          {poll.showVoters && poll.totalVoters > 0 && voters.isError && (
            <p role="alert">Не удалось загрузить участников.</p>
          )}
          {poll.showVoters && poll.totalVoters > 0 && voters.isPending && (
            <p>Загрузка…</p>
          )}
          {poll.options.map((option) => (
            <section key={option.id}>
              <h3>
                {option.label} · {option.voteCount}
              </h3>
              {voters.data?.[option.id]?.map((voter) => {
                const profile = profiles.get(voter);
                const name = userLabel(profile);
                return (
                  <p className={styles.person} key={voter}>
                    <Avatar name={name} src={photoUrl(profile?.avatarUrl)} size="sm" />{" "}
                    {name}
                  </p>
                );
              })}
            </section>
          ))}
        </ChatDialog>
      )}
    </section>
  );
}
