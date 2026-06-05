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

  it('fetchInboundConversation falls back to dm/list for opaque XChat id', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          conversations: [
            {
              conversation_id: '3012852462-1345154135381794816',
              type: 'ONE_TO_ONE',
              unread: true,
              participants: [
                { id: '3012852462' },
                { id: '1345154135381794816' },
              ],
              last_message: {
                id: '1',
                senderId: '1345154135381794816',
                text: 'hello',
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          conversation_id: '3012852462-1345154135381794816',
          messages: [{ id: '1', senderId: '1345154135381794816', text: 'hello' }],
        }),
      });
    global.fetch = fetchMock as typeof fetch;

    const result = await service.fetchInboundConversation({
      authToken: 'auth',
      xUserId: '3012852462',
      conversationId: 'opaque-xchat-id',
    });

    expect(result.conversationId).toBe('3012852462-1345154135381794816');
    expect(result.recipientId).toBe('1345154135381794816');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.getxapi.com/twitter/dm/list',
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api.getxapi.com/twitter/dm/conversation',
    );
  });

  it('fetchInboundConversation retries dm/list after legacy id 404', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () =>
          '{"error":"HTTP 404: {\\"errors\\":[{\\"code\\":279,\\"message\\":\\"The direct message conversation doesn\'t exist.\\"}]}"}',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          conversations: [
            {
              conversation_id: '3012852462-1345154135381794816',
              type: 'ONE_TO_ONE',
              unread: true,
              participants: [
                { id: '3012852462' },
                { id: '1345154135381794816' },
              ],
              last_message: {
                id: '1',
                senderId: '1345154135381794816',
                text: 'hello',
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          conversation_id: '3012852462-1345154135381794816',
          messages: [{ id: '1', senderId: '1345154135381794816', text: 'hello' }],
        }),
      });
    global.fetch = fetchMock as typeof fetch;

    const result = await service.fetchInboundConversation({
      authToken: 'auth',
      xUserId: '3012852462',
      conversationId: '3012852462-1345154135381794816',
      recipientId: '1345154135381794816',
    });

    expect(result.conversationId).toBe('3012852462-1345154135381794816');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('fetchInboundConversation resolves XChat colon conversation id', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        conversation_id: '1390625949587173378-1774607208379',
        messages: [{ id: '1', senderId: '1774607208379', text: 'hello' }],
      }),
    });
    global.fetch = fetchMock as typeof fetch;

    const result = await service.fetchInboundConversation({
      authToken: 'auth',
      xUserId: '1390625949587173378',
      conversationId: '1390625949587173378:1774607208379',
    });

    expect(result.conversationId).toBe('1774607208379-1390625949587173378');
    expect(result.recipientId).toBe('1774607208379');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).conversation_id).toBe(
      '1774607208379-1390625949587173378',
    );
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
