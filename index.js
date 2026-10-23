// aiax-validator: validate and score a site's AIAX manifest (version 0.1) and its sections.
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const here = new URL('.', import.meta.url);
const manifestSchema = JSON.parse(readFileSync(new URL('schemas/manifest.schema.json', here), 'utf8'));
const sectionSchema = JSON.parse(readFileSync(new URL('schemas/section.schema.json', here), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const checkManifest = ajv.compile(manifestSchema);
const checkSection = ajv.compile(sectionSchema);

export const MANIFEST_PATHS = ['/.well-known/aiax.json', '/aiax/manifest.json'];
export const ERROR_COST = 10;
export const WARNING_COST = 2;

// Turn one Ajv error into {path, message} with a plain message that names the field.
export function explain(e) {
  let path = e.instancePath || '';
  const field = (p) => (p === '' ? 'the document' : p.split('/').filter(Boolean).join('.'));
  switch (e.keyword) {
    case 'required':
      path = `${path}/${e.params.missingProperty}`;
      return { path, message: `${field(path)} is required but missing` };
    case 'additionalProperties':
      path = `${path}/${e.params.additionalProperty}`;
      return { path, message: `${field(path)} is not an allowed field` };
    case 'type':
      return { path, message: `${field(path)} must be of type ${[].concat(e.params.type).join(' or ')}` };
    case 'enum':
      return { path, message: `${field(path)} must be one of ${e.params.allowedValues.map((v) => JSON.stringify(v)).join(', ')}` };
    case 'pattern':
      return { path, message: `${field(path)} does not match the pattern ${e.params.pattern}` };
    case 'format':
      return { path, message: `${field(path)} is not a valid ${e.params.format}` };
    case 'maxLength':
      return { path, message: `${field(path)} is longer than ${e.params.limit} characters` };
    case 'minItems':
      return { path, message: `${field(path)} needs at least ${e.params.limit} item(s)` };
    case 'maxItems':
      return { path, message: `${field(path)} has more than ${e.params.limit} item(s)` };
    case 'minimum':
    case 'maximum':
      return { path, message: `${field(path)} must be ${e.params.comparison} ${e.params.limit}` };
    case 'oneOf':
      return { path, message: `${field(path)} must be a JSON Schema object or a prose string` };
    default:
      return { path, message: `${field(path)} ${e.message}` };
  }
}

function schemaErrors(check, doc, url) {
  if (check(doc)) return [];
  const seen = new Set();
  const out = [];
  for (const e of check.errors) {
    // oneOf branches report their own type errors; keep only the oneOf summary
    if (e.keyword === 'type' && check.errors.some((o) => o.keyword === 'oneOf' && o.instancePath === e.instancePath)) continue;
    const x = explain(e);
    const k = x.path + '|' + x.message;
    if (!seen.has(k)) { seen.add(k); out.push({ url, ...x }); }
  }
  return out;
}

async function getJson(fetchFn, url) {
  let res;
  try { res = await fetchFn(url, { headers: { accept: 'application/json' } }); }
  catch (err) { return { error: `could not be fetched (${err && err.message ? err.message : 'network error'})` }; }
  if (!res || !res.ok) return { error: `could not be fetched (HTTP ${res ? res.status : 'no response'})`, status: res && res.status };
  const text = await res.text();
  try { return { doc: JSON.parse(text), text }; }
  catch { return { error: 'is not valid JSON', text }; }
}

export function scoreOf(errors, warnings) {
  return Math.max(0, 100 - ERROR_COST * errors - WARNING_COST * warnings);
}

// validateSite(url, {fetch}) -> Promise<Report>. Never throws for a bad site; only a bad url argument throws.
export async function validateSite(url, opts = {}) {
  const fetchFn = opts.fetch || globalThis.fetch;
  const base = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  const errors = []; const warnings = []; const sections = [];
  let manifest = null; let manifestUrl = null; const tried = [];
  for (const p of MANIFEST_PATHS) {
    const u = new URL(p, base).href;
    const r = await getJson(fetchFn, u);
    if (r.doc !== undefined) { manifest = r.doc; manifestUrl = u; break; }
    tried.push({ u, r });
    if (r.error === 'is not valid JSON') { manifestUrl = u; break; }
  }
  if (manifestUrl && manifest === null) {
    errors.push({ url: manifestUrl, path: '', message: 'the manifest is not valid JSON' });
  } else if (!manifestUrl) {
    errors.push({ url: base.href, path: '', message: `no AIAX manifest found at ${MANIFEST_PATHS.join(' or ')}` });
  } else {
    if (manifestUrl.endsWith(MANIFEST_PATHS[1])) warnings.push({ url: manifestUrl, path: '', message: `the manifest was found only at the fallback ${MANIFEST_PATHS[1]}, not at ${MANIFEST_PATHS[0]}` });
    errors.push(...schemaErrors(checkManifest, manifest, manifestUrl));
    const eps = manifest && Array.isArray(manifest.entry_points) ? manifest.entry_points : [];
    const ids = new Set();
    for (let i = 0; i < eps.length; i++) {
      const ep = eps[i];
      if (!ep || typeof ep !== 'object' || typeof ep.url !== 'string') continue;
      const id = typeof ep.id === 'string' ? ep.id : null;
      if (id !== null) {
        if (ids.has(id)) errors.push({ url: manifestUrl, path: `/entry_points/${i}/id`, message: `entry_points.${i}.id "${id}" is used more than once` });
        ids.add(id);
      }
      let su;
      try { su = new URL(ep.url, manifestUrl).href; } catch { continue; }
      const sErr = [];
      const r = await getJson(fetchFn, su);
      if (r.doc === undefined) {
        sErr.push({ url: su, path: '', message: `section ${id ?? i} ${r.error}` });
      } else {
        sErr.push(...schemaErrors(checkSection, r.doc, su));
        const sid = r.doc && typeof r.doc === 'object' ? r.doc.section_id : undefined;
        if (typeof sid === 'string' && id !== null && sid !== id) sErr.push({ url: su, path: '/section_id', message: `section_id "${sid}" differs from its entry point id "${id}"` });
        if (Number.isInteger(ep.est_tokens) && r.text) {
          const measured = Math.ceil(r.text.length / 4);
          if (measured > ep.est_tokens * 3 || measured * 3 < ep.est_tokens) warnings.push({ url: su, path: `/entry_points/${i}/est_tokens`, message: `entry_points.${i}.est_tokens is ${ep.est_tokens} but the section is about ${measured} tokens` });
        }
      }
      errors.push(...sErr);
      sections.push({ id, url: su, ok: sErr.length === 0, errors: sErr });
    }
  }
  const score = manifest === null ? 0 : scoreOf(errors.length, warnings.length);
  return { url: base.href, manifest_url: manifestUrl, ok: errors.length === 0, score, errors, warnings, sections };
}

// A fetch that answers from files: dir + URL path; a missing file is a 404.
export function fixtureFetch(dir) {
  return async (u) => {
    const p = decodeURIComponent(new URL(u).pathname);
    if (p.split('/').includes('..')) return new Response('not found', { status: 404 });
    try { return new Response(await readFile(join(dir, p)), { status: 200, headers: { 'content-type': 'application/json' } }); }
    catch { return new Response('not found', { status: 404 }); }
  };
}

export function formatReport(r) {
  const lines = [`${r.ok ? 'VALID' : 'INVALID'} ${r.url} score ${r.score}`];
  for (const e of r.errors) lines.push(`error ${e.url}${e.path ? ' ' + e.path : ''}: ${e.message}`);
  for (const w of r.warnings) lines.push(`warning ${w.url}${w.path ? ' ' + w.path : ''}: ${w.message}`);
  return lines.join('\n');
}
