import { NestFactory } from '@nestjs/core';
import { resolveListenPort } from '@app/shared';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(resolveListenPort());
}
bootstrap();
