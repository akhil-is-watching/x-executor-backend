import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { GetxapiRateLimiterService } from './getxapi-rate-limiter.service';
import { GetxapiService } from './getxapi.service';

describe('GetxapiService', () => {
  let service: GetxapiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetxapiService,
        {
          provide: GetxapiRateLimiterService,
          useValue: { acquire: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (name: string) => {
              if (name === 'GETXAPI_API_KEY') return 'test-api-key';
              throw new Error(name);
            },
            get: (name: string) => {
              if (name === 'GETXAPI_BASE_URL') return 'https://api.getxapi.com';
              return undefined;
            },
          },
        },
      ],
    }).compile();

    service = module.get(GetxapiService);
  });

  it('extractLatestIncomingPlainText returns peer message', () => {
    const text = service.extractLatestIncomingPlainText(
      [
        { id: '1', senderId: 'bot', text: 'bot reply' },
        { id: '2', senderId: 'user-2', text: '  hello  ' },
      ],
      'bot',
    );
    expect(text).toBe('hello');
  });

  it('extractLatestIncomingPeerId returns latest peer sender', () => {
    expect(
      service.extractLatestIncomingPeerId(
        [
          { id: '1', senderId: 'bot', text: 'bot reply' },
          { id: '2', senderId: 'user-2', text: 'hello' },
        ],
        'bot',
      ),
    ).toBe('user-2');
  });

  it('fetchConversation calls GetXAPI', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        conversation_id: '1-2',
        messages: [{ id: '1', senderId: '2', text: 'hi' }],
      }),
    });
    global.fetch = fetchMock as typeof fetch;

    const result = await service.fetchConversation({
      authToken: 'auth',
      conversationId: '1-2',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.getxapi.com/twitter/dm/conversation',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.conversation_id).toBe('1-2');
  });

  it('sendDm calls GetXAPI', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        data: { id: 'msg-1' },
      }),
    });
    global.fetch = fetchMock as typeof fetch;

    const result = await service.sendDm({
      authToken: 'auth',
      recipientId: '123',
      text: 'hello',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.getxapi.com/twitter/dm/send',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      auth_token: 'auth',
      recipient_id: '123',
      text: 'hello',
    });
    expect(result.status).toBe('success');
  });
});
