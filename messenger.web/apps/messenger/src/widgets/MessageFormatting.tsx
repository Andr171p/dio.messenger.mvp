import { extractTicketNumber } from "@dio/messenger-core";
import { Fragment, useState, type ReactNode } from "react";
import styles from "./MessageFormatting.module.css";

const marks = [
  ["**", "strong"],
  ["__", "u"],
  ["~~", "s"],
  ["||", "spoiler"],
  ["*", "em"],
  ["_", "em"],
  ["\x60", "code"],
] as const;

export function maskSpoilers(text: string): string {
  return text.replace(/(?<!\\)\|\|[^\r\n]*?(?:\|\||(?=\r?$))/gm, "▰▰▰");
}

function Spoiler({ children }: { children: ReactNode }) {
  const [revealed, reveal] = useState(false);
  return (
    <button
      type="button"
      className={styles.spoiler}
      aria-expanded={revealed}
      aria-label={revealed ? undefined : "Показать скрытый текст"}
      onClick={() => reveal(!revealed)}
    >
      <span aria-hidden={!revealed}>{children}</span>
    </button>
  );
}

function inline(
  text: string,
  openTicket: ((number: string) => void) | undefined,
  depth = 0,
  links = true,
): ReactNode[] {
  if (depth >= 6) return [text];
  const result: ReactNode[] = [];
  const specials = /\\[\\#*_~|()[\]\x60]|[#[*_~|\x60]/g;
  let cursor = 0;
  for (let match = specials.exec(text); match; match = specials.exec(text)) {
    const start = match.index;
    const literal = match[0];
    let end = start;
    let formatted: ReactNode;
    if (literal.startsWith("\\")) {
      formatted = literal.slice(1);
      end = start + literal.length;
    } else if (literal === "[" && links) {
      const link = /^\[([^\]\n]+)\]\((https?:\/\/[^\s()<>"']+)\)/i.exec(
        text.slice(start),
      );
      if (link) {
        formatted = (
          <a href={link[2]} target="_blank" rel="noopener noreferrer">
            {inline(link[1]!, undefined, depth + 1, false)}
          </a>
        );
        end = start + link[0].length;
      }
    } else if (
      literal === "#" &&
      links &&
      openTicket &&
      !/[\p{L}\p{N}_]/u.test(text[start - 1] ?? "")
    ) {
      const number = extractTicketNumber(text.slice(start));
      if (number && text.startsWith("#" + number, start)) {
        formatted = (
          <button
            type="button"
            className={styles.ticketReference}
            onClick={(event) => {
              event.currentTarget.focus({ preventScroll: true });
              openTicket(number);
            }}
          >
            #{number}
          </button>
        );
        end = start + number.length + 1;
      }
    } else {
      const mark = marks.find(([delimiter]) => text.startsWith(delimiter, start));
      if (mark) {
        const [delimiter, Tag] = mark;
        const from = start + delimiter.length;
        let close = text.indexOf(delimiter, from);
        while (close > from && text[close - 1] === "\\")
          close = text.indexOf(delimiter, close + delimiter.length);
        const body = text.slice(from, close);
        if (
          close > from &&
          body.trim() &&
          !body.includes("\n") &&
          (delimiter !== "_" || !/[\p{L}\p{N}]/u.test(text[start - 1] ?? ""))
        ) {
          const children =
            Tag === "code" || Tag === "spoiler"
              ? body
              : inline(body, openTicket, depth + 1, links);
          formatted =
            Tag === "spoiler" ? (
              links ? (
                <Spoiler>{children}</Spoiler>
              ) : (
                "▰▰▰"
              )
            ) : (
              <Tag>{children}</Tag>
            );
          end = close + delimiter.length;
        } else {
          specials.lastIndex = from;
        }
      }
    }
    if (end === start) continue;
    result.push(
      text.slice(cursor, start),
      <Fragment key={start}>{formatted}</Fragment>,
    );
    cursor = specials.lastIndex = end;
  }
  result.push(text.slice(cursor));
  return result;
}

export function MessageFormatting({
  text,
  openTicket,
}: {
  text: string;
  openTicket?: (number: string) => void;
}) {
  const fence = /(?:^|\n)\x60{3}[\w+-]*[ \t]*\r?\n([\s\S]*?)\r?\n\x60{3}(?=\r?\n|$)/g;
  const renderText = (value: string) =>
    value
      .split(/(^> [^\r\n]*(?:\r?\n> [^\r\n]*)*)/m)
      .map((part, index) =>
        index % 2 ? (
          <blockquote key={index}>
            {inline(part.replace(/^> /gm, ""), openTicket)}
          </blockquote>
        ) : (
          <Fragment key={index}>{inline(part, openTicket)}</Fragment>
        ),
      );
  const result: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(fence)) {
    result.push(
      <Fragment key={cursor}>
        {renderText(text.slice(cursor, match.index))}
        <pre>
          <code>{match[1]}</code>
        </pre>
      </Fragment>,
    );
    cursor = match.index + match[0].length;
  }
  return (
    <div className={styles.body}>
      {result}
      {renderText(text.slice(cursor))}
    </div>
  );
}
