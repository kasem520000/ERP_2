/** @erp/sync-core — PHASE-016 · the POS-scoped offline sync core. */
export {
  LOCAL_MIGRATIONS,
  applyMigrations,
  memoryAdapter,
  type LocalMigration,
  type StorageAdapter,
} from "./store/adapter";
export {
  applyPullBatch,
  capturePosSale,
  markSaleRejected,
  markSaleSynced,
  posAppliers,
  readCursor,
  readMeta,
  writeMeta,
  type LocalCursor,
} from "./store/pull";
export {
  applyResult,
  cancel,
  enqueue,
  markInFlight,
  nextBatch,
  queueStats,
  rejectedCommands,
  recoverInFlight,
  requeue,
  type ApplyResultInput,
  type EnqueueInput,
  type OutboxRow,
  type OutboxStatus,
} from "./outbox/engine";
export {
  buildPosSaleCommand,
  buildShiftCloseCommand,
  buildShiftOpenCommand,
  currentOfflineSeq,
  nextOfflineNumber,
  type PosSaleDraft,
} from "./commands/builders";
export { SyncClient, type SyncOutcome, type SyncTransport } from "./client";
export {
  FakeServer,
  FaultTransport,
  makeDevice,
  seededRandom,
  type FaultMode,
  type ServerProbe,
} from "./test-harness/chaos";
