/**
 * PHASE-016 · the chaos-slice test harness (T13; SYNC_TESTS §1 + §7): a
 * seeded-RNG simulator with a fault-injecting transport and an in-memory
 * device store — the deterministic substrate the C-01/03/04/07/09/16
 * scenarios run against. Server-side effects are observed through the
 * injected `ServerProbe` (the harness never re-implements server logic —
 * it replays what the server contract says happened).
 */

import type { PullEnvelope, PushItemResult } from "@erp/contracts";

import { SyncClient, type SyncTransport } from "../client";
import { applyMigrations, memoryAdapter, type StorageAdapter } from "../store/adapter";

/** Deterministic RNG (mulberry32) — every scenario is replayable from
 * its seed (SYNC_TESTS §9 Sev-1 requirement). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The observed server-side effects (the ledger oracle input). */
export interface ServerProbe {
  /** Executed commands, in execution order — the exactly-once oracle
   * asserts one ledger effect per unique idempotencyKey. */
  executed: { commandId: string; idempotencyKey: string; at: number }[];
  /** The per-key results the server returned (replays must return the
   * ORIGINAL result — C-01). */
  resultsByKey: Map<string, PushItemResult>;
}

export type FaultMode =
  | { kind: "none" }
  | { kind: "dropConnection" } // transport throws mid-batch (C-04/C-09)
  | { kind: "duplicateDelivery" } // the batch is delivered twice (C-01)
  | { kind: "rejectSome"; fraction: number; reason: string } // C-09 typed rejects
  | { kind: "clockSkew"; skewMs: number } // C-07 (server-authoritative dates)
  | { kind: "storageFullAtCapture" }; // C-16 loud failure

/**
 * A fake server honoring the §11 dedupe contract: every idempotencyKey
 * executes exactly once; replays return the original result.
 */
export class FakeServer {
  readonly probe: ServerProbe = { executed: [], resultsByKey: new Map() };
  private clock = 1_700_000_000_000;

  constructor(rng: () => number = seededRandom(1)) {
    // The RNG is part of the harness signature for replayability; the
    // deterministic rejection targeting below hashes the OFF- number
    // instead (simpler to assert), so the seed is reserved for future
    // interleaving scenarios.
    void rng;
  }

  tick(): number {
    this.clock += 1;
    return this.clock;
  }

  push(batchId: string, commands: readonly Record<string, unknown>[]): PushItemResult[] {
    const results: PushItemResult[] = [];
    for (const raw of commands) {
      const id = String(raw.id ?? "");
      const key = String(raw.idempotencyKey ?? "");
      const original = this.probe.resultsByKey.get(key);
      if (original !== undefined) {
        // Replay: the original result verbatim, zero new effects (C-01).
        results.push(original);
        continue;
      }
      const rejection = this.shouldReject(raw);
      if (rejection !== null) {
        const result: PushItemResult = {
          id,
          status: "REJECTED",
          idempotencyKey: key,
          reason: rejection as PushItemResult extends { reason: infer R } ? R : never,
          message: `server decision: ${rejection}`,
          action: rejection === "PRICE_CHANGED" ? "ACCEPT_SERVER_PRICE" : "CANCEL_WITH_REASON",
        };
        this.probe.executed.push({ commandId: id, idempotencyKey: key, at: this.tick() });
        this.probe.resultsByKey.set(key, result);
        results.push(result);
        continue;
      }
      const result: PushItemResult = {
        id,
        status: "ACCEPTED",
        idempotencyKey: key,
        result: {
          officialNo: `POS-T1-2611-${String(this.probe.executed.length + 1).padStart(5, "0")}`,
          invoiceId: id,
          journalEntryId: `je-${key}`,
          replay: false,
        },
      };
      this.probe.executed.push({ commandId: id, idempotencyKey: key, at: this.tick() });
      this.probe.resultsByKey.set(key, result);
      results.push(result);
    }
    void batchId;
    return results;
  }

  private rejectionPolicy: { targets: readonly string[]; reason: string } | null = null;

  /** Deterministic typed rejections: the listed OFF- numbers are rejected
   * (C-03's single failure; C-09's two of twenty) — every other command
   * accepts. Replays of a rejected command return the original rejection. */
  setRejectionTargets(targets: readonly string[], reason: string): void {
    this.rejectionPolicy = { targets, reason };
  }

  clearRejectionTargets(): void {
    this.rejectionPolicy = null;
  }

  private shouldReject(raw: Record<string, unknown>): string | null {
    if (raw.type !== "pos_sale" || this.rejectionPolicy === null) return null;
    const sale = raw.sale as { offlineReceiptNo?: string } | undefined;
    if (sale?.offlineReceiptNo !== undefined && this.rejectionPolicy.targets.includes(sale.offlineReceiptNo)) {
      return this.rejectionPolicy.reason;
    }
    return null;
  }
}

/** The fault-injecting transport: wraps a device's push path with the
 * SYNC_TESTS §1 fault modes. */
export class FaultTransport implements SyncTransport {
  constructor(
    private readonly server: FakeServer,
    private mode: FaultMode = { kind: "none" },
  ) {}

  setMode(mode: FaultMode): void {
    this.mode = mode;
  }

  async pull(entityType: string, cursor: string | null): Promise<PullEnvelope> {
    if (this.mode.kind === "dropConnection") {
      throw new Error("simulated connection drop");
    }
    return {
      entityType,
      cursor: cursor ?? "cursor-1",
      hasMore: false,
      changes: [],
    };
  }

  async push(batchId: string, commands: readonly Record<string, unknown>[]): Promise<PushItemResult[]> {
    switch (this.mode.kind) {
      case "dropConnection":
        throw new Error("simulated connection drop mid-batch");
      case "duplicateDelivery": {
        // The server sees the batch TWICE (network retry) — it must
        // execute once and replay the original results (C-01).
        this.server.push(batchId, commands);
        return this.server.push(batchId, commands);
      }
      default:
        return this.server.push(batchId, commands);
    }
  }
}

/** A device: local store + sync client wired through a fault transport. */
export function makeDevice(
  server: FakeServer,
  seed: number = 42,
): {
  adapter: StorageAdapter;
  client: SyncClient;
  transport: FaultTransport;
} {
  void seed; // devices hash their own OFF- numbers deterministically
  const adapter = memoryAdapter();
  applyMigrations(adapter);
  const transport = new FaultTransport(server);
  return { adapter, client: new SyncClient(adapter, transport), transport };
}
