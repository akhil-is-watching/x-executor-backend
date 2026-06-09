import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface GenerateReplyParams {
  systemPrompt: string;
  unknownReply: string;
  userMessage: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface GenerateReplyResult {
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

function parseReplyFromJson(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'reply' in parsed &&
      typeof (parsed as { reply: unknown }).reply === 'string'
    ) {
      const reply = (parsed as { reply: string }).reply.trim();
      return reply || null;
    }
  } catch {
    // ignore invalid JSON
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

export function extractReplyText(raw: string, unknownReply: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return unknownReply;
  }

  const directJson = parseReplyFromJson(trimmed);
  if (directJson) {
    return directJson;
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const embeddedJson = parseReplyFromJson(jsonMatch[0]);
    if (embeddedJson) {
      return embeddedJson;
    }
  }

  const stripped = stripThinkingBlocks(trimmed);
  if (containsThinkingBlock(trimmed)) {
    return stripped || unknownReply;
  }

  return unknownReply;
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
    const { systemPrompt, unknownReply, userMessage, conversationHistory } =
      params;

    const systemContent = [
      'You answer questions using ONLY the knowledge block below.',
      'Do not use outside knowledge, assumptions, or general world facts.',
      `If the knowledge is insufficient to answer, set the reply field to exactly: ${unknownReply}`,
      '',
      'RESPONSE FORMAT:',
      'Respond with a single JSON object only. No markdown fences, no explanation, no reasoning.',
      '{"reply":"<your final user-facing answer>"}',
      'The reply field must contain only the text sent to the user. Do not include reasoning, analysis, or thinking.',
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

    const raw =
      completion.choices[0]?.message?.content?.trim() ?? unknownReply;
    const extracted = extractReplyText(raw, unknownReply);
    const isKnownAnswer = !this.matchesUnknownReply(extracted, unknownReply);

    return {
      replyText: isKnownAnswer ? extracted : unknownReply,
      isKnownAnswer,
    };
  }

  matchesUnknownReply(replyText: string, unknownReply: string): boolean {
    const normalize = (value: string) =>
      value.trim().replace(/\s+/g, ' ').toLowerCase();
    return normalize(replyText) === normalize(unknownReply);
  }
}
