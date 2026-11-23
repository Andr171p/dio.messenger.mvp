const TICKET_INLINE = /#(INC-[\w-]+)/i;

export function extractTicketResourceId(text: string): string | null {
  const match = TICKET_INLINE.exec(text);
  return match ? match[1]! : null;
}