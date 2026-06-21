import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Resolves a recipient service name (e.g. "product", "cart") to its base URL
 * using values supplied via environment variables / .env.
 *
 * Contract: env var name == recipient name (lowercase). This matches the
 * routing convention `{bff}/{recipient}/...` in the task spec and lets the
 * operator add new recipients via `eb setenv name=url` without code changes.
 */
@Injectable()
export class ServicesConfig {
  constructor(private readonly config: ConfigService) {}

  /** Returns the base URL for the recipient, or undefined when unknown. */
  resolve(name: string): string | undefined {
    if (!name) return undefined;
    const raw = this.config.get<string>(name);
    if (!raw || typeof raw !== 'string') return undefined;
    return raw.trim();
  }
}
