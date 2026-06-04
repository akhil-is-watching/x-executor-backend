import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { HubModule } from './hub.module';

async function bootstrap() {
  const app = await NestFactory.create(HubModule);
  app.setGlobalPrefix('api/v1', { exclude: ['/'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  const port = process.env.PORT ?? process.env.port ?? 3000;
  await app.listen(port);
}
bootstrap();
