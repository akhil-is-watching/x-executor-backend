/**
 * XChat session + Juicebox bootstrap.
 *
 * Preferred (official X bot flow):
 *   GET https://api.x.com/2/users/:id/public_keys
 *   See https://github.com/xdevplatform/xchat-bot-python/blob/main/xchat_bot_python/unlock.py
 *
 * Fallback: internal GetPublicKeys GraphQL (requires query id from DevTools).
 */

const lib = require('@higuchan123/twitter_lib');
const { TwitterApi } = require('twitter-api-v2');

const DEFAULT_USER_AGENT = lib.XCHAT_USER_AGENT;
const PUBLIC_KEY_FIELDS = [
  'version',
  'public_key',
  'signing_public_key',
  'juicebox_config',
];

function mergeSetCookies(headers, jar) {
  for (const cookie of headers.getSetCookie?.() ?? []) {
    const [pair] = cookie.split(';');
    const index = pair.indexOf('=');
    if (index > 0) {
      jar[pair.slice(0, index)] = pair.slice(index + 1);
    }
  }
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

/** Map official API juicebox_config → twitter_lib recover_xchat_secret token_map. */
function mapJuiceboxConfigToTokenMap(juiceboxConfig) {
  if (!juiceboxConfig || typeof juiceboxConfig !== 'object') {
    throw new Error('public_keys response missing juicebox_config object');
  }

  const tokenMapList = juiceboxConfig.token_map ?? [];
  const keyStoreJson =
    juiceboxConfig.key_store_token_map_json ??
    juiceboxConfig.keyStoreTokenMapJson;

  if (!keyStoreJson || !Array.isArray(tokenMapList) || tokenMapList.length === 0) {
    throw new Error('juicebox_config missing key_store_token_map_json or token_map');
  }

  return {
    key_store_token_map_json:
      typeof keyStoreJson === 'string' ? keyStoreJson : JSON.stringify(keyStoreJson),
    token_map: tokenMapList.map((entry) => ({
      key: entry.key,
      value: { token: entry.value?.token ?? entry.token },
    })),
  };
}

/**
 * Official unlock path (OAuth 1.0a or OAuth 2.0 user context).
 * Matches xchat-bot-python unlock.py.
 */
async function fetchJuiceboxFromPublicKeysApi({
  userId,
  oauth2AccessToken,
  oauth1,
  baseUrl = process.env.XCHAT_API_BASE_URL ?? 'https://api.x.com',
}) {
  let body;

  if (oauth2AccessToken) {
    const params = new URLSearchParams({
      'public_key.fields': PUBLIC_KEY_FIELDS.join(','),
    });
    const response = await fetch(
      `${baseUrl}/2/users/${userId}/public_keys?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${oauth2AccessToken}` },
      },
    );
    body = await response.json().catch(async () => ({ raw: await response.text() }));
    if (!response.ok) {
      throw new Error(
        `GET /2/users/${userId}/public_keys failed (${response.status}): ` +
          `${JSON.stringify(body).slice(0, 500)}`,
      );
    }
  } else if (oauth1?.accessToken && oauth1?.accessTokenSecret) {
    const appKey = oauth1.appKey ?? process.env.X_API_KEY;
    const appSecret = oauth1.appSecret ?? process.env.X_API_KEY_SECRET;
    if (!appKey || !appSecret) {
      throw new Error('OAuth 1.0a requires X_API_KEY and X_API_KEY_SECRET');
    }

    const client = new TwitterApi({
      appKey,
      appSecret,
      accessToken: oauth1.accessToken,
      accessSecret: oauth1.accessTokenSecret,
    });

    const response = await client.v2.get(`users/${userId}/public_keys`, {
      'public_key.fields': PUBLIC_KEY_FIELDS.join(','),
    });
    body = response;
  } else {
    throw new Error(
      'Missing OAuth credentials for /2/users/:id/public_keys. Set X_OAUTH2_ACCESS_TOKEN ' +
        'or OAUTH1_ACCESS_TOKEN + OAUTH1_ACCESS_TOKEN_SECRET (+ X_API_KEY/SECRET).',
    );
  }

  let data = body?.data ?? body;
  if (Array.isArray(data)) {
    data = data[0] ?? {};
  }

  const signingKeyVersion = data.version ?? data.public_key_version ?? '';
  const tokenMap = mapJuiceboxConfigToTokenMap(data.juicebox_config);

  return { userId: String(userId), signingKeyVersion, tokenMap };
}

