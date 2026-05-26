import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';

/**
 * 简单文件 logger：append 模式写到 logsDir/<fileName>；调用方每行一笔，内部
 * 用行缓冲 + 1s 间隔（或满 N 行）flush 一次，避免给每条 console-message
 * 都 fsync 一次磁盘。close() 会 flush 残余并 end stream。
 */
export type FileLogger = {
  write(line: string): void;
  flush(): void;
  close(): Promise<void>;
};

export type FileLoggerOptions = {
  logsDir: string;
  fileName?: string;
  flushIntervalMs?: number;
  flushBufferLines?: number;
};

export function createFileLogger(options: FileLoggerOptions): FileLogger {
  const fileName = options.fileName ?? 'main.log';
  const flushIntervalMs = options.flushIntervalMs ?? 1000;
  const flushBufferLines = options.flushBufferLines ?? 200;

  // 确保 logsDir 存在；失败也不阻塞——后续 createWriteStream 会抛 'error'
  // 事件，由 stream.on('error') 兜住打到 stderr。
  try {
    mkdirSync(options.logsDir, { recursive: true });
  } catch {
    // ignore
  }

  const stream: WriteStream = createWriteStream(join(options.logsDir, fileName), {
    flags: 'a',
  });
  stream.on('error', (err) => {
    process.stderr.write(`[hbs-file-logger] write error: ${err.message}\n`);
  });

  let buffer: string[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  function flushSync(): void {
    if (buffer.length === 0) return;
    const chunk = buffer.join('');
    buffer = [];
    stream.write(chunk);
  }

  function scheduleFlush(): void {
    if (timer || closed) return;
    timer = setTimeout(() => {
      timer = null;
      flushSync();
    }, flushIntervalMs);
    // 不让定时器阻塞进程退出
    if (typeof timer === 'object' && timer && typeof (timer as { unref?: () => void }).unref === 'function') {
      (timer as { unref: () => void }).unref();
    }
  }

  return {
    write(line: string): void {
      if (closed) return;
      buffer.push(line.endsWith('\n') ? line : `${line}\n`);
      if (buffer.length >= flushBufferLines) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        flushSync();
        return;
      }
      scheduleFlush();
    },
    flush(): void {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      flushSync();
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      flushSync();
      await new Promise<void>((resolve) => {
        stream.end(() => resolve());
      });
    },
  };
}
