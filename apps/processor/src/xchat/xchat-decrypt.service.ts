import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { RedisService } from '@app/redis';

interface TwitterLib {
  build_xchat_conversation_key_map(
    events: string[],
    secretHex: string,
    userId: string,
  ): Record<string, string>;
  decrypt_xchat_message_event(
    encodedEvent: string,
    keyMap: Record<string, string>,
  ): { parsed_entry?: { kind?: string; text?: string } };
}

function loadTwitterLib(): TwitterLib {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@higuchan123/twitter_lib') as TwitterLib;
}

const L2_CONVKEY_TTL_SEC = 30 * 24 * 60 * 60; // 30 days
const L3_SECRET_TTL_SEC = 24 * 60 * 60; // 24 hours
const XCHAT_SECRET_PREFIX = 'xchat:secret:';
const XCHAT_CONVKEY_PREFIX = 'xchat:convkey:';

export interface DecryptXChatEventParams {
  xUserId: string;
  xchatPin: string;
  accessToken: string;
  accessTokenSecret: string;
  encodedEvent: string;
  conversationKeyChangeEvent: string;
  conversationKeyVersion: string;
}

@Injectable()
export class XChatDecryptService {
  private readonly logger = new Logger(XChatDecryptService.name);

  /** L1: process-memory conversation key cache: "uid:ver" → hex key string */
  private readonly convKeyL1 = new Map<string, string>();

