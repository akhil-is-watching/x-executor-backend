#!/usr/bin/env node
/**
 * PoC: decrypt an XChat webhook message (ghostpod → bot thread).
 *
 * Follows the official X Chat bot unlock flow:
 * https://github.com/xdevplatform/xchat-bot-python
 *   1. GET /2/users/:id/public_keys (juicebox_config)
 *   2. Unlock with PIN → account private key
 *   3. Unwrap conversation key from conversation_key_change_event
 *   4. decrypt encoded_event
 *
 * Usage (preferred — OAuth 1.0a user tokens from Hub connection):
 *   X_API_KEY=... X_API_KEY_SECRET=... \
 *   OAUTH1_ACCESS_TOKEN=... OAUTH1_ACCESS_TOKEN_SECRET=... \
 *   XCHAT_PASSCODE=1234 node scripts/xchat-decrypt-poc.js
 *
 * Or OAuth2 (xchat-bot-login state.json access_token):
 *   X_OAUTH2_ACCESS_TOKEN=... XCHAT_PASSCODE=1234 node scripts/xchat-decrypt-poc.js
 *
 * Or pre-recovered secret:
 *   XCHAT_RECOVERED_SECRET_HEX=... node scripts/xchat-decrypt-poc.js
 *
 * From Hub MongoDB connection (decrypts accessTokenEnc with TOKEN_ENCRYPTION_KEY):
 *   TOKEN_ENCRYPTION_KEY=... X_API_KEY=... X_API_KEY_SECRET=... \
 *   XCHAT_PASSCODE=1234 CONNECTION_FILE=scripts/fixtures/bot-connection.json \
 *   SKIP_CONVERSATION_FETCH=1 node scripts/xchat-decrypt-poc.js
 *
 * Fallback (internal GraphQL — needs DevTools query id):
 *   AUTH_TOKEN=... X_TWITTER_GET_PUBLIC_KEYS_QUERY_ID=... XCHAT_PASSCODE=1234 ...
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const lib = require('@higuchan123/twitter_lib');
const { resolveJuiceboxTokenMap } = require('./xchat-fetch-session');
const { loadOAuth1FromConnection } = require('./token-crypto');

const fixturePath =
  process.env.FIXTURE ??
  path.join(__dirname, 'fixtures', 'ghostpod-xchat-webhook.json');

function log(step, message) {
  console.log(`[${step}] ${message}`);
}

function loadFixture() {
  const raw = fs.readFileSync(fixturePath, 'utf8');
  return JSON.parse(raw);
}

function bootstrapFromConnectionFile() {
  const connectionPath =
    process.env.CONNECTION_FILE?.trim() ||
    (process.env.TOKEN_ENCRYPTION_KEY?.trim()
      ? path.join(__dirname, 'fixtures', 'bot-connection.json')
      : null);
  if (!connectionPath || !fs.existsSync(connectionPath)) {
    return;
  }
  const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!encryptionKey) {
    throw new Error(
      `CONNECTION_FILE=${connectionPath} set but TOKEN_ENCRYPTION_KEY is missing`,
    );
  }

  const connection = JSON.parse(fs.readFileSync(connectionPath, 'utf8'));
  const oauth1 = loadOAuth1FromConnection(connection, encryptionKey);

  if (!process.env.OAUTH1_ACCESS_TOKEN) {
    process.env.OAUTH1_ACCESS_TOKEN = oauth1.accessToken;
  }
  if (!process.env.OAUTH1_ACCESS_TOKEN_SECRET) {
    process.env.OAUTH1_ACCESS_TOKEN_SECRET = oauth1.accessTokenSecret;
  }
  if (!process.env.AUTH_TOKEN && oauth1.authToken) {
    process.env.AUTH_TOKEN = oauth1.authToken;
  }

  log(
    'connection',
    `Loaded OAuth1 for @${connection.xUsername ?? connection.xUserId} from ${path.basename(connectionPath)}`,
  );
}

function summarizeParsedEvent(parsed) {
  return {
    event_id: parsed.event_id,
    sender_id: parsed.sender_id,
    conversation_id: parsed.conversation_id,
    content_mode: parsed.content_mode,
    conversation_key_version: parsed.conversation_key_version,
    encrypted_bytes: parsed.encrypted_contents?.length ?? 0,
  };
}

function summarizeDecrypted(result) {
  const entry = result?.parsed_entry;
  if (!entry) {
    return { text: null, kind: null };
  }
  if (entry.kind === 'text') {
    return { kind: 'text', text: entry.text };
  }
  return { kind: entry.kind, details: entry };
}

function recoverXchatSecretViaEsm(passcode, tokenMap) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'xchat-recover-secret.mjs');
    const child = spawn(process.execPath, [scriptPath], {
      env: { ...process.env, XCHAT_PASSCODE: passcode },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(stderr.trim() || `Juicebox unlock exited with code ${code}`));
    });

    child.stdin.end(JSON.stringify(tokenMap));
  });
}

async function resolveRecoveredSecretHex({ forUserId }) {
  if (process.env.XCHAT_RECOVERED_SECRET_HEX?.trim()) {
    log('secret', 'Using XCHAT_RECOVERED_SECRET_HEX from env');
    return process.env.XCHAT_RECOVERED_SECRET_HEX.trim();
  }

  const passcode = process.env.XCHAT_PASSCODE?.trim();
  if (!passcode) {
    throw new Error(
      'Provide XCHAT_RECOVERED_SECRET_HEX, or XCHAT_PASSCODE with OAuth credentials',
    );
  }

  let tokenMap;
  if (process.env.XCHAT_TOKEN_MAP_JSON?.trim()) {
    log('secret', 'Using XCHAT_TOKEN_MAP_JSON from env');
    tokenMap = JSON.parse(process.env.XCHAT_TOKEN_MAP_JSON);
  } else {
    if (process.env.X_OAUTH2_ACCESS_TOKEN || process.env.OAUTH1_ACCESS_TOKEN) {
      log('secret', 'Fetching juicebox_config via GET /2/users/:id/public_keys (official API)');
    } else {
      log(
        'secret',
        'No OAuth user creds — falling back to internal GetPublicKeys GraphQL (needs query id)',
      );
    }
    const bundle = await resolveJuiceboxTokenMap({
      userId: forUserId,
      authToken: process.env.AUTH_TOKEN?.trim(),
    });
    if (bundle.signingKeyVersion) {
      log('secret', `signing_key_version=${bundle.signingKeyVersion}`);
    }
    tokenMap = bundle.tokenMap;
  }

  log('secret', 'Recovering XChat account secret via Juicebox + PIN');
  let recoveredSecretHex;
  try {
    recoveredSecretHex = await lib.recover_xchat_secret(passcode, tokenMap);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('WASM is currently unsupported by require(esm)')) {
      throw error;
    }
    log('secret', 'CJS juicebox require failed — using ESM unlock subprocess');
    recoveredSecretHex = await recoverXchatSecretViaEsm(passcode, tokenMap);
  }
  log('secret', `Recovered secret (${recoveredSecretHex.length / 2} bytes)`);
  return recoveredSecretHex;
}

async function tryFetchConversationPage({
  authToken,
  forUserId,
  senderId,
  recoveredSecretHex,
}) {
  if (process.env.SKIP_CONVERSATION_FETCH === '1') {
    return null;
  }

  log('fetch', 'Attempting fetch_xchat_conversation_page via twitter_lib (may segfault on macOS)');
  try {
    const xchat = await lib.get_xchat_recovered_secret(
      authToken,
      process.env.XCHAT_PASSCODE,
      forUserId,
    );
    const conversationId = `${forUserId}-${senderId}`;
    const page = await lib.fetch_xchat_conversation_page(
      xchat.cookies,
      xchat.bearer_token,
      conversationId,
      20,
    );
    const decryptedEvents = lib.decrypt_xchat_conversation_events(
      page,
      recoveredSecretHex,
      forUserId,
    );
    return { conversationId, events: decryptedEvents };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('SIGSEGV') || message.includes('signal')) {
      log('fetch', 'curl-cffi crashed — skip with SKIP_CONVERSATION_FETCH=1');
    } else {
      log('fetch', `Conversation fetch skipped: ${message}`);
    }
    return null;
  }
}

async function main() {
  bootstrapFromConnectionFile();

  const fixture = loadFixture();
  const forUserId = fixture.for_user_id;
  const senderId = fixture.sender_id;

  log('fixture', `Loaded ${path.basename(fixturePath)}`);
  log(
    'fixture',
    `thread ${forUserId}-${senderId} (peer ghostpodapp) key_version=${fixture.conversation_key_version}`,
  );

  const parsedMessage = lib.parse_xchat_message_event(fixture.encoded_event);
  const parsedKeyChange = lib.parse_xchat_missing_conversation_key_event(
    fixture.conversation_key_change_event,
  );

  log('parse', `message event: ${JSON.stringify(summarizeParsedEvent(parsedMessage))}`);
  log(
    'parse',
    `key-change: version=${parsedKeyChange.conversation_key_version} ` +
      `wrapped_key_b64_len=${parsedKeyChange.wrapped_key_b64?.length ?? 0}`,
  );

  if (process.env.PARSE_ONLY === '1') {
    log('parse', 'PARSE_ONLY=1 — stopping before secret recovery / decrypt');
    return;
  }

  const recoveredSecretHex = await resolveRecoveredSecretHex({ forUserId });

  const conversationKeyMap = lib.build_xchat_conversation_key_map(
    [fixture.conversation_key_change_event],
    recoveredSecretHex,
    forUserId,
  );

  const keyVersions = Object.keys(conversationKeyMap);
  log(
    'keys',
    `Unwrapped conversation keys for versions: ${keyVersions.join(', ') || '(none)'}`,
  );

  if (!conversationKeyMap[fixture.conversation_key_version]) {
    throw new Error(
      `No conversation key for version ${fixture.conversation_key_version}. ` +
        'PIN/secret may be wrong, or key-change event is for a different participant.',
    );
  }

  const decrypted = lib.decrypt_xchat_message_event(
    fixture.encoded_event,
    conversationKeyMap,
  );

  const summary = summarizeDecrypted(decrypted);
  log('decrypt', `result: ${JSON.stringify(summary, null, 2)}`);

  if (summary.text) {
    console.log('\n--- DECRYPTED MESSAGE ---');
    console.log(summary.text);
    console.log('-------------------------\n');
  } else {
    console.error('\nDecryption did not yield plaintext text.');
    if (decrypted?.parsed_entry) {
      console.error('parsed_entry:', JSON.stringify(decrypted.parsed_entry, null, 2));
    }
    process.exitCode = 1;
  }

  if (process.env.AUTH_TOKEN && process.env.XCHAT_PASSCODE) {
    const pageResult = await tryFetchConversationPage({
      authToken: process.env.AUTH_TOKEN,
      forUserId,
      senderId,
      recoveredSecretHex,
    });
    if (pageResult?.events?.length) {
      log(
        'fetch',
        `Conversation page returned ${pageResult.events.length} decrypted event(s)`,
      );
      for (const event of pageResult.events.slice(0, 3)) {
        const text = event?.parsed_entry?.text ?? event?.text ?? null;
        console.log(`  - ${text ?? JSON.stringify(summarizeDecrypted(event))}`);
      }
    }
  }
}

main().catch((error) => {
  console.error('\nPoC failed:', error instanceof Error ? error.message : error);
  console.error(
    '\nTips (see https://github.com/xdevplatform/xchat-bot-python):\n' +
      '  • Official unlock uses OAuth user context + GET /2/users/:id/public_keys\n' +
      '  • Hub stores OAuth 1.0a tokens: OAUTH1_ACCESS_TOKEN + OAUTH1_ACCESS_TOKEN_SECRET\n' +
      '  • Also set X_API_KEY + X_API_KEY_SECRET (X app consumer key/secret)\n' +
      '  • XCHAT_PASSCODE = 4-digit XChat PIN (same as xchat-bot-unlock)\n' +
      '  • auth_token alone is NOT enough for the official API\n',
  );
  process.exit(1);
});
