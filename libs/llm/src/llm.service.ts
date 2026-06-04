import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface GenerateReplyParams {
  systemPrompt: string;
  unknownReply: string;
  userMessage: string;
}

export interface GenerateReplyResult {
  replyText: string;
  isKnownAnswer: boolean;
}

@Injectable()
export class LlmService {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
    });
    this.model = this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';
  }

  async generateReply(params: GenerateReplyParams): Promise<GenerateReplyResult> {
    const { systemPrompt, unknownReply, userMessage } = params;

    const systemContent = [
      'You answer questions using ONLY the knowledge block below.',
      'Do not use outside knowledge, assumptions, or general world facts.',
      `If the knowledge is insufficient to answer, respond with exactly this text and nothing else: ${unknownReply}`,
      '',
      'KNOWLEDGE:',
      systemPrompt,
    ].join('\n');

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userMessage },
      ],
    });

    const raw =
      completion.choices[0]?.message?.content?.trim() ?? unknownReply;
    const isKnownAnswer = !this.matchesUnknownReply(raw, unknownReply);

    return {
      replyText: isKnownAnswer ? raw : unknownReply,
      isKnownAnswer,
    };
  }

  matchesUnknownReply(replyText: string, unknownReply: string): boolean {
    const normalize = (value: string) =>
      value.trim().replace(/\s+/g, ' ').toLowerCase();
    return normalize(replyText) === normalize(unknownReply);
  }
}
