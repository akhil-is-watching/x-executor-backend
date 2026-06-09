import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@app/redis';
import { XChatDecryptService } from './xchat-decrypt.service';

const mockRedis = {
  get: jest.fn(),
  getJson: jest.fn(),
  setJson: jest.fn(),
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
    mockRedis.get.mockResolvedValue(null);
    mockRedis.getJson.mockResolvedValue(null);
    mockRedis.setJson.mockResolvedValue(undefined);
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
      mockRedis.get.mockRejectedValueOnce(new Error('redis down'));

      const result = await service.decryptXChatEvent(baseParams).catch(() => null);
      expect(result).toBeNull();
    });

    it('uses L1 cache on second call — skips Redis entirely', async () => {
      const convKeyHex = 'aabbccdd';
      mockRedis.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(JSON.stringify('SECRET_HEX'))
        .mockResolvedValue(null);

      mockBuildConvKeyMap.mockReturnValue({
        'ver-1': convKeyHex,
      });
      mockDecryptEvent.mockReturnValue({
        parsed_entry: { kind: 'text', text: 'Hello World' },
      });

      await service.decryptXChatEvent(baseParams).catch(() => null);

      jest.clearAllMocks();
      mockRedis.get.mockResolvedValue(null);
      mockDecryptEvent.mockReturnValue({
        parsed_entry: { kind: 'text', text: 'Hello World' },
      });

      const result = await service.decryptXChatEvent(baseParams);
      expect(result).toBe('Hello World');
      expect(mockRedis.get).not.toHaveBeenCalledWith(
        expect.stringContaining('xchat:convkey:uid-1:ver-1'),
      );
    });

    it('reads from L2 Redis on cache hit and populates L1', async () => {
      const convKeyHex = 'deadbeef';
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(convKeyHex));

      mockDecryptEvent.mockReturnValue({
        parsed_entry: { kind: 'text', text: 'Cached message' },
      });

      const result = await service.decryptXChatEvent(baseParams);
      expect(result).toBe('Cached message');
      expect(mockBuildConvKeyMap).not.toHaveBeenCalled();
    });

    it('reads legacy raw hex values stored via setex', async () => {
      mockRedis.get.mockResolvedValueOnce('cafebabe');
      mockDecryptEvent.mockReturnValue({
        parsed_entry: { kind: 'text', text: 'Legacy cache hit' },
      });

      const result = await service.decryptXChatEvent(baseParams);
      expect(result).toBe('Legacy cache hit');
    });

    it('returns null and does not throw when decrypt_xchat_message_event throws', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify('convkeyhex'));
      mockDecryptEvent.mockImplementation(() => {
        throw new Error('bad ciphertext');
      });

      const result = await service.decryptXChatEvent(baseParams);
      expect(result).toBeNull();
    });

    it('returns null when parsed_entry text is empty', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify('convkeyhex'));
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
