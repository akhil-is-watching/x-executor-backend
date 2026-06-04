import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { randomBytes } from 'crypto';
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

  const mockXApi = {
    buildAuthorizeUrl: jest.fn(
      () => 'https://twitter.com/i/oauth2/authorize?mock=1',
    ),
    exchangeCodeForTokens: jest.fn(async () => ({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 7200,
      scope: 'tweet.read users.read',
      token_type: 'bearer',
    })),
    fetchCurrentUser: jest.fn(async () => ({
      id: 'x-user-1',
      username: 'testuser',
    })),
  };

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();

    process.env.MONGODB_URI = mongod.getUri();
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.JWT_EXPIRES_IN = '1h';
    process.env.TOKEN_ENCRYPTION_KEY = encryptionKey;
    process.env.HUB_PUBLIC_BASE_URL = 'http://localhost:3000';
    process.env.WEBHOOK_PUBLIC_BASE_URL = 'http://localhost:3001';
    process.env.X_CLIENT_ID = 'test-client';
    process.env.X_CLIENT_SECRET = 'test-secret';
    process.env.X_REDIRECT_URI =
      'http://localhost:3000/api/v1/oauth/x/callback';
    process.env.X_OAUTH_SCOPES = 'tweet.read users.read';
    process.env.X_REGISTER_WEBHOOKS_WITH_X = 'false';

    HubModule = require('../src/hub.module').HubModule;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [HubModule],
    })
      .overrideProvider(RedisService)
      .useValue(mockRedis)
      .overrideProvider(XApiService)
      .useValue(mockXApi)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['/'] });
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

  it('GET / health', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('registers, creates org, invite, oauth callback, lists connection', async () => {
    const register = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'owner@example.com', password: 'password123' })
      .expect(201);

    const token = register.body.accessToken;
    expect(token).toBeDefined();

    const org = await request(app.getHttpServer())
      .post('/api/v1/orgs')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Acme Corp' })
      .expect(201);

    const orgId = org.body.id;

    const invite = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${orgId}/invites`)
      .set('Authorization', `Bearer ${token}`)
      .send({ expiresInHours: 24, maxUses: 5 })
      .expect(201);

    const stateId = 'test-state-id';
    await app.get(OAuthStateStore).save(stateId, {
      inviteToken: invite.body.inviteToken,
      codeVerifier: 'test-verifier',
      orgId,
    });

    const callback = await request(app.getHttpServer())
      .get('/api/v1/oauth/x/callback')
      .query({ code: 'auth-code', state: stateId })
      .expect(200);

    expect(callback.body.webhookUrl).toBe(
      'http://localhost:3001/api/v1/webhooks/incoming',
    );
    expect(callback.body.subscribed).toBe(false);

    const connections = await request(app.getHttpServer())
      .get(`/api/v1/orgs/${orgId}/connections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(connections.body).toHaveLength(1);
    expect(connections.body[0].xUsername).toBe('testuser');
    expect(connections.body[0].xUserId).toBe('x-user-1');
    expect(connections.body[0].webhookUrl).toBe(callback.body.webhookUrl);
    expect(connections.body[0].subscribed).toBe(false);
  });
});
