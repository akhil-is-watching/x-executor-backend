import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { randomBytes } from 'crypto';
import { API_GLOBAL_PREFIX, HUB_API_PREFIX, HUB_HEALTH_PATH, hubApiRoutePath } from '@app/shared';
import { NatsJsService } from '@app/nats-js';
import { XApiService } from '../src/oauth/x-api.service';
import { RedisService } from '@app/redis';
import { OAuthStateStore } from '../src/oauth/oauth-state.store';

const encryptionKey = randomBytes(32).toString('base64');

describe('Hub (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let HubModule: any;

  const redisStore = new Map<string, string>();
  const mockRedis = {
    setJson: jest.fn(async (key: string, value: unknown) => {
      redisStore.set(key, JSON.stringify(value));
    }),
    getJson: jest.fn(async <T>(key: string): Promise<T | null> => {
      const raw = redisStore.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    }),
    del: jest.fn(async (key: string) => {
      redisStore.delete(key);
    }),
    onModuleInit: jest.fn(),
    onModuleDestroy: jest.fn(),
  };

  const mockNatsJs = {
    publishJson: jest.fn(),
    onModuleInit: jest.fn(),
    onModuleDestroy: jest.fn(),
  };

  const mockXApi = {
    getRequestToken: jest.fn(async () => ({
      oauthToken: 'oauth-token-test',
      oauthTokenSecret: 'oauth-secret-test',
      authUrl: 'https://api.twitter.com/oauth/authorize?oauth_token=oauth-token-test',
    })),
    exchangeVerifierForTokens: jest.fn(async () => ({
      accessToken: 'access',
      accessTokenSecret: 'access-secret',
      userId: 'x-user-1',
      screenName: 'testuser',
    })),
    fetchUserProfileOAuth1: jest.fn(async () => ({
      id: 'x-user-1',
      username: 'testuser',
    })),
  };

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();

    process.env.MONGODB_URI = mongod.getUri();
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.NATS_URL = 'nats://localhost:4222';
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.JWT_EXPIRES_IN = '1h';
    process.env.TOKEN_ENCRYPTION_KEY = encryptionKey;
    process.env.HUB_PUBLIC_BASE_URL = 'http://localhost:3000';
    process.env.WEBHOOK_PUBLIC_BASE_URL = 'http://localhost:3001';
    process.env.X_API_KEY = 'test-api-key';
    process.env.X_API_KEY_SECRET = 'test-api-secret';
    process.env.X_REDIRECT_URI =
      `http://localhost:3000/${HUB_API_PREFIX}/oauth/x/callback`;
    process.env.X_REGISTER_WEBHOOKS_WITH_X = 'false';

    HubModule = require('../src/hub.module').HubModule;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [HubModule],
    })
      .overrideProvider(RedisService)
      .useValue(mockRedis)
      .overrideProvider(NatsJsService)
      .useValue(mockNatsJs)
      .overrideProvider(XApiService)
      .useValue(mockXApi)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(HUB_API_PREFIX);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
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

  it(`GET ${hubApiRoutePath(HUB_HEALTH_PATH)}`, () => {
    return request(app.getHttpServer())
      .get(hubApiRoutePath(HUB_HEALTH_PATH))
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('registers, creates org, invite, oauth callback, lists connection', async () => {
    const register = await request(app.getHttpServer())
      .post('/xbot/v1/api/hub/auth/register')
      .send({ email: 'owner@example.com', password: 'password123' })
      .expect(201);

    const token = register.body.accessToken;
    expect(token).toBeDefined();

    const org = await request(app.getHttpServer())
      .post('/xbot/v1/api/hub/orgs')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Acme Corp' })
      .expect(201);

    const orgId = org.body.id;

    const invite = await request(app.getHttpServer())
      .post(`/xbot/v1/api/hub/orgs/${orgId}/invites`)
      .set('Authorization', `Bearer ${token}`)
      .send({ expiresInHours: 24, maxUses: 5 })
      .expect(201);

    const oauthToken = 'oauth-token-test';
    await app.get(OAuthStateStore).save(oauthToken, {
      inviteToken: invite.body.inviteToken,
      oauthTokenSecret: 'oauth-secret-test',
      orgId,
    });

    const callback = await request(app.getHttpServer())
      .get('/xbot/v1/api/hub/oauth/x/callback')
      .query({ oauth_token: oauthToken, oauth_verifier: 'oauth-verifier-test' })
      .expect(200);

    expect(callback.body.webhookUrl).toBe(
      'http://localhost:3001/xbot/v1/api/webhook/incoming',
    );
    expect(callback.body.subscribed).toBe(false);

    const connections = await request(app.getHttpServer())
      .get(`/xbot/v1/api/hub/orgs/${orgId}/connections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(connections.body).toHaveLength(1);
    expect(connections.body[0].xUsername).toBe('testuser');
    expect(connections.body[0].xUserId).toBe('x-user-1');
    expect(connections.body[0].webhookUrl).toBe(callback.body.webhookUrl);
    expect(connections.body[0].subscribed).toBe(false);
  });

  it('rejects creating a second organization for the same user', async () => {
    const register = await request(app.getHttpServer())
      .post('/xbot/v1/api/hub/auth/register')
      .send({ email: 'solo@example.com', password: 'password123' })
      .expect(201);

    const token = register.body.accessToken;

    await request(app.getHttpServer())
      .post('/xbot/v1/api/hub/orgs')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'First Org' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/xbot/v1/api/hub/orgs')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Second Org' })
      .expect(409);
  });
});
