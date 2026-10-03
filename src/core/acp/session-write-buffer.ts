/**
 * SessionWriteBuffer — Batched, debounced persistence for session history.
 *
 * Instead of writing every notification to DB immediately, this buffer
 * collects notifications and flushes them in batches when:
 * - A session exits streaming mode (turn ends / idle)
 * - The buffer exceeds a size threshold (50 entries)
 * - A debounce timer fires (5 seconds fallback)
 *
 * This dramatically reduces I/O during active agent streaming where
 * hundreds of `agent_message_chunk` notifications arrive per second.
 */

import type { SessionUpdateNotification } from "./http-session-store";
import { consolidateMessageHistory } from "./http-session-store";

export interface SessionWriteBufferOptions {
  /** Max notifications per session before auto-flush. Default: 50 */
  maxBufferSize?: number;
  /** Debounce interval in ms for timer-based flush. Default: 5000 */
  debounceMs?: number;
  /** Actual persistence function (injected for testability) */
  persistFn: (
    sessionId: string,
    history: SessionUpdateNotification[],
  ) => Promise<void>;
}

export class SessionWriteBuffer {
  private buffers = new Map<string, SessionUpdateNotification[]>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private flushPromises = new Map<string, Promise<void>>();
  private readonly maxBufferSize: number;
  private readonly debounceMs: number;
  private readonly persistFn: SessionWriteBufferOptions["persistFn"];

  constructor(options: SessionWriteBufferOptions) {
    this.maxBufferSize = options.maxBufferSize ?? 50;
    this.debounceMs = options.debounceMs ?? 5000;
    this.persistFn = options.persistFn;
  }

  /**
   * Add a notification to the buffer. May trigger an auto-flush
   * if the buffer exceeds maxBufferSize.
   */
  add(sessionId: string, notification: SessionUpdateNotification): void {
    const buf = this.buffers.get(sessionId) ?? [];
    buf.push(notification);
    this.buffers.set(sessionId, buf);

    // Auto-flush if buffer is full
    if (buf.length >= this.maxBufferSize) {
      void this.flush(sessionId);
      return;
    }

    // Reset debounce timer
    this.resetTimer(sessionId);
  }

  /**
   * Replace the buffered content for a session with a full history snapshot.
   * This is used at turn boundaries where the caller already has the complete,
   * consolidated history and wants the persistence layer to overwrite the
   * previous snapshot rather than append duplicate entries.
   */
  replace(sessionId: string, history: SessionUpdateNotification[]): void {
    this.buffers.set(sessionId, [...history]);
    this.resetTimer(sessionId);
  }

  /**
   * Flush all buffered notifications for a session to the database.
   * Consolidates message chunks before writing.
   * Safe to call multiple times — concurrent flushes are serialized.
   */
  async flush(sessionId: string): Promise<void> {
    this.clearTimer(sessionId);

    const buf = this.buffers.get(sessionId);
    if (!buf || buf.length === 0) return;

    // Take ownership of the buffer and clear it
    this.buffers.delete(sessionId);

    // Consolidate chunks before persisting
    const consolidated = consolidateMessageHistory(buf);

    // Serialize flushes per session to avoid race conditions
    const prev = this.flushPromises.get(sessionId) ?? Promise.resolve();
    const next = prev.then(async () => {
      try {
        await this.persistFn(sessionId, consolidated);
      } catch (err) {
        console.error(`[SessionWriteBuffer] Flush failed for ${sessionId}:`, err);
      }
    });
    this.flushPromises.set(sessionId, next);
    await next;
  }

  /**
   * Flush all sessions. Used during graceful shutdown.
   */
  async flushAll(): Promise<void> {
    const sessionIds = [...this.buffers.keys()];
    await Promise.allSettled(sessionIds.map((id) => this.flush(id)));
  }

  /**
   * Get the current buffer size for a session (for testing/monitoring).
   */
  bufferSize(sessionId: string): number {
    return this.buffers.get(sessionId)?.length ?? 0;
  }

  /**
   * Check if there are any pending writes for a session.
   */
  hasPending(sessionId: string): boolean {
    return (this.buffers.get(sessionId)?.length ?? 0) > 0;
  }

  /**
   * Dispose all timers. Call on shutdown.
   */
  dispose(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  // ─── Private ──────────────────────────────────────────────────────

  private resetTimer(sessionId: string): void {
    this.clearTimer(sessionId);
    const timer = setTimeout(() => {
      this.timers.delete(sessionId);
      void this.flush(sessionId);
    }, this.debounceMs);
    this.timers.set(sessionId, timer);
  }

  private clearTimer(sessionId: string): void {
    const existing = this.timers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(sessionId);
    }
  }
}
