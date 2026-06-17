import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface GenerateReplyParams {
  systemPrompt: string;
  userMessage: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface GenerateReplyResult {
  replyText: string;
  isKnownAnswer: boolean;
}

export interface ParsedLlmResponse {
  replyText: string;
  isKnownAnswer: boolean;
}

const THINKING_BLOCK_PATTERNS = [
  /<think>[\s\S]*?<\/redacted_thinking>/gi,
  /[\s\S]*?<\/think>/gi,
  /<thinking>[\s\S]*?<\/thinking>/gi,
];

function containsThinkingBlock(text: string): boolean {
  return THINKING_BLOCK_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore invalid JSON
  }
  return null;
}

function parseKnownAnswer(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  return null;
}

function stripThinkingBlocks(text: string): string {
  let result = text;
  for (const pattern of THINKING_BLOCK_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result.trim().replace(/\s+/g, ' ');
}

function parseFromJsonObject(
  parsed: Record<string, unknown>,
): ParsedLlmResponse | null {
  if (typeof parsed.reply !== 'string') {
    return null;
  }

  const replyText = parsed.reply.trim();
  if (!replyText) {
    return null;
  }

  const knownAnswer = parseKnownAnswer(parsed.knownAnswer);
  return {
    replyText,
    isKnownAnswer: knownAnswer ?? true,
  };
}

export function parseLlmResponse(raw: string): ParsedLlmResponse | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const directJson = parseJsonObject(trimmed);
  if (directJson) {
    return parseFromJsonObject(directJson);
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const embeddedJson = parseJsonObject(jsonMatch[0]);
    if (embeddedJson) {
      return parseFromJsonObject(embeddedJson);
    }
  }

  if (containsThinkingBlock(trimmed)) {
    const stripped = stripThinkingBlocks(trimmed);
    if (!stripped) {
      return null;
    }
    return { replyText: stripped, isKnownAnswer: true };
  }

  // Model returned plain text (no JSON, no thinking blocks) — use it directly.
  return { replyText: trimmed, isKnownAnswer: true };
}

@Injectable()
export class LlmService {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    const baseURL = this.config.get<string>('OPENAI_BASE_URL');
    this.client = new OpenAI({
      apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
      ...(baseURL ? { baseURL } : {}),
    });
    this.model = this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';
  }

  async generateReply(params: GenerateReplyParams): Promise<GenerateReplyResult> {
    const { systemPrompt, userMessage, conversationHistory } = params;

    const systemContent = [
      'You answer questions using ONLY the knowledge block below.',
      'Do not use outside knowledge, assumptions, or general world facts.',
      '',
      'GREETING RULE:',
      'If the user sends a casual greeting (e.g. "hi", "hello", "hey", "what\'s up", "howdy", "good morning", etc.),',
      'respond in a friendly, welcoming way and invite them to ask a question. Set knownAnswer to true for greetings.',
      '',
      'RESPONSE FORMAT:',
      'Respond with a single JSON object only. No markdown fences, no explanation, no reasoning.',
      '{"reply":"<user-facing text>","knownAnswer":true|false}',
      'The reply field must contain only the text sent to the user. Do not include reasoning, analysis, or thinking.',
      '',
      'knownAnswer rules:',
      '- true: the KNOWLEDGE block contains enough information to answer the question',
      '- false: the KNOWLEDGE block does not cover the question',
      '',
      'When knownAnswer is false, write reply text according to any instructions in the KNOWLEDGE block',
      'for out-of-scope questions. If the KNOWLEDGE block gives no guidance, politely say you do not have that information.',
      '',
      'KNOWLEDGE:',
      systemPrompt,
    ].join('\n');

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemContent },
        ...(conversationHistory ?? []).map((message) => ({
          role: message.role,
          content: message.content,
        })),
        { role: 'user', content: userMessage },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? '';
    const parsed = parseLlmResponse(raw);

    if (!parsed) {
      return { replyText: '', isKnownAnswer: false };
    }

    return {
      replyText: parsed.replyText,
      isKnownAnswer: parsed.isKnownAnswer,
    };
  }
}
