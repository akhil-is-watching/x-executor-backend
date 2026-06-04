import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import * as request from 'supertest';
import { NatsJsService } from '@app/nats-js';
import { GetxapiService } from '@app/getxapi';
import { SenderModule } from './../src/sender.module';
import { XConnection } from './../src/schemas/x-connection.schema';

describe('SenderController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [SenderModule],
    })
      .overrideModule(ConfigModule)
      .useModule(
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              MONGODB_URI: 'mongodb://localhost:27017/test',
              NATS_URL: 'nats://localhost:4222',
              REDIS_URL: 'redis://localhost:6379',
              TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
              GETXAPI_API_KEY: 'test-key',
            }),
          ],
        }),
      )
      .overrideProvider(NatsJsService)
      .useValue({
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
        startJsonConsumer: jest.fn(),
      })
      .overrideProvider(GetxapiService)
      .useValue({ sendDm: jest.fn() })
      .overrideProvider(getModelToken(XConnection.name))
      .useValue({ findOne: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({ status: 'ok' });
  });
});
