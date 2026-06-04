import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import OpenAI from 'openai';
import { extractReplyText, LlmService } from './llm.service';

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

describe('extractReplyText', () => {
  const unknownReply = "I don't know";

  it('parses reply from JSON', () => {
    expect(
      extractReplyText('{"reply":"We ship on Fridays."}', unknownReply),
    ).toBe('We ship on Fridays.');
  });

  it('extracts reply from JSON embedded in noise', () => {
    expect(
      extractReplyText(
        'Here is the response: {"reply":"We ship on Fridays."}',
        unknownReply,
      ),
    ).toBe('We ship on Fridays.');
  });

  it('strips redacted_thinking blocks', () => {
    expect(
      extractReplyText(
        '<think>\nSome reasoning here.\n</think>\n\nActual reply',
        unknownReply,
      ),
    ).toBe('Actual reply');
  });

  it('returns unknownReply for empty output', () => {
    expect(extractReplyText('', unknownReply)).toBe(unknownReply);
    expect(extractReplyText('   ', unknownReply)).toBe(unknownReply);
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
        { message: { content: '{"reply":"We ship on Fridays."}' } },
      ],
    });

    const result = await service.generateReply({
      systemPrompt: 'Shipping is on Fridays.',
      unknownReply: "I don't know",
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

  it('uses unknown reply when model returns fallback in JSON', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: '{"reply":"I don\'t know"}' } }],
    });

    const result = await service.generateReply({
      systemPrompt: 'Shipping is on Fridays.',
      unknownReply: "I don't know",
      userMessage: 'What is your refund policy?',
    });

    expect(result.isKnownAnswer).toBe(false);
    expect(result.replyText).toBe("I don't know");
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
      unknownReply: "I don't know",
      userMessage: 'When do you ship?',
    });

    expect(result.isKnownAnswer).toBe(true);
    expect(result.replyText).toBe('We ship on Fridays.');
  });

  it('falls back to unknown reply for malformed output', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: 'not valid json or reply' } }],
    });

    const result = await service.generateReply({
      systemPrompt: 'Shipping is on Fridays.',
      unknownReply: "I don't know",
      userMessage: 'What is your refund policy?',
    });

    expect(result.isKnownAnswer).toBe(false);
    expect(result.replyText).toBe("I don't know");
  });
});
