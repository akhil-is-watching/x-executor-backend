import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import OpenAI from 'openai';
import { LlmService } from './llm.service';

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

  it('returns known answer when model responds normally', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: 'We ship on Fridays.' } }],
    });

    const result = await service.generateReply({
      systemPrompt: 'Shipping is on Fridays.',
      unknownReply: "I don't know",
      userMessage: 'When do you ship?',
    });

    expect(result.isKnownAnswer).toBe(true);
    expect(result.replyText).toBe('We ship on Fridays.');
  });

  it('uses unknown reply when model returns fallback text', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: "I don't know" } }],
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
