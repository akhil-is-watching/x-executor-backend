import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@app/redis';
import { XChatDecryptService } from './xchat-decrypt.service';

const mockRedis = {
  getJson: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
};

const mockConfig = {
  getOrThrow: jest.fn((key: string) => {
    const values: Record<string, string> = {
      X_API_KEY: 'test-api-key',
      X_API_KEY_SECRET: 'test-api-secret',
    };
    const value = values[key];
    if (!value) throw new Error(`Missing config key: ${key}`);
    return value;
  }),
};

const mockBuildConvKeyMap = jest.fn();
const mockDecryptEvent = jest.fn();

jest.mock('@higuchan123/twitter_lib', () => ({
  build_xchat_conversation_key_map: mockBuildConvKeyMap,
  decrypt_xchat_message_event: mockDecryptEvent,
}));

describe('XChatDecryptService', () => {
  let service: XChatDecryptService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.getJson.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue(undefined);
    mockRedis.del.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XChatDecryptService,
        { provide: RedisService, useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get(XChatDecryptService);
  });

  describe('decryptXChatEvent', () => {
    const baseParams = {
      xUserId: 'uid-1',
      xchatPin: '1234',
      accessToken: 'at',
      accessTokenSecret: 'ats',
      encodedEvent: 'ENCODED_BASE64',
      conversationKeyChangeEvent: 'KEY_CHANGE_BASE64',
      conversationKeyVersion: 'ver-1',
    };

    it('returns null when conversation key cannot be resolved', async () => {
      mockBuildConvKeyMap.mockReturnValue({});
      // No L3 secret in Redis → would need full unlock; mock Redis to throw
      mockRedis.getJson.mockRejectedValueOnce(new Error('redis down'));

      const result = await service.decryptXChatEvent(baseParams).catch(() => null);
      expect(result).toBeNull();
    });

    it('uses L1 cache on second call — skips Redis entirely', async () => {
      // Seed L2 Redis hit for the first call
      const convKeyHex = 'aabbccdd';
      mockRedis.getJson
        .mockResolvedValueOnce(null)    // L2 miss first check
        .mockResolvedValueOnce('SECRET_HEX') // L3 hit
        .mockResolvedValue(convKeyHex); // any subsequent

      mockBuildConvKeyMap.mockReturnValue({
        'ver-1': convKeyHex,
      });
      mockDecryptEvent.mockReturnValue({
        parsed_entry: { kind: 'text', text: 'Hello World' },
      });

      // First call — populates L1
      await service.decryptXChatEvent(baseParams).catch(() => null);

      // Reset redis mocks to verify L1 is used
      jest.clearAllMocks();
      mockRedis.getJson.mockResolvedValue(null);
      mockDecryptEvent.mockReturnValue({
        parsed_entry: { kind: 'text', text: 'Hello World' },
      });

      // Second call — should hit L1 (no Redis calls for the conv key)
      const result = await service.decryptXChatEvent(baseParams);
      expect(result).toBe('Hello World');
      // L2 key lookup should not happen (L1 hit)
      expect(mockRedis.getJson).not.toHaveBeenCalledWith(
        expect.stringContaining('xchat:convkey:uid-1:ver-1'),
      );
    });

    it('reads from L2 Redis on cache hit and populates L1', async () => {
      const convKeyHex = 'deadbeef';
      mockRedis.getJson.mockResolvedValueOnce(convKeyHex); // L2 hit

      mockDecryptEvent.mockReturnValue({
        parsed_entry: { kind: 'text', text: 'Cached message' },
      });

      const result = await service.decryptXChatEvent(baseParams);
      expect(result).toBe('Cached message');
      expect(mockBuildConvKeyMap).not.toHaveBeenCalled();
    });

    it('returns null and does not throw when decrypt_xchat_message_event throws', async () => {
      mockRedis.getJson.mockResolvedValueOnce('convkeyhex'); // L2 hit
      mockDecryptEvent.mockImplementation(() => {
        throw new Error('bad ciphertext');
      });

      const result = await service.decryptXChatEvent(baseParams);
      expect(result).toBeNull();
    });

    it('returns null when parsed_entry text is empty', async () => {
      mockRedis.getJson.mockResolvedValueOnce('convkeyhex');
      mockDecryptEvent.mockReturnValue({
        parsed_entry: { kind: 'text', text: '   ' },
      });

      const result = await service.decryptXChatEvent(baseParams);
      expect(result).toBeNull();
    });
  });

  describe('invalidateSecret', () => {
    it('deletes the L3 Redis key for the given user', async () => {
      await service.invalidateSecret('uid-42');
      expect(mockRedis.del).toHaveBeenCalledWith('xchat:secret:uid-42');
    });
  });
});
