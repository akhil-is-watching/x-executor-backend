import { Injectable } from '@nestjs/common';
import { RedisService } from '@app/redis';

export interface OAuthStatePayload {
  inviteToken: string;
  codeVerifier: string;
  orgId: string;
}

const TTL_SECONDS = 600;

@Injectable()
export class OAuthStateStore {
  constructor(private readonly redis: RedisService) {}

  private key(stateId: string): string {
    return `oauth:state:${stateId}`;
  }

  async save(stateId: string, payload: OAuthStatePayload): Promise<void> {
    await this.redis.setJson(this.key(stateId), payload, TTL_SECONDS);
  }

  async consume(stateId: string): Promise<OAuthStatePayload | null> {
    const key = this.key(stateId);
    const payload = await this.redis.getJson<OAuthStatePayload>(key);
    if (payload) {
      await this.redis.del(key);
    }
    return payload;
  }
}
