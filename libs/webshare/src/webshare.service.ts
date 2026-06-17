import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface WebshareProxy {
  id: string;
  username: string;
  password: string;
  proxy_address: string;
  port: number;
  valid: boolean;
  country_code: string;
}

@Injectable()
export class WebshareService {
  private readonly logger = new Logger(WebshareService.name);
  private readonly baseUrl = 'https://proxy.webshare.io/api/v2';

  constructor(private readonly config: ConfigService) {}

  private get apiKey(): string {
    return this.config.getOrThrow<string>('WEBSHARE_API_KEY');
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Token ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async listProxies(): Promise<WebshareProxy[]> {
    const proxies: WebshareProxy[] = [];
    let page = 1;

    while (true) {
      const response = await fetch(
        `${this.baseUrl}/proxy/list/?mode=direct&page=${page}&page_size=100`,
        { headers: this.headers() },
      );

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Webshare listProxies failed (${response.status}): ${body}`);
      }

      const data = (await response.json()) as {
        results: WebshareProxy[];
        next: string | null;
      };

      proxies.push(...data.results);

      if (!data.next) {
        break;
      }
      page += 1;
    }

    return proxies.filter((p) => p.valid);
  }

  /**
   * Calls Webshare proxy replacement API to refresh the proxy at the given IP address,
   * returning a new IP to the pool.
   */
  async replaceProxy(proxyAddress: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/proxy/list/replace/`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        to_replace: {
          type: 'ip_address',
          ip_addresses: [proxyAddress],
          count: 1,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Webshare replaceProxy failed (${response.status}): ${body}`);
    }

    this.logger.log(`Webshare proxy replacement requested for ${proxyAddress}`);
  }

  buildProxyUrl(proxy: WebshareProxy): string {
    return `http://${proxy.username}:${proxy.password}@${proxy.proxy_address}:${proxy.port}`;
  }
}
