import { Injectable } from '@nestjs/common';

export interface CachedResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

/**
 * Lightweight in-process cache with per-entry TTL.
 *
 * Used only by the BFF to cache `GET /product/products` for two minutes.
 * The EB environment is created with `--single` (no load balancer, one
 * instance) so a Map is sufficient — no cross-process coherence needed.
 */
@Injectable()
export class CacheService {
  private readonly store = new Map<
    string,
    { value: CachedResponse; expiresAt: number }
  >();
  private readonly ttlMs = 2 * 60 * 1000;

  get(key: string): CachedResponse | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: CachedResponse): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /** Exposed for tests / health probes. */
  size(): number {
    return this.store.size;
  }
}
