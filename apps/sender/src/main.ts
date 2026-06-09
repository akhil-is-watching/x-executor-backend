import { NestFactory } from '@nestjs/core';
import { API_GLOBAL_PREFIX } from '@app/shared';
import { SenderModule } from './sender.module';

async function bootstrap() {
  const app = await NestFactory.create(SenderModule);
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  const port =
    process.env.SENDER_PORT ?? process.env.PORT ?? process.env.port ?? 3003;
  await app.listen(port);
}
bootstrap();