async function bootstrapCookies(authToken, userAgent = DEFAULT_USER_AGENT) {
  const jar = { auth_token: authToken };
  const response = await fetch('https://x.com/i/chat', {
    headers: {
      'user-agent': userAgent,
      cookie: `auth_token=${authToken}`,
    },
    redirect: 'follow',
  });
  mergeSetCookies(response.headers, jar);
  if (!jar.ct0) {
    throw new Error('Failed to obtain ct0 cookie — auth_token may be invalid or expired');
  }
  return jar;
}

async function fetchBearerToken(userAgent = DEFAULT_USER_AGENT) {
  const homeHtml = await fetch('https://x.com', {
    headers: { 'user-agent': userAgent },
  }).then((response) => response.text());
  const mainJsUrl = lib.get_main_js_url_from_html(homeHtml);
  const mainJs = await fetch(mainJsUrl, {
    headers: { 'user-agent': userAgent },
  }).then((response) => response.text());
  return lib.get_bearer_token_from_js(mainJs);
}

function readSelfUserId(cookies) {
  return lib.get_xchat_self_user_id(cookies);
}

/** Legacy internal GraphQL fallback (GetPublicKeys). */
async function fetchJuiceboxTokenMapGraphql({
  authToken,
  userId,
  queryId,
  userAgent = DEFAULT_USER_AGENT,
}) {
  if (!queryId) {
    throw new Error(
      'Missing GetPublicKeys GraphQL query id. Set X_TWITTER_GET_PUBLIC_KEYS_QUERY_ID.',
    );
  }

  const cookies = await bootstrapCookies(authToken, userAgent);
  const bearer = await fetchBearerToken(userAgent);
  const resolvedUserId = userId ?? readSelfUserId(cookies);
  const variables = encodeURIComponent(
    JSON.stringify({
      ids: [resolvedUserId],
      include_juicebox_tokens: true,
    }),
  ).replace(/%2F/g, '/');
  const url = `https://x.com/i/api/graphql/${queryId}/GetPublicKeys?variables=${variables}`;

  const response = await fetch(url, {
    headers: {
      'user-agent': userAgent,
      authorization: bearer.startsWith('Bearer ') ? bearer : `Bearer ${bearer}`,
      cookie: cookieHeader(cookies),
      'x-csrf-token': cookies.ct0,
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-active-user': 'yes',
      accept: '*/*',
      origin: 'https://x.com',
      referer: 'https://x.com/i/chat',
    },
  });

  const body = await response.json().catch(async () => ({
    raw: await response.text(),
  }));

  if (!response.ok) {
    throw new Error(
      `GetPublicKeys GraphQL failed (${response.status}): ${JSON.stringify(body).slice(0, 500)}`,
    );
  }

  const tokenMap =
    body?.data?.user_results_by_rest_ids?.[0]?.result?.get_public_keys
      ?.public_keys_with_token_map?.[0]?.token_map;

  if (!tokenMap) {
    throw new Error('GetPublicKeys GraphQL response did not include token_map');
  }

  return { cookies, bearer, selfUserId: resolvedUserId, tokenMap };
}

/**
 * Resolve Juicebox token_map using official API first, then GraphQL fallback.
 */
async function resolveJuiceboxTokenMap({ userId, authToken }) {
  const oauth2 = process.env.X_OAUTH2_ACCESS_TOKEN?.trim();
  const oauth1Access = process.env.OAUTH1_ACCESS_TOKEN?.trim();
  const oauth1Secret = process.env.OAUTH1_ACCESS_TOKEN_SECRET?.trim();

  if (oauth2 || (oauth1Access && oauth1Secret)) {
    return fetchJuiceboxFromPublicKeysApi({
      userId,
      oauth2AccessToken: oauth2,
      oauth1: oauth1Access
        ? { accessToken: oauth1Access, accessTokenSecret: oauth1Secret }
        : undefined,
    });
  }

  if (authToken) {
    const bundle = await fetchJuiceboxTokenMapGraphql({
      authToken,
      userId,
      queryId: process.env.X_TWITTER_GET_PUBLIC_KEYS_QUERY_ID?.trim(),
    });
    return {
      userId: bundle.selfUserId,
      signingKeyVersion: '',
      tokenMap: bundle.tokenMap,
    };
  }

  throw new Error(
    'Need OAuth user credentials for official public_keys API, or AUTH_TOKEN for GraphQL fallback',
  );
}

module.exports = {
  bootstrapCookies,
  fetchBearerToken,
  fetchJuiceboxFromPublicKeysApi,
  fetchJuiceboxTokenMapGraphql,
  resolveJuiceboxTokenMap,
  mapJuiceboxConfigToTokenMap,
  readSelfUserId,
  cookieHeader,
};
