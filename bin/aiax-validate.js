#!/usr/bin/env node
import { validateSite, fixtureFetch, formatReport } from '../index.js';
const USAGE = 'usage: aiax-validate <url> [--json] [--fixtures <dir>]';
export async function main(argv, out = process.stdout, err = process.stderr) {
  let url = null; let json = false; let fixtures = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') json = true;
    else if (a === '--fixtures') { fixtures = argv[++i]; if (!fixtures) { err.write(USAGE + '\n'); return 2; } }
    else if (a === '-h' || a === '--help') { out.write(USAGE + '\n'); return 2; }
    else if (a.startsWith('-')) { err.write(`unknown option ${a}\n${USAGE}\n`); return 2; }
    else if (url) { err.write(`only one url is accepted\n${USAGE}\n`); return 2; }
    else url = a;
  }
  if (!url) { err.write(USAGE + '\n'); return 2; }
  try { new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`); } catch { err.write(`not a url: ${url}\n${USAGE}\n`); return 2; }
  const report = await validateSite(url, fixtures ? { fetch: fixtureFetch(fixtures) } : {});
  out.write((json ? JSON.stringify(report, null, 2) : formatReport(report)) + '\n');
  return report.ok ? 0 : 1;
}
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('aiax-validate')) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
