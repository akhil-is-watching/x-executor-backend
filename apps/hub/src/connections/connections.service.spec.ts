import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { RedisService } from '@app/redis';
import { XConnection } from '../schemas/x-connection.schema';
import { TokenCryptoService } from '../crypto/token-crypto.service';
import { XApiService } from '../oauth/x-api.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import {
  ConnectionsService,
  XCHAT_SECRET_REDIS_PREFIX,
} from './connections.service';

describe('ConnectionsService', () => {
  let service: ConnectionsService;

  const orgId = new Types.ObjectId();
  const connectionId = new Types.ObjectId();
  const xUserId = '123456789';

  const connection = {
    _id: connectionId,
    orgId,
    xUserId,
    xUsername: 'testuser',
    accessTokenEnc: 'enc:access',
    accessTokenSecretEnc: 'enc:secret',
    authTokenEnc: 'enc-auth',
    xchatPinEnc: 'enc-pin',
  };

  const connectionModel = {
    findOne: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };

  const webhooksService = {
    revokeForConnection: jest.fn().mockResolvedValue(undefined),
    getWebhookMetadataByConnectionIds: jest.fn(),
    getSharedWebhookUrl: jest.fn(),
  };

  const xApi = {
    invalidateOAuth1AccessToken: jest.fn().mockResolvedValue(undefined),
  };

  const tokenCrypto = {
    encrypt: jest.fn((v: string) => `enc:${v}`),
    decrypt: jest.fn((v: string) => v.replace(/^enc:/, '')),
  };

  const redis = {
    del: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectionsService,
        {
          provide: getModelToken(XConnection.name),
          useValue: connectionModel,
        },
        {
          provide: WebhooksService,
          useValue: webhooksService,
        },
        {
          provide: XApiService,
          useValue: xApi,
        },
        {
          provide: TokenCryptoService,
          useValue: tokenCrypto,
        },
        {
          provide: RedisService,
          useValue: redis,
        },
      ],
    }).compile();

    service = module.get(ConnectionsService);
  });

  describe('revoke', () => {
    it('revokes webhooks, logs out on X, clears XChat cache, and removes stored secrets', async () => {
      connectionModel.findOne.mockResolvedValue(connection);

      const result = await service.revoke(orgId.toString(), connectionId.toString());

      expect(result).toEqual({ revoked: true });
      expect(webhooksService.revokeForConnection).toHaveBeenCalledWith(connection);
      expect(xApi.invalidateOAuth1AccessToken).toHaveBeenCalledWith(
        'access',
        'secret',
      );
      expect(redis.del).toHaveBeenCalledWith(`${XCHAT_SECRET_REDIS_PREFIX}${xUserId}`);
      expect(connectionModel.updateOne).toHaveBeenCalledWith(
        { _id: connectionId },
        {
          $set: { revokedAt: expect.any(Date) },
          $unset: {
            accessTokenEnc: 1,
            accessTokenSecretEnc: 1,
            authTokenEnc: 1,
            xchatPinEnc: 1,
            refreshTokenEnc: 1,
            tokenExpiresAt: 1,
          },
        },
      );
    });

    it('throws when connection is not found', async () => {
      connectionModel.findOne.mockResolvedValue(null);

      await expect(
        service.revoke(orgId.toString(), connectionId.toString()),
      ).rejects.toThrow(NotFoundException);

      expect(webhooksService.revokeForConnection).not.toHaveBeenCalled();
      expect(xApi.invalidateOAuth1AccessToken).not.toHaveBeenCalled();
      expect(redis.del).not.toHaveBeenCalled();
      expect(connectionModel.updateOne).not.toHaveBeenCalled();
    });
  });
});
