export const WORKSPACE_STORAGE_KEY = 'readingLensWorkspaces';
export const WORKSPACE_SCHEMA_VERSION = 1;

export function normalizeSourceUrl(value) {
  const url = new URL(value);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|from$|ref$)/i.test(key)) url.searchParams.delete(key);
  return url.toString();
}

export function workspaceKey(sourceUrl, passageHash) {
  return `${normalizeSourceUrl(sourceUrl)}#${String(passageHash ?? '').toLowerCase()}`;
}

export function emptyWorkspace({ sourceUrl, passageHash, title = '' }) {
  const now = new Date().toISOString();
  return {
    schema_version: WORKSPACE_SCHEMA_VERSION,
    key: workspaceKey(sourceUrl, passageHash), source_url: normalizeSourceUrl(sourceUrl),
    passage_hash: passageHash, title: clean(title, 200), created_at: now, updated_at: now,
    current_question: null, scroll_anchor: null, answers: {}, highlights: [], vocabulary_refs: [], diagnosis_refs: []
  };
}

export function upsertAnswer(workspace, answer) {
  const questionNumber = clean(answer?.question_number, 24);
  const value = clean(answer?.value, 1000);
  if (!questionNumber || !value) return workspace;
  const next = structuredClone(workspace);
  next.answers[questionNumber] = { question_number: questionNumber, value, completed: Boolean(answer.completed), updated_at: new Date().toISOString() };
  next.current_question = questionNumber;
  return touch(next);
}

export function createTextAnchor(fullText, start, end) {
  const exact = fullText.slice(start, end).replace(/\s+/g, ' ').trim();
  if (!exact) return null;
  const before = fullText.slice(Math.max(0, start - 40), start).replace(/\s+/g, ' ').trim();
  const after = fullText.slice(end, end + 40).replace(/\s+/g, ' ').trim();
  const occurrence = occurrences(fullText, exact).findIndex((index) => index === start);
  return { exact, prefix: before, suffix: after, occurrence: Math.max(0, occurrence) };
}

export function resolveTextAnchor(fullText, anchor) {
  if (!anchor?.exact) return { resolved: false, reason: 'invalid_anchor' };
  const positions = occurrences(fullText, anchor.exact);
  const candidates = positions.filter((start) => {
    const before = fullText.slice(Math.max(0, start - 40), start).replace(/\s+/g, ' ').trim();
    const after = fullText.slice(start + anchor.exact.length, start + anchor.exact.length + 40).replace(/\s+/g, ' ').trim();
    return (!anchor.prefix || before.endsWith(anchor.prefix)) && (!anchor.suffix || after.startsWith(anchor.suffix));
  });
  if (candidates.length !== 1) return { resolved: false, reason: candidates.length ? 'ambiguous_anchor' : 'anchor_not_found' };
  return { resolved: true, start: candidates[0], end: candidates[0] + anchor.exact.length };
}

export function addHighlight(workspace, value) {
  if (!['evidence', 'mistake', 'vocabulary'].includes(value?.kind) || !value?.anchor?.exact) return workspace;
  const next = structuredClone(workspace);
  const duplicate = next.highlights.find((item) => item.kind === value.kind && sameAnchor(item.anchor, value.anchor));
  if (duplicate) return next;
  next.highlights.push({
    id: value.id ?? crypto.randomUUID(), kind: value.kind, anchor: structuredClone(value.anchor),
    question_number: clean(value.question_number, 24) || null, note: clean(value.note, 2000),
    status: 'located', created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  });
  return touch(next);
}

export function updateHighlight(workspace, id, patch) {
  const next = structuredClone(workspace);
  const item = next.highlights.find((highlight) => highlight.id === id);
  if (!item) return workspace;
  if (patch.note !== undefined) item.note = clean(patch.note, 2000);
  if (patch.status !== undefined && ['located', 'unresolved'].includes(patch.status)) item.status = patch.status;
  item.updated_at = new Date().toISOString();
  return touch(next);
}

export function removeHighlight(workspace, id) {
  const next = structuredClone(workspace);
  next.highlights = next.highlights.filter((item) => item.id !== id);
  return next.highlights.length === workspace.highlights.length ? workspace : touch(next);
}

export function workspaceSummary(workspace) {
  return { updated_at: workspace.updated_at, answers: Object.keys(workspace.answers ?? {}).length, highlights: workspace.highlights?.length ?? 0, notes: (workspace.highlights ?? []).filter((item) => item.note).length };
}

export function validateWorkspaceBackup(value) {
  if (!value || value.schema_version !== WORKSPACE_SCHEMA_VERSION || typeof value.workspaces !== 'object' || Array.isArray(value.workspaces)) return { valid: false, error: 'invalid_workspace_backup' };
  return { valid: true, value: { schema_version: WORKSPACE_SCHEMA_VERSION, exported_at: value.exported_at ?? new Date().toISOString(), workspaces: structuredClone(value.workspaces) } };
}

function touch(value) { value.updated_at = new Date().toISOString(); return value; }
function clean(value, max) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
function occurrences(text, quote) { const result = []; let index = 0; while ((index = text.indexOf(quote, index)) >= 0) { result.push(index); index += Math.max(1, quote.length); } return result; }
function sameAnchor(a, b) { return a.exact === b.exact && a.prefix === b.prefix && a.suffix === b.suffix && a.occurrence === b.occurrence; }
