import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createHmac } from 'crypto';
import { Types } from 'mongoose';
import { NatsJsService } from '@app/nats-js';
import type { XWebhookReceivedEvent } from '@app/shared';
import { API_GLOBAL_PREFIX } from '@app/shared';
import { XConnection } from '../src/schemas/x-connection.schema';
import { createCrcResponse } from '../src/x-webhook.crypto';
import { SHARED_WEBHOOK_ID } from '../src/incoming/incoming.service';

function signWebhookBody(body: string, consumerSecret: string): string {
  const hash = createHmac('sha256', consumerSecret)
    .update(body)
    .digest('base64');
  return `sha256=${hash}`;
}

describe('Webhook (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let WebhookModule: any;

  const publishedEvents: XWebhookReceivedEvent[] = [];
  const mockNatsJs = {
    publishJson: jest.fn(async (_subject: string, event: XWebhookReceivedEvent) => {
      publishedEvents.push(event);
    }),
    onModuleInit: jest.fn(),
    onModuleDestroy: jest.fn(),
  };

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();

    process.env.MONGODB_URI = mongod.getUri();
    process.env.NATS_URL = 'nats://localhost:4222';
    process.env.X_CLIENT_SECRET = 'test-secret';
    process.env.WEBHOOK_PUBLIC_BASE_URL = 'http://localhost:3001';

    WebhookModule = require('../src/webhook.module').WebhookModule;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [WebhookModule],
    })
      .overrideProvider(NatsJsService)
      .useValue(mockNatsJs)
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix(API_GLOBAL_PREFIX);
    await app.init();
  }, 120_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (mongod) {
      await mongod.stop();
    }
  });

  beforeEach(() => {
    publishedEvents.length = 0;
    jest.clearAllMocks();
  });

  it('GET /xbot/v1/api/health', () => {
    return request(app.getHttpServer())
      .get('/xbot/v1/api/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('handles CRC and signed X webhook events on shared ingress URL', async () => {
    const orgId = new Types.ObjectId();
    const connectionId = new Types.ObjectId();

    const connectionModel = app.get(getModelToken(XConnection.name));

    await connectionModel.create({
      _id: connectionId,
      orgId,
      xUserId: 'x-user-1',
      xUsername: 'testuser',
      scopes: [],
      accessTokenEnc: 'enc',
    });

    const crc = await request(app.getHttpServer())
      .get('/xbot/v1/api/webhooks/incoming')
      .query({ crc_token: 'crc-challenge' })
      .expect(200);

    expect(crc.body).toEqual(
      createCrcResponse('crc-challenge', process.env.X_CLIENT_SECRET!),
    );

    const payload = {
      for_user_id: 'x-user-1',
      tweet_create_events: [{ id_str: '123' }],
    };
    const rawBody = JSON.stringify(payload);
    const signature = signWebhookBody(rawBody, process.env.X_CLIENT_SECRET!);

    const received = await request(app.getHttpServer())
      .post('/xbot/v1/api/webhooks/incoming')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', signature)
      .send(rawBody)
      .expect(200);

    expect(received.body.received).toBe(true);
    expect(received.body.eventIds).toHaveLength(1);
    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0]).toMatchObject({
      eventId: received.body.eventIds[0],
      orgId: orgId.toString(),
      connectionId: connectionId.toString(),
      xUserId: 'x-user-1',
      xUsername: 'testuser',
      webhookId: SHARED_WEBHOOK_ID,
      eventTypes: ['tweet_create_events'],
      payload,
    });

    await request(app.getHttpServer())
      .post('/xbot/v1/api/webhooks/incoming')
      .set('Content-Type', 'application/json')
      .set('x-twitter-webhooks-signature', 'sha256=invalid')
      .send(rawBody)
      .expect(401);
  });
});
