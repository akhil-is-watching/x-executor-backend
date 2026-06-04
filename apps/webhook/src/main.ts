import { NestFactory } from '@nestjs/core';
import { WebhookModule } from './webhook.module';

async function bootstrap() {
  const app = await NestFactory.create(WebhookModule, { rawBody: true });
  app.setGlobalPrefix('api/v1', { exclude: ['/'] });
  const port = process.env.PORT ?? process.env.port ?? 3001;
  await app.listen(port);
}
bootstrap();
