export interface TextContentBlock {
  type: "text";
  text: string;
}

export interface MediaContentBlock {
  type: "media";
  assetId: string;
}

export interface ResourceContentBlock {
  type: "resource";
  provider: string;
  resourceType: string;
  resourceId: string;
  number?: string;
}

export interface QuoteContentBlock {
  type: "quote";
  text: string;
  messageId?: string;
}

export type ContentBlock =
  | TextContentBlock
  | MediaContentBlock
  | ResourceContentBlock
  | QuoteContentBlock;

export function textBlocks(text: string): TextContentBlock[] {
  return [{ type: "text", text }];
}

/** Parse composer text that may include `[media:uuid]` tokens into typed blocks. */
export function parseComposerContent(text: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const mediaRe = /\[media:([0-9a-fA-F-]{36})\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = mediaRe.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index).trim();
    if (before) blocks.push({ type: "text", text: before });
    blocks.push({ type: "media", assetId: match[1]! });
    lastIndex = match.index + match[0].length;
  }
  const rest = text.slice(lastIndex).trim();
  if (rest) blocks.push({ type: "text", text: rest });
  if (blocks.length === 0) blocks.push({ type: "text", text: text });
  return blocks;
}

export function blocksToPlainPreview(blocks: ContentBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === "text") return b.text;
      if (b.type === "media") return "📎 Вложение";
      if (b.type === "resource") return b.number ? `#${b.number}` : "Заявка";
      if (b.type === "quote") return `«${b.text}»`;
      return "";
    })
    .filter(Boolean)
    .join(" ");
}

export function extractPlainText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!content || typeof content !== "object") {
    return "";
  }

  const record = content as { blocks?: unknown; text?: unknown };
  if (typeof record.text === "string") {
    return record.text;
  }

  if (!Array.isArray(record.blocks)) {
    return "";
  }

  return record.blocks
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      const b = block as {
        type?: string;
        text?: string;
        assetId?: string;
        number?: string;
      };
      if (b.type === "text" && typeof b.text === "string") return b.text;
      if (b.type === "media") return "📎 Вложение";
      if (b.type === "resource") return b.number ? `#${b.number}` : "Заявка";
      if (b.type === "quote" && typeof b.text === "string") return `«${b.text}»`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function extractBlocks(content: unknown): ContentBlock[] {
  if (!content || typeof content !== "object") return [];
  const record = content as { blocks?: unknown };
  if (!Array.isArray(record.blocks)) return [];
  return record.blocks.filter(
    (b): b is ContentBlock =>
      !!b && typeof b === "object" && typeof (b as ContentBlock).type === "string",
  );
}
