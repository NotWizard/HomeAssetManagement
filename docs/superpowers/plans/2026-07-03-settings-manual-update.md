# Settings Manual Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a desktop-only Settings card that lets users manually check for, download, and install stable updates while preserving the existing automatic silent-download path.

**Architecture:** Keep `createUpdateController` as the only update state machine. Manual IPC checks stop at `available`; automatic checks continue into `downloadUpdate()`. The Settings card and sidebar notice share one small React state-subscription hook and the existing desktop bridge.

**Tech Stack:** Electron 35, TypeScript 5, React 18, Tailwind CSS, Node test runner, GitHub Actions and GitHub Releases.

---

### Task 1: Make manual checks stop before downloading

**Files:**
- Modify: `desktop/src/update-workflow.ts`
- Modify: `desktop/src/update-controller.ts`
- Test: `desktop/tests/update-controller.test.ts`
- Test: `desktop/tests/update-workflow.test.ts`

- [ ] **Step 1: Add failing controller tests**

Add a release fixture containing ZIP and SHA-256 assets, then verify the two entry modes:

```ts
const release = {
  tag_name: 'v0.5.0',
  name: 'v0.5.0 手动更新',
  html_url: 'https://example.test/releases/v0.5.0',
  published_at: '2026-07-03T00:00:00Z',
  draft: false,
  prerelease: false,
  assets: [
    {
      name: 'HouseholdBalanceSheet-0.5.0-macos-arm64.zip',
      browser_download_url: 'https://example.test/update.zip',
      size: 1024,
    },
    {
      name: 'HouseholdBalanceSheet-0.5.0-macos-arm64.zip.sha256',
      browser_download_url: 'https://example.test/update.zip.sha256',
    },
  ],
};

test('手动检查发现新版后停在 available 且不会下载', async () => {
  let assetFetchCount = 0;
  const originalFetch = global.fetch;
  global.fetch = (async () => {
    assetFetchCount += 1;
    return new Response(null, { status: 503 });
  }) as typeof fetch;
  const controller = updateControllerModule.createUpdateController({
    appVersion: '0.4.1',
    arch: 'arm64',
    isPackaged: true,
    userDataDir: '/tmp/hbs-manual-update',
    fetchJsonReleases: async () => [release],
    scheduleInterval: () => ({ dispose() {} }),
    loadPersistedState: () => null,
    persistState: () => undefined,
  });
  const state = await controller.checkForUpdates({ manual: true });

  assert.equal(state.status, 'available');
  assert.equal(state.releaseTitle, 'v0.5.0 手动更新');
  assert.equal(state.publishedAt, '2026-07-03T00:00:00Z');
  assert.equal(assetFetchCount, 0);
  global.fetch = originalFetch;
});

test('自动检查发现新版后仍只启动一个下载任务', async () => {
  let shaFetchCount = 0;
  const originalFetch = global.fetch;
  global.fetch = (async (input: string | URL | Request) => {
    if (String(input).endsWith('.sha256')) shaFetchCount += 1;
    return new Response(null, { status: 503 });
  }) as typeof fetch;
  const controller = updateControllerModule.createUpdateController({
    appVersion: '0.4.1',
    arch: 'arm64',
    isPackaged: true,
    userDataDir: '/tmp/hbs-auto-update',
    fetchJsonReleases: async () => [release],
    scheduleInterval: () => ({ dispose() {} }),
    loadPersistedState: () => null,
    persistState: () => undefined,
  });
  await Promise.all([
    controller.checkForUpdates(),
    controller.checkForUpdates(),
  ]);

  assert.equal(shaFetchCount, 1);
  global.fetch = originalFetch;
});
```

- [ ] **Step 2: Run the focused desktop tests and confirm failure**

Run:

```bash
node --test --experimental-strip-types desktop/tests/update-controller.test.ts desktop/tests/update-workflow.test.ts
```

Expected: the manual check triggers download or the new release metadata assertions fail.

- [ ] **Step 3: Carry release summary fields into shared state**

Extend `UpdateState` and `toAvailableState`:

