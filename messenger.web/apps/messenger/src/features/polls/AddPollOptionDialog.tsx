import type { PollState } from "@dio/messenger-core";
import { useEffect, useRef, useState } from "react";
import { useRuntime } from "../../app/providers/RuntimeProvider.js";
import { ChatDialog } from "../../widgets/ChatDialog.js";
import { useConversationPolicy } from "../conversation/useConversationPolicy.js";
import { PollOptionEditor } from "./PollOptionEditor.js";
import { emptyPollOption, uploadPollOptions, validPollOption } from "./pollOptions.js";
import styles from "./Poll.module.css";

export function AddPollOptionDialog({
  poll,
  onSave,
  onClose,
}: {
  poll: PollState;
  onSave: (state: PollState) => Promise<void>;
  onClose: () => void;
}) {
  const { http } = useRuntime();
  const policy = useConversationPolicy(poll.conversationId);
  const [option, setOption] = useState(emptyPollOption);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const uploaded = useRef(new Map<File, string>());
  const request = useRef<AbortController>(undefined);
  useEffect(() => () => request.current?.abort(), []);
  const repeated = poll.options.some(
    ({ label }) => label.toLowerCase() === option.label.trim().toLowerCase(),
  );

  async function save() {
    if (!http || busy || repeated || !validPollOption(option)) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const [details] = await uploadPollOptions(
        [option],
        http,
        poll.conversationId,
        uploaded.current,
        controller.signal,
      );
      const state = await http.request<PollState>(
        `/v1/conversations/${poll.conversationId}/polls/${poll.id}/options`,
        {
          method: "POST",
          signal: controller.signal,
          json: { ...details, optionId: option.id, label: option.label.trim() },
        },
      );
      await onSave(state);
      onClose();
    } catch {
      if (!controller.signal.aborted) {
        setError(
          "Не удалось добавить вариант. Проверьте, что опрос открыт и файл допустим.",
        );
        setBusy(false);
      }
    }
  }

  return (
    <ChatDialog title="Добавить вариант" onClose={onClose} busy={busy} variant="sheet">
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy}>
          <PollOptionEditor
            option={option}
            index={poll.options.length}
            onChange={setOption}
            allowMedia={policy.data?.allowAttachments !== false}
          />
        </fieldset>
        {repeated && <p role="status">Такой вариант уже есть.</p>}
        {error && <p role="alert">{error}</p>}
        <footer className={styles.actions}>
          <button type="button" disabled={busy} onClick={onClose}>
            Отмена
          </button>
          <button type="submit" disabled={busy || repeated || !validPollOption(option)}>
            {busy ? "Добавление…" : "Добавить"}
          </button>
        </footer>
      </form>
    </ChatDialog>
  );
}
