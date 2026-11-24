import { executeApplyPatch, type PatchPathResolver } from './codex/apply-patch/index.js';
import type { ProjectFs } from './remote/project-fs.js';
import { unifiedDiff } from './text-diff.js';

/** Run the existing patch engine against an in-memory overlay, never the real writer. */
export async function previewVenicePatch(patch: string, cwd: string, resolvePath: PatchPathResolver,
  fs: ProjectFs, displayPath: (real: string) => string): Promise<string> {
  const original = new Map<string, string | null>();
  const files = new Map<string, string | null>();
  const directories = new Set<string>();
  const absent = () => Object.assign(new Error('File does not exist'), { code: 'ENOENT' });
  const read = async (target: string): Promise<string> => {
    if (!files.has(target)) return fs.readFileText(target);
    const text = files.get(target);
    if (text === null) throw absent();
    return text!;
  };
  const capture = async (target: string): Promise<void> => {
    if (original.has(target)) return;
    try { original.set(target, await fs.readFileText(target)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; original.set(target, null); }
  };
  const overlay: ProjectFs = {
    ...fs,
    readFileText: read,
    readFile: async target => Buffer.from(await read(target)),
    getMetadata: async target => {
      if (!files.has(target) && !directories.has(target)) return fs.getMetadata(target);
      if (files.get(target) === null) throw absent();
      return { isDirectory: directories.has(target), isFile: !directories.has(target), isSymlink: false,
        size: Buffer.byteLength(files.get(target) ?? ''), createdAtMs: 0, modifiedAtMs: 0 };
    },
    writeFile: async (target, bytes) => { await capture(target); files.set(target, bytes.toString()); },
    remove: async target => { await capture(target); files.set(target, null); },
    createDirectory: async target => { directories.add(target); }
  };
  const result = await executeApplyPatch({ patch, cwd, updateFileMode: 'preserve_line_endings', resolvePath, fs: overlay });
  if (result.exitCode !== 0) throw new Error(result.stderr || 'Patch preview failed');
  const diffs: string[] = [];
  for (const [target, before] of original) {
    const after = files.get(target) ?? null;
    if (before === after) continue;
    const name = JSON.stringify(displayPath(target));
    let hunks = unifiedDiff(before ?? '', after ?? '');
    // The shared line diff ignores EOF/line-ending-only edits; make those changes visible too.
    if (!hunks) {
      const lines = (text: string | null) => text ? text.replace(/\n$/, '').split('\n') : [];
      const old = lines(before), next = lines(after);
      hunks = [`@@ -${old.length ? 1 : 0},${old.length} +${next.length ? 1 : 0},${next.length} @@`,
        ...old.map(line => '-' + line), ...next.map(line => '+' + line)].join('\n');
    }
    diffs.push(`--- ${before === null ? '/dev/null' : name}\n+++ ${after === null ? '/dev/null' : name}\n${hunks}`);
  }
  return diffs.join('\n\n');
}
