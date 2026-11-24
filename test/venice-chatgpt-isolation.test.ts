import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, it, vi } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');
const source = read('extension/background.js');
const recovery = source.slice(source.indexOf('let veniceChatgptWarningShown'),
  source.indexOf('// The existing maintenance owner repairs missing observers'));
const usage = source.slice(source.indexOf('const USAGE_REPLACE_RETRY_MS'),
  source.indexOf('async function restoreOpenChatgptTabs('));

function harness(matches: string[]) {
  const executeScript = vi.fn(async () => []), insertCSS = vi.fn(async () => {});
  const warn = vi.fn(), setBadgeText = vi.fn(async () => {}), setTitle = vi.fn(async () => {});
  const tabReply = vi.fn(async () => null);
  const api = vm.runInNewContext(`${recovery}\n${usage}\n({restoreChatgptTab, replaceUsageObserver})`, {
    chrome: {
      runtime: { getManifest: () => ({ content_scripts: [{ matches }] }) },
      action: { setBadgeText, setTitle }, scripting: { executeScript, insertCSS }
    },
    CHATGPT_TAB_URLS: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
    CLF_I18N: { ready: Promise.resolve(), t: (key: string) => JSON.parse(read('extension/_locales/en/messages.json'))[key].message },
    console: { warn }, tabReply, PAGE_RECORDER_VERSION: 22,
    forgetErrorPage: async () => {}, reloadErrorPage: vi.fn(), setTimeout: vi.fn()
  });
  return { api, executeScript, insertCSS, warn, setBadgeText, setTitle, tabReply };
}

it('warns once and blocks every recovery injection in the shipped Venice-only build', async () => {
  const manifest = JSON.parse(read('extension/manifest.json'));
  const h = harness(manifest.content_scripts.flatMap((entry: { matches: string[] }) => entry.matches));
  expect(await h.api.restoreChatgptTab(7)).toBe(false);
  expect(await h.api.restoreChatgptTab(8)).toBe(false);
  expect(await h.api.replaceUsageObserver(7)).toBe(false);
  expect(h.tabReply).not.toHaveBeenCalled();
  expect(h.executeScript).not.toHaveBeenCalled();
  expect(h.insertCSS).not.toHaveBeenCalled();
  expect(h.warn).toHaveBeenCalledTimes(1);
  const warning = h.warn.mock.calls[0]![0];
  expect(warning).toContain('ChatGPT reinjection is blocked');
  expect(h.setBadgeText).toHaveBeenCalledExactlyOnceWith({ text: '!' });
  expect(h.setTitle).toHaveBeenCalledExactlyOnceWith({ title: warning });
});

it.each(['https://chatgpt.com/*', 'https://chat.openai.com/*'])('preserves recovery for a manifest that explicitly supports %s', async host => {
  const h = harness(['https://venice.ai/*', host]);
  expect(await h.api.restoreChatgptTab(7)).toBe(true);
  expect(h.executeScript.mock.calls).toHaveLength(5);
  expect(h.insertCSS).toHaveBeenCalledTimes(1);
  expect(h.warn).not.toHaveBeenCalled();
});

it('does not change the upstream ChatGPT-only build', async () => {
  const h = harness(['https://chatgpt.com/*']);
  expect(await h.api.restoreChatgptTab(7)).toBe(true);
  expect(h.warn).not.toHaveBeenCalled();
});

it('does not warn for an abandoned recovery attempt', async () => {
  const h = harness(['https://venice.ai/*']);
  expect(await h.api.restoreChatgptTab(7, () => false)).toBe(false);
  expect(h.warn).not.toHaveBeenCalled();
});

it('registers a one-line migration warning directly in Japanese and English', () => {
  for (const language of ['ja', 'en']) {
    const catalog = JSON.parse(read(`extension/_locales/${language}/messages.json`));
    expect(Object.hasOwn(catalog, 'venice_chatgpt_migration_warning')).toBe(true);
    expect(catalog.venice_chatgpt_migration_warning.message).not.toMatch(/[\r\n]/);
    expect(catalog.venice_chatgpt_migration_warning.message.length).toBeGreaterThan(20);
  }
});