  /** Inflight unlock guard — deduplicates concurrent Juicebox calls per xUserId */
  private readonly inflightUnlock = new Map<string, Promise<string>>();

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async decryptXChatEvent(params: DecryptXChatEventParams): Promise<string | null> {
    const {
      xUserId,
      xchatPin,
      accessToken,
      accessTokenSecret,
      encodedEvent,
      conversationKeyChangeEvent,
      conversationKeyVersion,
    } = params;

    const convKeyHex = await this.getConversationKey(
      xUserId,
      xchatPin,
      conversationKeyVersion,
      conversationKeyChangeEvent,
      accessToken,
      accessTokenSecret,
    );

    if (!convKeyHex) {
      this.logger.warn(
        `Could not resolve conversation key for xUserId=${xUserId} keyVersion=${conversationKeyVersion}`,
      );
      return null;
    }

    // Build a synthetic key map for twitter_lib decrypt call
    const conversationKeyMap: Record<string, string> = {
      [conversationKeyVersion]: convKeyHex,
    };

    try {
      const decrypted = loadTwitterLib().decrypt_xchat_message_event(
        encodedEvent,
        conversationKeyMap,
      );

      const text = decrypted?.parsed_entry?.text?.trim() ?? null;
      return text || null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `XChat decrypt failed xUserId=${xUserId} keyVersion=${conversationKeyVersion}: ${message}`,
      );
      return null;
    }
  }

  /**
   * Resolves the conversation key hex for the given (xUserId, keyVersion).
   * Cache lookup order: L1 memory → L2 Redis → L3 Redis secret → Juicebox unlock.
   */
  private async getConversationKey(
    xUserId: string,
    xchatPin: string,
    keyVersion: string,
    conversationKeyChangeEvent: string,
    accessToken: string,
    accessTokenSecret: string,
  ): Promise<string | null> {
    const l1Key = `${xUserId}:${keyVersion}`;

    // L1 — process memory
    const l1Hit = this.convKeyL1.get(l1Key);
    if (l1Hit) {
      this.logger.debug(`XChat convkey L1 hit xUserId=${xUserId} ver=${keyVersion}`);
      return l1Hit;
    }

    // L2 — Redis conversation key
    const l2RedisKey = `${XCHAT_CONVKEY_PREFIX}${xUserId}:${keyVersion}`;
    const l2Hit = await this.readCachedString(l2RedisKey);
    if (l2Hit) {
      this.logger.debug(`XChat convkey L2 hit xUserId=${xUserId} ver=${keyVersion}`);
      this.convKeyL1.set(l1Key, l2Hit);
      return l2Hit;
    }

    // L3 / full unlock — need the account secret to unwrap the conversation key
    const recoveredSecretHex = await this.getRecoveredSecret(
      xUserId,
      xchatPin,
      accessToken,
      accessTokenSecret,
    );

    // Unwrap conversation key using the account secret
    let conversationKeyMap: Record<string, string>;
    try {
      conversationKeyMap = loadTwitterLib().build_xchat_conversation_key_map(
        [conversationKeyChangeEvent],
        recoveredSecretHex,
        xUserId,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`build_xchat_conversation_key_map failed xUserId=${xUserId}: ${message}`);
      return null;
    }

    const convKeyHex = conversationKeyMap[keyVersion];
    if (!convKeyHex) {
      this.logger.warn(
        `Conversation key version ${keyVersion} not found after unwrap for xUserId=${xUserId}`,
      );
      return null;
    }

    // Populate L1 + L2
    this.convKeyL1.set(l1Key, convKeyHex);
    await this.redis
      .setJson(l2RedisKey, convKeyHex, L2_CONVKEY_TTL_SEC)
      .catch((err: unknown) => {
        this.logger.warn(`Failed to cache convkey in Redis: ${String(err)}`);
      });

    this.logger.log(
      `XChat convkey unwrapped and cached xUserId=${xUserId} ver=${keyVersion}`,
    );
    return convKeyHex;
  }

  /**
   * Returns the 64-byte account secret hex.
   * Cache lookup: L3 Redis → Juicebox unlock (with inflight deduplication).
   */
  private async getRecoveredSecret(
    xUserId: string,
    xchatPin: string,
    accessToken: string,
    accessTokenSecret: string,
  ): Promise<string> {
    const l3Key = `${XCHAT_SECRET_PREFIX}${xUserId}`;

    // L3 — Redis
    const l3Hit = await this.readCachedString(l3Key);
    if (l3Hit) {
      this.logger.debug(`XChat secret L3 hit xUserId=${xUserId}`);
      return l3Hit;
    }

    // Deduplicate concurrent unlock attempts for the same user
    const existing = this.inflightUnlock.get(xUserId);
    if (existing) {
      this.logger.debug(`XChat unlock already inflight for xUserId=${xUserId} — awaiting`);
      return existing;
    }

    const unlockPromise = this.doUnlock(xUserId, xchatPin, accessToken, accessTokenSecret, l3Key);
    this.inflightUnlock.set(xUserId, unlockPromise);

    try {
      return await unlockPromise;
    } finally {
      this.inflightUnlock.delete(xUserId);
    }
  }

  private async doUnlock(
    xUserId: string,
    xchatPin: string,
    accessToken: string,
    accessTokenSecret: string,
    l3Key: string,
  ): Promise<string> {
    this.logger.log(`XChat full Juicebox unlock starting xUserId=${xUserId}`);

    const appKey = this.config.getOrThrow<string>('X_API_KEY');
    const appSecret = this.config.getOrThrow<string>('X_API_KEY_SECRET');

    // Fetch Juicebox config from official public_keys API (OAuth 1.0a)
    const { TwitterApi } = await import('twitter-api-v2');
    const client = new TwitterApi({ appKey, appSecret, accessToken, accessSecret: accessTokenSecret });

    let juiceboxConfig: Record<string, unknown>;
    try {
      const response = await client.v2.get(`users/${xUserId}/public_keys`, {
        'public_key.fields': 'version,public_key,signing_public_key,juicebox_config',
      });
      const data = Array.isArray(response.data) ? response.data[0] : response.data;
      juiceboxConfig = data?.juicebox_config as Record<string, unknown>;
      if (!juiceboxConfig) {
        throw new Error('public_keys response missing juicebox_config');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch public_keys for xUserId=${xUserId}: ${message}`);
    }

    // Map juicebox_config to twitter_lib token_map format
    const tokenMapList = (juiceboxConfig.token_map as Array<{ key: string; value: { token: string } }>) ?? [];
    const keyStoreJson = juiceboxConfig.key_store_token_map_json as string | undefined;
    if (!keyStoreJson || tokenMapList.length === 0) {
      throw new Error(`juicebox_config missing key_store_token_map_json or token_map for xUserId=${xUserId}`);
    }

    const tokenMap = {
      key_store_token_map_json:
        typeof keyStoreJson === 'string' ? keyStoreJson : JSON.stringify(keyStoreJson),
      token_map: tokenMapList.map((entry) => ({
        key: entry.key,
        value: { token: entry.value?.token },
      })),
    };

    // Spawn ESM subprocess for Juicebox unlock (WASM can't be required from CJS in Node 24)
    const recoveredSecretHex = await this.spawnJuiceboxUnlock(tokenMap, xchatPin);

    // Populate L3
    await this.redis
      .setJson(l3Key, recoveredSecretHex, L3_SECRET_TTL_SEC)
      .catch((err: unknown) => {
        this.logger.warn(`Failed to cache account secret in Redis: ${String(err)}`);
      });

    this.logger.log(`XChat Juicebox unlock succeeded xUserId=${xUserId}`);
    return recoveredSecretHex;
  }

  private spawnJuiceboxUnlock(tokenMap: object, xchatPin: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(process.cwd(), 'scripts', 'xchat-recover-secret.mjs');

      const child = spawn(process.execPath, [scriptPath], {
        env: { ...process.env, XCHAT_PASSCODE: xchatPin },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code: number | null) => {
        if (code === 0) {
          const hex = stdout.trim();
          if (!hex) {
            reject(new Error('Juicebox subprocess returned empty secret'));
            return;
          }
          resolve(hex);
          return;
        }
        const errMsg = stderr.trim() || `Juicebox unlock process exited with code ${String(code)}`;
        reject(new Error(errMsg));
      });

      child.stdin.end(JSON.stringify(tokenMap));
    });
  }

  /** Call when a PIN is wrong — evicts L3 so the next event re-unlocks. */
  async invalidateSecret(xUserId: string): Promise<void> {
    await this.redis.del(`${XCHAT_SECRET_PREFIX}${xUserId}`);
    // L1 conv keys remain valid — they were derived from the correct secret
  }

  /**
   * Reads a cached string from Redis. Supports JSON-encoded values (setJson)
   * and legacy raw hex strings written via setex.
   */
  private async readCachedString(key: string): Promise<string | null> {
    const raw = await this.redis.get(key);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === 'string' && parsed.length > 0) {
        return parsed;
      }
      return null;
    } catch {
      if (/^[0-9a-fA-F]+$/.test(raw)) {
        return raw;
      }
      await this.redis.del(key).catch(() => undefined);
      return null;
    }
  }
}
