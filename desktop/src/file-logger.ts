import {
  appendFileSync,
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  statSync,
  writeFileSync,
  type WriteStream,
} from 'node:fs';
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
  /** 单文件上限（字节）：超过则在启动时截断仅保留尾部。默认 5MB。 */
  maxBytes?: number;
};

const DEFAULT_MAX_LOG_BYTES = 5 * 1024 * 1024;
const TRUNCATED_KEEP_BYTES = 1024 * 1024;

/**
 * 启动期截断：append 模式无轮转，长期使用会无限增长。
 * 超阈值时只保留尾部最近 1MB 并写入截断标记；失败不阻塞（日志是辅助设施）。
 */
function truncateLogIfNeeded(logPath: string, maxBytes: number): void {
  try {
    if (!existsSync(logPath)) {
      return;
    }
    const size = statSync(logPath).size;
    if (size <= maxBytes) {
      return;
    }

    const keepBytes = Math.min(TRUNCATED_KEEP_BYTES, maxBytes);
    const fd = openSync(logPath, 'r');
    let tail: Buffer;
    try {
      const buffer = Buffer.alloc(keepBytes);
      const bytesRead = readSync(fd, buffer, 0, keepBytes, size - keepBytes);
      tail = buffer.subarray(0, bytesRead);
    } finally {
      closeSync(fd);
    }
    writeFileSync(
      logPath,
      `[hbs-file-logger] 日志超过 ${Math.round(maxBytes / 1024 / 1024)}MB，已截断仅保留最近 ${Math.round(keepBytes / 1024 / 1024)}MB\n`
    );
    appendFileSync(logPath, tail);
  } catch (error) {
    process.stderr.write(
      `[hbs-file-logger] truncate failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
  }
}

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

  const logPath = join(options.logsDir, fileName);
  truncateLogIfNeeded(logPath, options.maxBytes ?? DEFAULT_MAX_LOG_BYTES);

  const stream: WriteStream = createWriteStream(logPath, {
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
