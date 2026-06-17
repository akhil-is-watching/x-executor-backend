import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface GenerateReplyParams {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface GenerateReplyResult {
  replyText: string;
  isKnownAnswer: boolean;
}

export interface HandoffClassificationResult {
  shouldHandoff: boolean;
  notifyHandle: string | null;
  category: string | null;
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

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const DEFAULT_LLM_MODEL = 'google/gemini-3.5-flash';
export const DEFAULT_HANDOFF_MESSAGE =
  'A member of our team has been notified and will reply to you shortly.';

export interface OpenRouterModelOption {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
}

interface OpenRouterModelsResponse {
  data?: Array<{
    id: string;
    name: string;
    description?: string;
    context_length?: number;
    architecture?: {
      output_modalities?: string[];
    };
  }>;
}

export function parseHandoffClassification(
  raw: string,
): HandoffClassificationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { shouldHandoff: false, notifyHandle: null, category: null };
  }

  const directJson = parseJsonObject(trimmed);
  const parsed =
    directJson ??
    (() => {
      const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
      return jsonMatch ? parseJsonObject(jsonMatch[0]) : null;
    })();

  if (!parsed || typeof parsed.handoff !== 'boolean') {
    return { shouldHandoff: false, notifyHandle: null, category: null };
  }

  const notifyHandle =
    typeof parsed.notifyHandle === 'string' && parsed.notifyHandle.trim()
      ? parsed.notifyHandle.trim()
      : null;
  const category =
    typeof parsed.category === 'string' && parsed.category.trim()
      ? parsed.category.trim()
      : null;

  return {
    shouldHandoff: parsed.handoff,
    notifyHandle: parsed.handoff ? notifyHandle : null,
    category: parsed.handoff ? category : null,
  };
}

export function resolveLlmModel(model: string, baseURL: string): string {
  if (!baseURL.startsWith('https://openrouter.ai')) {
    return model;
  }
  if (model.includes('/')) {
    return model;
  }
  return `openai/${model}`;
}

@Injectable()
export class LlmService {
  private readonly client: OpenAI;
  private readonly defaultModel: string;
  private readonly baseURL: string;
  private modelsCache: { fetchedAt: number; models: OpenRouterModelOption[] } | null =
    null;

  constructor(private readonly config: ConfigService) {
    this.baseURL =
      this.config.get<string>('OPENAI_BASE_URL') ?? OPENROUTER_BASE_URL;
    const configuredModel =
      this.config.get<string>('OPENAI_MODEL') ?? DEFAULT_LLM_MODEL;
    this.client = new OpenAI({
      apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
      baseURL: this.baseURL,
      ...(this.baseURL.startsWith('https://openrouter.ai')
        ? {
            defaultHeaders: {
              'X-OpenRouter-Title': 'x-executor',
            },
          }
        : {}),
    });
    this.defaultModel = resolveLlmModel(configuredModel, this.baseURL);
  }

  resolveModel(model?: string): string {
    const requested = model?.trim();
    if (!requested) {
      return this.defaultModel;
    }
    return resolveLlmModel(requested, this.baseURL);
  }

  async listModels(forceRefresh = false): Promise<OpenRouterModelOption[]> {
    const cacheTtlMs = 15 * 60 * 1000;
    const now = Date.now();

    if (
      !forceRefresh &&
      this.modelsCache &&
      now - this.modelsCache.fetchedAt < cacheTtlMs
    ) {
      return this.modelsCache.models;
    }

    const url = new URL(`${this.baseURL}/models`);
    url.searchParams.set('output_modalities', 'text');

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.config.getOrThrow<string>('OPENAI_API_KEY')}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch OpenRouter models: ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as OpenRouterModelsResponse;
    const models = (payload.data ?? [])
      .filter((model) => model.id.includes('/'))
      .map((model) => ({
        id: model.id,
        name: model.name?.trim() || model.id,
        description: model.description?.trim() || undefined,
        contextLength: model.context_length,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));

    this.modelsCache = { fetchedAt: now, models };
    return models;
  }

  async generateReply(params: GenerateReplyParams): Promise<GenerateReplyResult> {
    const { systemPrompt, userMessage, conversationHistory, model } = params;
    const resolvedModel = this.resolveModel(model);

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
      model: resolvedModel,
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

  async classifyHandoff(params: {
    handoffConfig: string;
    userMessage: string;
    model?: string;
  }): Promise<HandoffClassificationResult> {
    const resolvedModel = this.resolveModel(params.model);
    const systemContent = [
      'You decide whether an inbound user message should be handed off to a human agent.',
      'Use ONLY the HANDOFF RULES below. Do not invent notify targets.',
      '',
      'Always hand off when the user explicitly asks for a human, agent, support person, or real person.',
      'Also hand off when the message matches a case described in HANDOFF RULES.',
      '',
      'RESPONSE FORMAT:',
      'Respond with a single JSON object only. No markdown fences, no explanation.',
      '{"handoff":true|false,"notifyHandle":"@handle"|null,"category":"Category name"|null}',
      '',
      'Rules for notifyHandle:',
      '- When handoff is true, set notifyHandle to the @handle from HANDOFF RULES that best matches the message.',
      '- Include the @ prefix when present in the rules.',
      '- When handoff is false, set notifyHandle and category to null.',
      '',
      'HANDOFF RULES:',
      params.handoffConfig.trim(),
    ].join('\n');

    const completion = await this.client.chat.completions.create({
      model: resolvedModel,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: params.userMessage.trim() },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? '';
    return parseHandoffClassification(raw);
  }
}
