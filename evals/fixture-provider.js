export function createFixtureProvider(fixture, expectedIds) {
  const validation = validateFixture(fixture, expectedIds);
  if (!validation.valid) throw new Error(`Invalid provider fixture: ${validation.errors.join('; ')}`);
  const byId = new Map(fixture.results.map((item) => [item.id, item]));
  return Object.freeze({
    id: fixture.metadata.provider_id,
    promptVersion: fixture.metadata.prompt_version,
    promptHash: fixture.metadata.prompt_hash,
    modelVersion: fixture.metadata.model_version,
    async diagnose(input) {
      const item = byId.get(input.id);
      return {
        ...structuredClone(item.output),
        model_cost_usd: item.cost_usd,
        benchmark_recorded_latency_ms: item.latency_ms
      };
    }
  });
}

export function validateFixture(fixture, expectedIds) {
  const errors = [];
  if (!fixture || typeof fixture !== 'object') return { valid: false, errors: ['fixture_must_be_object'] };
  for (const field of ['provider_id', 'prompt_version', 'prompt_hash', 'model_version']) {
    if (!String(fixture.metadata?.[field] ?? '').trim()) errors.push(`metadata_${field}_required`);
  }
  if (fixture.metadata?.prompt_hash && !/^[a-f0-9]{64}$/i.test(fixture.metadata.prompt_hash)) errors.push('metadata_prompt_hash_invalid');
  if (!Array.isArray(fixture.results)) return { valid: false, errors: [...errors, 'results_must_be_array'] };
  const ids = fixture.results.map((item) => item.id);
  const expected = new Set(expectedIds);
  for (const id of new Set(ids)) if (!expected.has(id)) errors.push(`unknown_case:${id}`);
  for (const id of expected) {
    const count = ids.filter((value) => value === id).length;
    if (count === 0) errors.push(`missing_case:${id}`);
    if (count > 1) errors.push(`duplicate_case:${id}`);
  }
  for (const item of fixture.results) {
    if (!item.output || typeof item.output !== 'object' || Array.isArray(item.output)) errors.push(`invalid_output:${item.id}`);
    if (!Number.isFinite(item.latency_ms) || item.latency_ms < 0) errors.push(`invalid_latency:${item.id}`);
    if (!Number.isFinite(item.cost_usd) || item.cost_usd < 0) errors.push(`invalid_cost:${item.id}`);
  }
  return { valid: errors.length === 0, errors };
}
