import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { API_GLOBAL_PREFIX, resolveListenPort } from '@app/shared';
import { WebhookModule } from './webhook.module';

const httpLogger = new Logger('HTTP');

async function bootstrap() {
  const app = await NestFactory.create(WebhookModule, { rawBody: true });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const started = Date.now();
    res.on('finish', () => {
      httpLogger.log(
        `${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - started}ms)`,
      );
    });
    next();
  });
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  const port = resolveListenPort();
  await app.listen(port);
  httpLogger.log(`Webhook listening on port ${port}`);
}
bootstrap();
