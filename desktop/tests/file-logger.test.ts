import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('createFileLogger 会按缓冲行数立即 flush 到磁盘', async () => {
  const fileLoggerModule = await import('../src/file-logger.ts');
  const dir = mkdtempSync(join(tmpdir(), 'hbs-file-logger-flush-'));

  try {
    const logger = fileLoggerModule.createFileLogger({
      logsDir: dir,
      fileName: 'flush.log',
      flushIntervalMs: 60_000,
      flushBufferLines: 3,
    });

    logger.write('line-1');
    logger.write('line-2');
    logger.write('line-3'); // 触发立即 flush

    const expected = 'line-1\nline-2\nline-3\n';
    const deadline = Date.now() + 1_000;
    let content = '';
    while (content !== expected && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      content = readFileSync(join(dir, 'flush.log'), 'utf8');
    }

    await logger.close();
    assert.equal(content, expected);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createFileLogger close 时会 flush 残余缓冲', async () => {
  const fileLoggerModule = await import('../src/file-logger.ts');
  const dir = mkdtempSync(join(tmpdir(), 'hbs-file-logger-close-'));

  try {
    const logger = fileLoggerModule.createFileLogger({
      logsDir: dir,
      fileName: 'close.log',
      flushIntervalMs: 60_000,
      flushBufferLines: 999,
    });

    logger.write('only-line');
    await logger.close();

    const content = readFileSync(join(dir, 'close.log'), 'utf8');
    assert.equal(content, 'only-line\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createFileLogger 使用 append 模式，二次创建不会覆盖既有内容', async () => {
  const fileLoggerModule = await import('../src/file-logger.ts');
  const dir = mkdtempSync(join(tmpdir(), 'hbs-file-logger-append-'));

  try {
    const first = fileLoggerModule.createFileLogger({
      logsDir: dir,
      fileName: 'append.log',
    });
    first.write('boot-1');
    await first.close();

    const second = fileLoggerModule.createFileLogger({
      logsDir: dir,
      fileName: 'append.log',
    });
    second.write('boot-2');
    await second.close();

    const content = readFileSync(join(dir, 'append.log'), 'utf8');
    assert.equal(content, 'boot-1\nboot-2\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createFileLogger 启动时对超阈值日志截断，仅保留尾部', async () => {
  const fileLoggerModule = await import('../src/file-logger.ts');
  const { writeFileSync, statSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'hbs-file-logger-truncate-'));

  try {
    const logPath = join(dir, 'main.log');
    // 100KB 内容，阈值设为 10KB → 应截断到标记行 + 尾部 1KB
    const content = 'x'.repeat(100 * 1024);
    writeFileSync(logPath, content);

    const logger = fileLoggerModule.createFileLogger({
      logsDir: dir,
      fileName: 'main.log',
      maxBytes: 10 * 1024,
    });
    await logger.close();

    const truncated = readFileSync(logPath, 'utf8');
    assert.match(truncated, /已截断仅保留最近/);
    // keepBytes = min(1MB, maxBytes=10KB) = 10KB：截断后 ≈ 标记行 + 10KB 尾部
    const size = statSync(logPath).size;
    assert.ok(size < 11 * 1024, `截断后应只有标记行 + 10KB 尾部，实际 ${size}`);
    assert.ok(size > 10 * 1024, '标记行与尾部都应存在');
    assert.ok(truncated.includes('x'.repeat(100)), '尾部内容应保留');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createFileLogger 对未超阈值日志不截断', async () => {
  const fileLoggerModule = await import('../src/file-logger.ts');
  const { writeFileSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'hbs-file-logger-keep-'));

  try {
    writeFileSync(join(dir, 'main.log'), 'short log\n');
    const logger = fileLoggerModule.createFileLogger({
      logsDir: dir,
      fileName: 'main.log',
      maxBytes: 10 * 1024,
    });
    await logger.close();
    assert.equal(readFileSync(join(dir, 'main.log'), 'utf8'), 'short log\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
