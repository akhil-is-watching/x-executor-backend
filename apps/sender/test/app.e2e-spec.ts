import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  API_GLOBAL_PREFIX,
  SENDER_HEALTH_PATH,
  apiRoutePath,
} from '@app/shared';
import { SenderController } from '../src/sender.controller';

describe('SenderController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SenderController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(API_GLOBAL_PREFIX);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it(`GET ${apiRoutePath(SENDER_HEALTH_PATH)}`, () => {
    return request(app.getHttpServer())
      .get(apiRoutePath(SENDER_HEALTH_PATH))
      .expect(200)
      .expect({ status: 'ok' });
  });
});
