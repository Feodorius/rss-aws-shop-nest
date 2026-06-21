import { Injectable, Logger } from '@nestjs/common';
import { request as undiciRequest, errors as undiciErrors } from 'undici';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ServicesConfig } from '../config/services.config';
import { CacheService } from '../cache/cache.service';
import {
  HOP_BY_HOP_HEADERS,
  copyRequestHeaders,
  pickResponseHeaders,
} from './header-utils';

const BODYLESS_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  constructor(
    private readonly services: ServicesConfig,
    private readonly cache: CacheService,
  ) {}

  async forward(
    service: string,
    req: FastifyRequest,
    res: FastifyReply,
  ): Promise<void> {
    const baseUrl = this.services.resolve(service);
    if (!baseUrl) {
      this.logger.warn(`Unknown recipient service "${service}"`);
      await res.status(502).send({ message: 'Cannot process request' });
      return;
    }

    const tail = this.extractTail(req.url, service);
    const target = this.joinUrl(baseUrl, tail);

    const cacheKey = this.cacheKeyFor(service, req.method, tail);
    if (cacheKey) {
      const hit = this.cache.get(cacheKey);
      if (hit) {
        this.logger.log(`Cache HIT: ${cacheKey}`);
        this.replay(res, hit.status, hit.headers, hit.body);
        return;
      }
    }

    const headers = copyRequestHeaders(req.headers, HOP_BY_HOP_HEADERS);
    const method = (req.method || 'GET').toUpperCase();
    const body = BODYLESS_METHODS.has(method)
      ? undefined
      : (req.body as Buffer | string | undefined);

    this.logger.log(`-> ${method} ${target}`);

    try {
      const upstream = await undiciRequest(target, {
        method: method as any,
        headers,
        body,
      });

      const buf = Buffer.from(await upstream.body.arrayBuffer());
      const respHeaders = pickResponseHeaders(upstream.headers as any);

      if (cacheKey && upstream.statusCode === 200) {
        this.cache.set(cacheKey, {
          status: upstream.statusCode,
          headers: respHeaders,
          body: buf,
        });
        this.logger.log(`Cache STORE: ${cacheKey}`);
      }

      this.replay(res, upstream.statusCode, respHeaders, buf);
    } catch (err) {
      const message =
        err instanceof undiciErrors.UndiciError
          ? `Upstream network error: ${err.message}`
          : `Upstream unavailable: ${(err as Error).message}`;
      this.logger.error(`${target} -> ${message}`);
      await res.status(502).send({ message: 'Upstream unavailable' });
    }
  }

  /**
   * Drop the first path segment (the recipient service name) and keep the
   * remainder, including the query string. Example: req.url = "/product/products/123?x=1",
   * service = "product"  ->  tail = "/products/123?x=1".
   */
  private extractTail(url: string, service: string): string {
    const prefix = `/${service}`;
    if (url === prefix) return '/';
    if (url.startsWith(`${prefix}/`)) return url.slice(prefix.length);
    if (url.startsWith(`${prefix}?`)) return `/${url.slice(prefix.length)}`;
    return url; // shouldn't happen but be defensive
  }

  /** Glue base URL and tail (which always starts with "/") robustly. */
  private joinUrl(base: string, tail: string): string {
    const trimmedBase = base.replace(/\/+$/, '');
    const trimmedTail = tail.startsWith('/') ? tail : `/${tail}`;
    return `${trimmedBase}${trimmedTail}`;
  }

  /**
   * Return a cache key when the request matches the only cacheable shape:
   * `GET {bff}/product/products` (no /{id}, no query string). All other
   * combinations bypass the cache.
   */
  private cacheKeyFor(
    service: string,
    method: string,
    tail: string,
  ): string | null {
    if (service !== 'product') return null;
    if ((method || 'GET').toUpperCase() !== 'GET') return null;
    if (tail === '/products' || tail === '/products/') {
      return 'GET /product/products';
    }
    return null;
  }

  private replay(
    res: FastifyReply,
    status: number,
    headers: Record<string, string>,
    body: Buffer,
  ): void {
    for (const [name, value] of Object.entries(headers)) {
      res.header(name, value);
    }
    res.status(status).send(body);
  }
}
