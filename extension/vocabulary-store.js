export const VOCABULARY_STORAGE_KEY = 'readingLensVocabulary';
export const VOCABULARY_SCHEMA_VERSION = 1;

export function emptyVocabulary() { return { schema_version: VOCABULARY_SCHEMA_VERSION, entries: [] }; }

export function normalizeTerm(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('en').replace(/[“”‘’.,!?;:()[\]{}]/g, '').replace(/\s+/g, ' ').trim();
}

export function addVocabularyEntry(state, input) {
  const normalized = normalizeTerm(input?.term);
  if (!normalized || normalized.length > 120) return { state, entry: null, created: false, error: 'invalid_term' };
  const next = structuredClone(state?.schema_version === VOCABULARY_SCHEMA_VERSION ? state : emptyVocabulary());
  let entry = next.entries.find((item) => item.normalized_term === normalized);
  const source = normalizeSource(input);
  if (entry) {
    if (source && !entry.sources.some((item) => sameSource(item, source))) entry.sources.push(source);
    entry.updated_at = new Date().toISOString();
    return { state: next, entry, created: false, should_enrich: !entry.enrichment || entry.enrichment_status === 'failed' };
  }
  const now = new Date().toISOString();
  entry = {
    id: input.id ?? crypto.randomUUID(), normalized_term: normalized, original_term: clean(input.term, 120),
    sentence: clean(input.sentence, 1000), note: clean(input.note, 2000), status: 'new',
    enrichment_status: 'pending', enrichment: null, sources: source ? [source] : [], created_at: now, updated_at: now
  };
  next.entries.push(entry);
  return { state: next, entry, created: true, should_enrich: true };
}

export function applyEnrichment(state, id, enrichment) {
  const next = structuredClone(state); const entry = next.entries.find((item) => item.id === id); if (!entry) return state;
  entry.enrichment = structuredClone(enrichment); entry.enrichment_status = 'ready'; delete entry.enrichment_error; entry.updated_at = new Date().toISOString(); return next;
}
export function markEnrichmentPending(state, id) { const next = structuredClone(state); const entry = next.entries.find((item) => item.id === id); if (!entry) return state; entry.enrichment_status = 'pending'; delete entry.enrichment_error; entry.updated_at = new Date().toISOString(); return next; }
export function markEnrichmentFailed(state, id, error = 'vocabulary_provider_failed') { const next = structuredClone(state); const entry = next.entries.find((item) => item.id === id); if (!entry) return state; entry.enrichment_status = 'failed'; entry.enrichment_error = clean(error, 80); entry.updated_at = new Date().toISOString(); return next; }
export function updateVocabularyEntry(state, id, patch) {
  const next = structuredClone(state); const entry = next.entries.find((item) => item.id === id); if (!entry) return state;
  if (['new','reviewing','mastered'].includes(patch.status)) entry.status = patch.status;
  if (patch.note !== undefined) entry.note = clean(patch.note, 2000);
  if (patch.enrichment && typeof patch.enrichment === 'object') entry.enrichment = { ...(entry.enrichment ?? {}), ...patch.enrichment };
  entry.updated_at = new Date().toISOString(); return next;
}
export function removeVocabularyEntry(state, id) { const next = structuredClone(state); next.entries = next.entries.filter((item) => item.id !== id); return next; }
export function filteredVocabulary(state, { status = 'all', query = '' } = {}) { const needle = normalizeTerm(query); return (state?.entries ?? []).filter((entry) => (status === 'all' || entry.status === status) && (!needle || `${entry.normalized_term} ${entry.enrichment?.contextual_meaning_zh ?? ''}`.toLocaleLowerCase().includes(needle))); }

function normalizeSource(value) { if (!value?.workspace_key) return null; return { workspace_key: clean(value.workspace_key, 2200), source_label: clean(value.source_label, 160) || '爱听写阅读练习', question_number: clean(value.question_number, 24) || null, source_url: clean(value.source_url, 2048), added_at: new Date().toISOString() }; }
function sameSource(a, b) { return a.workspace_key === b.workspace_key && a.question_number === b.question_number; }
function clean(value, max) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
