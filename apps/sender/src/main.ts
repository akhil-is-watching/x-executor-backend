import { NestFactory } from '@nestjs/core';
import { API_GLOBAL_PREFIX, resolveListenPort } from '@app/shared';
import { SenderModule } from './sender.module';

async function bootstrap() {
  const app = await NestFactory.create(SenderModule);
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  await app.listen(resolveListenPort());
}
bootstrap();
