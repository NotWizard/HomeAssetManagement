import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { calculateTooltipPosition } from '../src/components/ui/tooltipPosition.ts';

const FRONTEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('Tooltip 靠近视口左下角时向上翻转并保持完整可见', () => {
  const position = calculateTooltipPosition(
    { left: 4, top: 760, right: 24, bottom: 780, width: 20, height: 20 },
    { left: 0, top: 0, right: 176, bottom: 80, width: 176, height: 80 },
    { width: 800, height: 800 }
  );

  assert.deepEqual(position, {
    left: 8,
    top: 672,
    placement: 'top',
  });
});

test('Tooltip 靠近视口右侧时保持向下并收回视口内', () => {
  const position = calculateTooltipPosition(
    { left: 780, top: 100, right: 800, bottom: 120, width: 20, height: 20 },
    { left: 0, top: 0, right: 176, bottom: 40, width: 176, height: 40 },
    { width: 800, height: 800 }
  );

  assert.deepEqual(position, {
    left: 616,
    top: 128,
    placement: 'bottom',
  });
});

test('Tooltip 通过 Portal 脱离弹窗滚动容器', () => {
  const source = readFileSync(
    resolve(FRONTEND_ROOT, 'src/components/ui/tooltip.tsx'),
    'utf8'
  );

  assert.match(source, /createPortal/);
  assert.match(source, /className="pointer-events-none fixed/);
  assert.doesNotMatch(source, /absolute right-0 top-full/);
});