```ts
export type UpdateState = {
  // existing fields
  releaseTitle?: string;
  publishedAt?: string;
};

export function toAvailableState(options: {
  currentVersion: string;
  candidate: UpdateCandidate;
}): Partial<UpdateState> {
  return {
    status: 'available',
    currentVersion: options.currentVersion,
    latestVersion: options.candidate.version,
    releaseTag: options.candidate.tagName,
    releaseTitle: options.candidate.title,
    releaseUrl: options.candidate.releaseUrl,
    publishedAt: options.candidate.publishedAt,
    // existing asset fields
  };
}
```

Clear both optional fields when a successful check confirms there is no update.

- [ ] **Step 4: Separate automatic and manual check behavior**

Guard duplicate busy work and only auto-download for automatic checks:

```ts
if (['checking', 'downloading', 'preparing', 'installing'].includes(state.status)) {
  return state;
}

if (!checkOptions.manual && state.status === 'available') {
  void downloadUpdate().catch(() => undefined);
}
```

Move the initial `downloading` state transition before the first awaited filesystem operation and return the current state if another download is already active.

- [ ] **Step 5: Run the focused desktop tests**

Run:

```bash
node --test --experimental-strip-types desktop/tests/update-controller.test.ts desktop/tests/update-workflow.test.ts
```

Expected: all focused tests pass; automatic checks still download and manual checks remain `available`.

### Task 2: Share frontend update state and correct retry actions

**Files:**
- Create: `frontend/src/components/layout/useDesktopUpdateState.ts`
- Modify: `frontend/src/components/layout/DesktopUpdateNotice.tsx`
- Modify: `frontend/src/components/layout/desktopUpdateNoticeState.ts`
- Modify: `frontend/src/config/runtime.ts`
- Test: `frontend/tests/desktopUpdateNotice.test.ts`

- [ ] **Step 1: Add failing frontend state tests**

Cover the new Settings actions, 60-second result reuse, manual network failure detection, and sidebar retry routing:

```ts
assert.equal(
  resolveDesktopUpdateSettingsAction({ status: 'available' }),
  'download-update'
);
assert.equal(
  resolveDesktopUpdateSettingsAction({ status: 'downloaded' }),
  'open-install-dialog'
);
assert.equal(
  shouldReuseRecentUpdateCheck({ lastCheckedAt: now - 30_000 }, now),
  true
);
assert.equal(
  didLatestUpdateCheckFail({
    lastCheckedAt: now,
    lastNetworkErrorAt: now,
    lastSuccessfulCheckAt: now - 1,
  }),
  true
);
assert.equal(
  resolveDesktopUpdateClickAction({
    status: 'error',
    errorKind: 'download',
    downloadedFilePath: '/tmp/incomplete.zip',
  }),
  'download-update'
);
```

- [ ] **Step 2: Run the focused frontend test and confirm failure**

Run:

```bash
cd frontend
node --test --experimental-strip-types tests/desktopUpdateNotice.test.ts
```

Expected: imports or assertions fail because the new helpers and actions do not exist.

- [ ] **Step 3: Extend the runtime state type**

Add the fields already provided by the desktop controller:

```ts
export type HbsDesktopUpdateState = {
  // existing fields
  releaseTitle?: string | null;
  releaseUrl?: string | null;
  publishedAt?: string | null;
  lastCheckedAt?: number | null;
  lastSuccessfulCheckAt?: number | null;
  lastKnownLatestVersion?: string | null;
  lastNetworkErrorAt?: number | null;
};
```

- [ ] **Step 4: Add the smallest shared helpers**

Extend `desktopUpdateNoticeState.ts` with:

```ts
export type DesktopUpdateClickAction =
  | 'open-install-dialog'
  | 'check-for-updates'
  | 'download-update'
  | 'none';

export function shouldReuseRecentUpdateCheck(
  state: Pick<HbsDesktopUpdateState, 'lastCheckedAt'> | null,
  now: number
): boolean {
  return typeof state?.lastCheckedAt === 'number' &&
    now - state.lastCheckedAt < 60_000;
}

export function didLatestUpdateCheckFail(
  state: Pick<
    HbsDesktopUpdateState,
    'lastCheckedAt' | 'lastSuccessfulCheckAt' | 'lastNetworkErrorAt'
  > | null
): boolean {
  return typeof state?.lastCheckedAt === 'number' &&
    state.lastNetworkErrorAt === state.lastCheckedAt &&
    (state.lastSuccessfulCheckAt ?? 0) < state.lastCheckedAt;
}

export function getDesktopUpdateSettingsButtonLabel(
  state: HbsDesktopUpdateState | null
): string {
  switch (state?.status ?? 'idle') {
    case 'available': return '下载更新';
    case 'downloading': return formatUpdateDownloadProgress(state?.progress);
    case 'downloaded': return '安装并重启';
    case 'checking': return '检查中';
    default: return '检查更新';
  }
}
```

