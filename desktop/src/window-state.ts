import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

const WINDOW_STATE_FILE = 'window-state.json';
// 至少 100x100 像素与某块 display work area 重叠才算「窗口仍可见」；
// 防止保存时窗口贴边、再启动时屏幕配置变化导致窗口落到看不见的位置。
const MIN_VISIBLE_AREA_PX = 100 * 100;

export function getWindowStatePath(userDataDir: string): string {
  return join(userDataDir, WINDOW_STATE_FILE);
}

export function loadWindowBounds(filePath: string): WindowBounds | null {
  try {
    if (!existsSync(filePath)) {
      return null;
    }
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as WindowBounds).x !== 'number' ||
      typeof (parsed as WindowBounds).y !== 'number' ||
      typeof (parsed as WindowBounds).width !== 'number' ||
      typeof (parsed as WindowBounds).height !== 'number'
    ) {
      return null;
    }
    const candidate = parsed as WindowBounds;
    if (candidate.width <= 0 || candidate.height <= 0) {
      return null;
    }
    return {
      x: candidate.x,
      y: candidate.y,
      width: candidate.width,
      height: candidate.height,
    };
  } catch {
    return null;
  }
}

export function saveWindowBounds(filePath: string, bounds: WindowBounds): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(bounds), 'utf-8');
  } catch {
    // 持久化失败仅放弃本次写入，不影响应用关闭流程。
  }
}

/**
 * 判断保存的 bounds 是否仍与任一现有 display 的 work area 有足够重叠。
 * 之前如果用户从外接显示器拔掉、屏幕分辨率改变，保存的 bounds 可能完全落
 * 在屏幕外，恢复后窗口不可见 / 不可拖回。
 */
export function isBoundsVisibleOnDisplays(
  bounds: WindowBounds,
  displays: DisplayWorkArea[]
): boolean {
  for (const display of displays) {
    const overlapWidth =
      Math.min(bounds.x + bounds.width, display.x + display.width) -
      Math.max(bounds.x, display.x);
    const overlapHeight =
      Math.min(bounds.y + bounds.height, display.y + display.height) -
      Math.max(bounds.y, display.y);
    if (
      overlapWidth > 0 &&
      overlapHeight > 0 &&
      overlapWidth * overlapHeight >= MIN_VISIBLE_AREA_PX
    ) {
      return true;
    }
  }
  return false;
}
