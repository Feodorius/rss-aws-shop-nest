import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';

import { AppModule } from './app.module';

async function bootstrap() {
  const adapter = new FastifyAdapter({
    logger: false,
    // 10 MB cap is generous for product/cart payloads and CSV imports
    bodyLimit: 10 * 1024 * 1024,
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    { bufferLogs: true },
  );

  // CORS — the frontend lives on a different origin (CloudFront / localhost:5173)
  app.enableCors({
    origin: true,
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin'],
  });

  // Pass-through body forwarding: Fastify's default parsers re-serialize the
  // payload (JSON, urlencoded). We need it byte-for-byte to relay to upstream.
  const fastify = app.getHttpAdapter().getInstance();
  fastify.removeAllContentTypeParsers();
  fastify.addContentTypeParser(
    '*',
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body),
  );

  // EB single-container Docker proxies nginx -> container on port 80 by
  // default. For local development override via PORT in .env.
  const port = Number(process.env.PORT) || 80;
  await app.listen(port, '0.0.0.0');

  Logger.log(`BFF Service listening on :${port}`, 'Bootstrap');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start BFF Service:', err);
  process.exit(1);
});
