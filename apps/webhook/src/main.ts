import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
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
  app.setGlobalPrefix('api/v1', { exclude: ['/'] });
  const port = process.env.PORT ?? process.env.port ?? 3001;
  await app.listen(port);
  httpLogger.log(`Webhook listening on port ${port}`);
}
bootstrap();
