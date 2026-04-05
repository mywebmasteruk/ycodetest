import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('logger', () => {
  const origEnv = process.env.NODE_ENV;
  const origLogFormat = process.env.LOG_FORMAT;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env.NODE_ENV = origEnv;
    if (origLogFormat === undefined) delete process.env.LOG_FORMAT;
    else process.env.LOG_FORMAT = origLogFormat;
  });

  it('exports info, warn, error methods', async () => {
    const { logger } = await import('./logger');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('info writes to stdout in JSON mode', async () => {
    process.env.LOG_FORMAT = 'json';
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const { logger } = await import('./logger');
    logger.info('test message', { tag: 'test', extra: 42 });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line.trim());
    expect(parsed.level).toBe('info');
    expect(parsed.msg).toBe('test message');
    expect(parsed.tag).toBe('test');
    expect(parsed.extra).toBe(42);
    expect(parsed.ts).toBeTruthy();
    spy.mockRestore();
  });

  it('error writes to stderr in JSON mode', async () => {
    process.env.LOG_FORMAT = 'json';
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { logger } = await import('./logger');
    logger.error('boom');
    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse((spy.mock.calls[0][0] as string).trim());
    expect(parsed.level).toBe('error');
    spy.mockRestore();
  });
});
