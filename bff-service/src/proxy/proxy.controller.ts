import {
  All,
  Controller,
  Get,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ProxyService } from './proxy.service';

/**
 * Wildcard router. The first path segment names a recipient service; the
 * rest of the URL is forwarded to that service's base URL.
 *
 *   GET  /                      -> health probe (EB)
 *   ANY  /:service              -> proxy to the recipient root
 *   ANY  /:service/*            -> proxy to the recipient with the tail path
 */
@Controller()
export class ProxyController {
  constructor(private readonly proxy: ProxyService) {}

  @Get('/')
  health(): { ok: true; service: 'bff' } {
    return { ok: true, service: 'bff' };
  }

  @All('/:service')
  rootForward(
    @Param('service') service: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) res: FastifyReply,
  ): Promise<void> {
    return this.proxy.forward(service, req, res);
  }

  @All('/:service/*')
  tailForward(
    @Param('service') service: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) res: FastifyReply,
  ): Promise<void> {
    return this.proxy.forward(service, req, res);
  }
}
