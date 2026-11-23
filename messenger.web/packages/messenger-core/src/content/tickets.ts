const TICKET_INLINE = /#(INC-[\w-]+|REQ-[\w-]+|\d+)/i;

/** Extract display number like INC-228 from message text (not a UUID). */
export function extractTicketNumber(text: string): string | null {
  const match = TICKET_INLINE.exec(text);
  return match ? match[1]! : null;
}

/** @deprecated use extractTicketNumber — resourceId for preview must be UUID from typed link */
export function extractTicketResourceId(text: string): string | null {
  return extractTicketNumber(text);
}

export const DIODESK_PROVIDER = "dio-desk";
