import { NestFactory } from '@nestjs/core';
import { API_GLOBAL_PREFIX } from '@app/shared';
import { AnalyticsModule } from './analytics.module';

async function bootstrap() {
  const app = await NestFactory.create(AnalyticsModule);
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