Map download errors to `download-update`, install errors with a downloaded file to `open-install-dialog`, and validation or fallback errors to `check-for-updates`.

- [ ] **Step 5: Extract the shared subscription hook**

Move the current `getState()` plus `onUpdateStateChanged()` effect into:

```ts
export function useDesktopUpdateState() {
  const [state, setState] = useState<HbsDesktopUpdateState | null>(null);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!isDesktopRuntime() || !bridge) return;
    let disposed = false;
    void bridge.updates.getState().then((payload) => {
      if (!disposed) setState(normalizeUpdateState(payload));
    });
    const unsubscribe = bridge.updates.onUpdateStateChanged((payload) => {
      if (!disposed) setState(normalizeUpdateState(payload));
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  return state;
}
```

Use the hook from `DesktopUpdateNotice`, and route `download-update` to `desktopBridge.updates.downloadUpdate()`.

- [ ] **Step 6: Run the focused frontend test**

Run:

```bash
cd frontend
node --test --experimental-strip-types tests/desktopUpdateNotice.test.ts
```

Expected: all tests pass.

### Task 3: Add the Settings update card

**Files:**
- Create: `frontend/src/components/settings/DesktopUpdateSettingsCard.tsx`
- Modify: `frontend/src/pages/SettingsPage.tsx`
- Modify: `frontend/tests/hardening.test.ts`

- [ ] **Step 1: Add a failing placement/source test**

Assert that `SettingsPage` renders the desktop card between global settings and migration:

```ts
const settingsSource = readFileSync(
  'frontend/src/pages/SettingsPage.tsx',
  'utf8'
);
assert.match(settingsSource, /<DesktopUpdateSettingsCard \\/>/);
assert.ok(
  settingsSource.indexOf('<DesktopUpdateSettingsCard />') <
    settingsSource.indexOf('数据迁移 / 备份')
);
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```bash
cd frontend
node --test --experimental-strip-types tests/hardening.test.ts
```

Expected: the Settings card assertion fails.

- [ ] **Step 3: Implement the desktop-only card**

Create `DesktopUpdateSettingsCard` with one state-driven primary action:

```tsx
if (!isDesktopRuntime() || !desktopBridge) return null;

const action = resolveDesktopUpdateSettingsAction(updateState);

<Button
  disabled={action === 'none' || actionPending}
  onClick={handlePrimaryAction}
>
  {getDesktopUpdateSettingsButtonLabel(updateState)}
</Button>
```

Behavior:

- `idle`: show current version, latest confirmation when `lastKnownLatestVersion === null`, and check time.
- `checking`: show a spinner and disable action.
- `available`: show version, release title, date, external release link, and “下载更新”.
- `downloading`: show bounded progress and no pause/cancel control.
- `downloaded`: show “安装并重启”.
- `preparing` / `installing`: show progress text and disable action.
- `error`: show `errorMessage` and route the retry through the shared action helper.

The manual check handler must reuse state less than 60 seconds old and display a local error when `didLatestUpdateCheckFail()` is true.

- [ ] **Step 4: Reuse the existing install confirmation**

Use the same confirmation copy as the sidebar and call `installUpdate()` only after confirmation. Keep the release link as:

```tsx
<a href={updateState.releaseUrl} target="_blank" rel="noreferrer">
  查看官方发布说明
