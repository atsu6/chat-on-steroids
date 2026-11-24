import { rawPromises as fs } from './rawfs.js';
import type { Root } from '../shared/types.js';
import type { VeniceFindResult } from '../shared/venice-integration.js';
import type { Resolved } from './sandbox.js';
import { DEFAULT_EXCLUDES, search, searchOneFile, type SearchHit } from './search.js';
import { locateRipgrep } from './ripgrep.js';
import { sniffBinary } from './fsops.js';

interface Input {
  query: string;
  path?: string | undefined;
  mode?: 'content' | 'name' | undefined;
  include?: string | undefined;
  exclude?: string[] | undefined;
  case_sensitive?: boolean | undefined;
  regex?: boolean | undefined;
  max_results?: number | undefined;
}

/** Called by the existing find handler under host admission and its read/search guards. */
export async function findInVeniceRoots(input: Input, roots: Root[], resolve: (path: string) => Promise<Resolved>, current: () => boolean) {
  const mode = input.mode ?? 'content', limit = input.max_results ?? 200;
  if (mode === 'content' && !locateRipgrep()) throw new Error('RIPGREP_UNAVAILABLE: content search requires ripgrep.');
  const deadline = Date.now() + 10_000, hits: SearchHit[] = [], reasons = new Set<string>();
  const paths = input.path ? [input.path] : roots.map(root => `/${root.name}`);
  for (const requested of paths) {
    if (!current()) throw new Error('RUN_REVOKED');
    if (hits.length > limit) { reasons.add('limit'); break; }
    if (Date.now() >= deadline) { reasons.add('time'); break; }
    const target = await resolve(requested), stat = await fs.stat(target.real);
    if (!stat.isFile() && !stat.isDirectory()) throw new Error('Search path must be a regular file or folder.');
    if (mode === 'content' && stat.isFile() && await sniffBinary(target.real)) continue;
    if (!current()) throw new Error('RUN_REVOKED');
    const options = { query: input.query, mode, include: input.include, caseSensitive: input.case_sensitive === true,
      regex: input.regex === true, maxResults: limit + 1 - hits.length, deadline };
    const outcome = stat.isFile()
      ? await searchOneFile(target.real, target.virtual, options)
      : await search({ ...options, realDir: target.real, virtualDir: target.virtual, exclude: input.exclude ?? DEFAULT_EXCLUDES });
    hits.push(...outcome.hits);
    if (outcome.stoppedBecause) reasons.add(outcome.stoppedBecause);
  }
  const clean = (value: string) => value.replace(/\0/g, ' ');
  const matches = hits.slice(0, limit).map(hit => ({ path: clean(hit.path),
    ...(hit.line === undefined ? {} : { line: hit.line }), ...(hit.text === undefined ? {} : { text: clean(hit.text) }) }));
  if (hits.length > limit) reasons.add('limit');
  const result: VeniceFindResult = { matches, count: matches.length, limit,
    truncated: reasons.size > 0, stoppedBecause: [...reasons], binaryPolicy: mode === 'content' ? 'skip' : 'names-only' };
  const lines = matches.map(hit => hit.line === undefined ? hit.path : `${hit.path}:${hit.line}: ${hit.text ?? ''}`);
  const text = `${matches.length ? `${matches.length} matches\n${lines.join('\n')}` : 'No matches'}\nresults_returned: ${matches.length}\nlimit: ${limit}\ntruncated: ${result.truncated}${result.truncated ? ` (${result.stoppedBecause.join(', ')})` : ''}\nbinary_policy: ${result.binaryPolicy}`;
  return { content: [{ type: 'text' as const, text }], structuredContent: { ...result } };
}
