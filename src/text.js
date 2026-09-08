export function normalizeText(value = '') {
  return value
    .normalize('NFKC')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function quoteExistsInPassage(quote, passage) {
  const normalizedQuote = normalizeText(quote);
  const normalizedPassage = normalizeText(passage);
  return normalizedQuote.length > 0 && normalizedPassage.includes(normalizedQuote);
}

function tokens(value) {
  return new Set(normalizeText(value).toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

export function tokenOverlap(a, b) {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / Math.min(left.size, right.size);
}

