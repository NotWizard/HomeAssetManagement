import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const FRONTEND_ROOT = process.cwd();

function readFrontendFile(relativePath: string): string {
  return readFileSync(resolve(FRONTEND_ROOT, relativePath), 'utf8');
}

test('桌面构建应使用相对资源路径，避免 file 协议加载白屏', () => {
  const viteConfigSource = readFrontendFile('vite.config.ts');

  assert.match(viteConfigSource, /defineConfig\(\(\{\s*command\s*\}\)\s*=>/);
  assert.match(viteConfigSource, /base:\s*command === 'build' \? '\.\/' : '\/'/);
});
