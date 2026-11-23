export class SyncGapError extends Error {
  override readonly name = "SyncGapError";
  constructor(
    readonly lastSeq: number,
    readonly incomingSeq: number,
  ) {
    super(`Sync gap: expected ${lastSeq + 1}, got ${incomingSeq}`);
  }
}

export class SnapshotRequiredError extends Error {
  override readonly name = "SnapshotRequiredError";
  constructor(readonly conversationId: string) {
    super(`Snapshot required for conversation ${conversationId}`);
  }
}