</a>
```

Electron’s existing navigation guard opens the URL in the system browser.

- [ ] **Step 5: Insert the card at the approved position**

In `SettingsPage`, render:

```tsx
<DesktopUpdateSettingsCard />
```

after the global settings `Card` and before the migration `Card`.

- [ ] **Step 6: Run focused frontend verification**

Run:

```bash
cd frontend
node --test --experimental-strip-types tests/desktopUpdateNotice.test.ts tests/hardening.test.ts
npm run typecheck
npm run build
```

Expected: tests, typecheck, and production build pass.

### Task 4: Verify the two previously completed fixes remain covered

**Files:**
- Verify: `desktop/src/update-controller.ts`
- Verify: `desktop/tests/update-controller.test.ts`
- Verify: `frontend/src/pages/OverviewPage.tsx`
- Verify: `frontend/tests/hardening.test.ts`

- [ ] **Step 1: Run the updater staging-cleanup regression**

Run:

```bash
node --test --experimental-strip-types desktop/tests/update-controller.test.ts
```

Expected: the system `/bin/rm` staging cleanup test passes.

- [ ] **Step 2: Run the rebalance full-list regression**

Run:

```bash
cd frontend
node --test --experimental-strip-types tests/hardening.test.ts
```

Expected: the Overview no longer applies `.slice(0, 6)` to rebalance alerts.

### Task 5: Prepare version 0.5.0 and release documentation

**Files:**
- Modify: `desktop/package.json`
- Modify: `desktop/package-lock.json`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `backend/app/core/config.py`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump all application versions**

Set desktop, frontend, both root lockfile package records, and backend `app_version` to `0.5.0`.

- [ ] **Step 2: Archive the Unreleased changelog**

Create:

```markdown
## [0.5.0] - 2026-07-03

### Added

- 设置页新增桌面端手动更新入口……
- Add a desktop manual-update entry to Settings…

### Fixed

- 修复 macOS 更新 staging 清理失败……
- Fix macOS update staging cleanup…
- 移除再平衡提醒六项截断……
- Remove the six-item rebalance alert cap…
```

Leave an empty `## [Unreleased]` above it, update comparison links, and retain full Chinese-first/English-second release wording.

- [ ] **Step 3: Verify version consistency**

Run:

```bash
rg -n '0\\.4\\.1|0\\.4\\.0' desktop/package.json desktop/package-lock.json frontend/package.json frontend/package-lock.json backend/app/core/config.py
```

Expected: no stale application version remains in the inspected manifest roots.

### Task 6: Full validation, commit, push, tag, and release

**Files:**
- Add: `docs/superpowers/plans/2026-07-03-settings-manual-update.md`
- Verify all tracked changes in the current checkout.

- [ ] **Step 1: Run the complete local test matrix**

Run:

```bash
node --test --experimental-strip-types desktop/tests/*.test.ts
npm --prefix desktop run typecheck
cd frontend
node --test --experimental-strip-types tests/*.test.ts
npm run typecheck
npm run build
cd ..
.venv/bin/python -m pytest backend/tests
git diff --check
```

Expected: every command passes.

- [ ] **Step 2: Audit the final diff**

Run:

```bash
git status --short --branch
git diff --stat
git diff --name-status
git diff --check
```

Confirm only the feature, the two already requested fixes, version files, changelog, design, and implementation plan are included. Leave `.codegraph/`, `.superpowers/`, and unrelated `docs/整改清单-v1.md` untracked.

- [ ] **Step 3: Commit with the repository’s bilingual format**

Stage only the intended tracked and new plan files. The commit body must contain complete Chinese and English sections with real line breaks.

- [ ] **Step 4: Push `main`**

Run:

```bash
git push origin main
```

Expected: `origin/main` advances to the local implementation commit.

- [ ] **Step 5: Create and push annotated tag**

Run:

```bash
git tag -a v0.5.0 -m "v0.5.0"
git push origin v0.5.0
```

Expected: the tag points at the verified release commit and triggers `.github/workflows/release.yml`.

- [ ] **Step 6: Publish guideline-compliant release notes**

Create or edit GitHub Release `v0.5.0` with a focus title and Chinese-first/English-second body. Include:

- Settings manual update flow;
- macOS “安装并重启” staging cleanup fix;
- all rebalance alerts above 5% now display.

Do not include implementation jargon or repeat the title as an H1 in the body.

- [ ] **Step 7: Wait for and verify release assets**

Run:

```bash
gh run list --workflow Release --limit 5
gh run watch <run-id> --exit-status
gh release view v0.5.0 --json tagName,name,isDraft,isPrerelease,url,assets
```

Expected: workflow succeeds, the release is published, and the arm64 DMG, ZIP, and matching SHA-256 files are present.
