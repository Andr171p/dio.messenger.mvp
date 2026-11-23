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

export type ContentBlock =
  | TextContentBlock
  | MediaContentBlock
  | ResourceContentBlock;

export function textBlocks(text: string): TextContentBlock[] {
  return [{ type: "text", text }];
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
      const b = block as { type?: string; text?: string };
      return b.type === "text" && typeof b.text === "string" ? b.text : "";
    })
    .filter(Boolean)
    .join("\n");
}
