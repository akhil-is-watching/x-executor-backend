/**
 * Juicebox PIN unlock via ESM (Node 24 cannot require() juicebox-sdk WASM from CJS).
 * Reads token map JSON on stdin: { key_store_token_map_json, token_map: [{key,value:{token}}] }
 * Prints recovered secret hex to stdout.
 */
import { Client, Configuration } from 'juicebox-sdk';

const input = await new Promise((resolve, reject) => {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    data += chunk;
  });
  process.stdin.on('end', () => resolve(data));
  process.stdin.on('error', reject);
});

const passcode = process.env.XCHAT_PASSCODE?.trim();
if (!passcode) {
  console.error('XCHAT_PASSCODE is required');
  process.exit(1);
}

const tokenMap = JSON.parse(input || '{}');
const cfg = JSON.parse(tokenMap.key_store_token_map_json);
const tokens = Object.fromEntries(
  (tokenMap.token_map ?? []).map((entry) => [entry.key, entry.value?.token ?? entry.token]),
);
const encoder = new TextEncoder();

globalThis.JuiceboxGetAuthToken = async (realmIdBytes) => {
  const realmId = Buffer.from(realmIdBytes).toString('hex');
  const token = tokens[realmId];
  if (!token) {
    throw new Error(`Missing token for realm ${realmId}`);
  }
  return token;
};

try {
  const client = new Client(new Configuration(cfg), []);
  const secret = await client.recover(encoder.encode(passcode), encoder.encode(''));
  process.stdout.write(Buffer.from(secret).toString('hex'));
} catch (error) {
  const message =
    typeof error?.message === 'string' ? error.message : JSON.stringify(error ?? {});
  console.error(message);
  process.exit(1);
} finally {
  delete globalThis.JuiceboxGetAuthToken;
}
