import { resolveListenPort } from './env.util';

describe('resolveListenPort', () => {
  const originalPort = process.env.PORT;
  const originalLowerPort = process.env.port;

  afterEach(() => {
    if (originalPort === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = originalPort;
    }
    if (originalLowerPort === undefined) {
      delete process.env.port;
    } else {
      process.env.port = originalLowerPort;
    }
  });

  it('reads PORT', () => {
    process.env.PORT = '3000';
    delete process.env.port;
    expect(resolveListenPort()).toBe(3000);
  });

  it('falls back to lowercase port', () => {
    delete process.env.PORT;
    process.env.port = '3001';
    expect(resolveListenPort()).toBe(3001);
  });

  it('throws when PORT is missing', () => {
    delete process.env.PORT;
    delete process.env.port;
    expect(() => resolveListenPort()).toThrow('PORT environment variable is required');
  });

  it('throws when PORT is invalid', () => {
    process.env.PORT = 'not-a-port';
    expect(() => resolveListenPort()).toThrow('Invalid PORT: not-a-port');
  });
});
