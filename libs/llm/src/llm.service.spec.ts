import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import OpenAI from 'openai';
import { LlmService, parseLlmResponse } from './llm.service';

const createMock = jest.fn();
const OpenAIMock = OpenAI as jest.MockedClass<typeof OpenAI>;

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: (...args: unknown[]) => createMock(...args),
      },
    },
  })),
}));

describe('parseLlmResponse', () => {
  it('parses reply and knownAnswer from JSON', () => {
    expect(
      parseLlmResponse(
        '{"reply":"We ship on Fridays.","knownAnswer":true}',
      ),
    ).toEqual({
      replyText: 'We ship on Fridays.',
      isKnownAnswer: true,
    });
  });

  it('defaults knownAnswer to true when omitted from JSON', () => {
    expect(parseLlmResponse('{"reply":"We ship on Fridays."}')).toEqual({
      replyText: 'We ship on Fridays.',
      isKnownAnswer: true,
    });
  });

  it('extracts reply from JSON embedded in noise', () => {
    expect(
      parseLlmResponse(
        'Here is the response: {"reply":"We ship on Fridays.","knownAnswer":true}',
      ),
    ).toEqual({
      replyText: 'We ship on Fridays.',
      isKnownAnswer: true,
    });
  });

  it('parses knownAnswer false from JSON', () => {
    expect(
      parseLlmResponse(
        '{"reply":"Please contact support@acme.com","knownAnswer":false}',
      ),
    ).toEqual({
      replyText: 'Please contact support@acme.com',
      isKnownAnswer: false,
    });
  });

  it('strips redacted_thinking blocks', () => {
    expect(
      parseLlmResponse(
        '<think>\nSome reasoning here.\n</think>\n\nActual reply',
      ),
    ).toEqual({
      replyText: 'Actual reply',
      isKnownAnswer: true,
    });
  });

  it('returns null for empty output', () => {
    expect(parseLlmResponse('')).toBeNull();
    expect(parseLlmResponse('   ')).toBeNull();
  });

  it('returns plain text directly when model skips JSON format', () => {
    expect(
      parseLlmResponse('Hey there! How can I help you today?'),
    ).toEqual({
      replyText: 'Hey there! How can I help you today?',
      isKnownAnswer: true,
    });
  });
});

describe('LlmService', () => {
  let service: LlmService;

  beforeEach(async () => {
    createMock.mockReset();
    OpenAIMock.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (name: string) => {
              if (name === 'OPENAI_API_KEY') return 'test-key';
              throw new Error(name);
            },
            get: (name: string) => {
              if (name === 'OPENAI_MODEL') return 'gpt-4o-mini';
              return undefined;
            },
          },
        },
      ],
    }).compile();

    service = module.get(LlmService);
  });

  it('passes OPENAI_BASE_URL to the OpenAI client when set', async () => {
    OpenAIMock.mockClear();

    await Test.createTestingModule({
      providers: [
        LlmService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (name: string) => {
              if (name === 'OPENAI_API_KEY') return 'test-key';
              throw new Error(name);
            },
            get: (name: string) => {
              if (name === 'OPENAI_BASE_URL') {
                return 'https://proxy.example/v1';
              }
              if (name === 'OPENAI_MODEL') return 'gpt-4o-mini';
              return undefined;
            },
          },
        },
      ],
    }).compile();

    expect(OpenAIMock).toHaveBeenCalledWith({
      apiKey: 'test-key',
      baseURL: 'https://proxy.example/v1',
    });
  });

  it('returns known answer from JSON reply', async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: '{"reply":"We ship on Fridays.","knownAnswer":true}',
          },
        },
      ],
    });

    const result = await service.generateReply({
      systemPrompt: 'Shipping is on Fridays.',
      userMessage: 'When do you ship?',
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: { type: 'json_object' },
      }),
    );
    expect(result.isKnownAnswer).toBe(true);
    expect(result.replyText).toBe('We ship on Fridays.');
  });

  it('returns unknown answer when model sets knownAnswer false', async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content:
              '{"reply":"Please contact support@acme.com","knownAnswer":false}',
          },
        },
      ],
    });

    const result = await service.generateReply({
      systemPrompt: 'Shipping is on Fridays.',
      userMessage: 'What is your refund policy?',
    });

    expect(result.isKnownAnswer).toBe(false);
    expect(result.replyText).toBe('Please contact support@acme.com');
  });

  it('strips thinking blocks when JSON mode is ignored by proxy', async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content:
              '<think>\nReasoning...\n</think>\n\nWe ship on Fridays.',
          },
        },
      ],
    });

    const result = await service.generateReply({
      systemPrompt: 'Shipping is on Fridays.',
      userMessage: 'When do you ship?',
    });

    expect(result.isKnownAnswer).toBe(true);
    expect(result.replyText).toBe('We ship on Fridays.');
  });

  it('uses plain-text reply when model skips JSON format', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: 'Hey there! How can I help you?' } }],
    });

    const result = await service.generateReply({
      systemPrompt: 'You are a support bot.',
      userMessage: 'Hey',
    });

    expect(result.isKnownAnswer).toBe(true);
    expect(result.replyText).toBe('Hey there! How can I help you?');
  });

  it('returns empty reply and false knownAnswer for empty model output', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: '' } }],
    });

    const result = await service.generateReply({
      systemPrompt: 'You are a support bot.',
      userMessage: 'Hi',
    });

    expect(result.isKnownAnswer).toBe(false);
    expect(result.replyText).toBe('');
  });

  it('includes GREETING RULE in system content sent to OpenAI', async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: '{"reply":"Hey! How can I help?","knownAnswer":true}',
          },
        },
      ],
    });

    await service.generateReply({
      systemPrompt: 'You are a support bot.',
      userMessage: 'Hey',
    });

    const calledWith = createMock.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemMsg = calledWith.messages[0].content;
    expect(systemMsg).toContain('GREETING RULE');
    expect(systemMsg).toContain('knownAnswer');
  });

  it('includes conversation history in OpenAI messages', async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: '{"reply":"We ship on Fridays.","knownAnswer":true}',
          },
        },
      ],
    });

    await service.generateReply({
      systemPrompt: 'Shipping is on Fridays.',
      userMessage: 'When do you ship?',
      conversationHistory: [
        { role: 'user', content: 'Hi there' },
        { role: 'assistant', content: 'Hello!' },
      ],
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({ role: 'system' }),
          { role: 'user', content: 'Hi there' },
          { role: 'assistant', content: 'Hello!' },
          { role: 'user', content: 'When do you ship?' },
        ],
      }),
    );
  });
});
