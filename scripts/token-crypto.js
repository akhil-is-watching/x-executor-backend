const { createDecipheriv } = require('node:crypto');

function decryptTokenPayload(payload, keyBase64) {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must decode to 32 bytes');
  }
  const [ivB64, tagB64, dataB64] = payload.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function loadOAuth1FromConnection(connection, encryptionKeyBase64) {
  if (!connection.accessTokenEnc || !connection.accessTokenSecretEnc) {
    throw new Error('Connection missing accessTokenEnc / accessTokenSecretEnc');
  }
  return {
    accessToken: decryptTokenPayload(connection.accessTokenEnc, encryptionKeyBase64),
    accessTokenSecret: decryptTokenPayload(
      connection.accessTokenSecretEnc,
      encryptionKeyBase64,
    ),
    authToken: connection.authTokenEnc
      ? decryptTokenPayload(connection.authTokenEnc, encryptionKeyBase64)
      : undefined,
    xUserId: String(connection.xUserId),
  };
}

module.exports = { decryptTokenPayload, loadOAuth1FromConnection };
