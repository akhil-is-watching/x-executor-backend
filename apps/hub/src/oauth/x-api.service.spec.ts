import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TwitterApi } from 'twitter-api-v2';
import { XApiService } from './x-api.service';

jest.mock('twitter-api-v2', () => ({
  TwitterApi: jest.fn(),
}));

describe('XApiService', () => {
  let service: XApiService;
  const post = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    post.mockResolvedValue({ access_token: 'access' });
    (TwitterApi as jest.Mock).mockImplementation(() => ({ post }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XApiService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (name: string) => {
              if (name === 'X_API_KEY') return 'app-key';
              if (name === 'X_API_KEY_SECRET') return 'app-secret';
              throw new Error(name);
            },
          },
        },
      ],
    }).compile();

    service = module.get(XApiService);
  });

  describe('invalidateOAuth1AccessToken', () => {
    it('calls X oauth/invalidate_token with user credentials', async () => {
      await service.invalidateOAuth1AccessToken('user-token', 'user-secret');

      expect(TwitterApi).toHaveBeenCalledWith({
        appKey: 'app-key',
        appSecret: 'app-secret',
        accessToken: 'user-token',
        accessSecret: 'user-secret',
      });
      expect(post).toHaveBeenCalledWith(
        'https://api.x.com/1.1/oauth/invalidate_token',
      );
    });

    it('treats already-invalid tokens as success', async () => {
      post.mockRejectedValue({ data: { errors: [{ code: 89 }] } });

      await expect(
        service.invalidateOAuth1AccessToken('user-token', 'user-secret'),
      ).resolves.toBeUndefined();
    });
  });
});
