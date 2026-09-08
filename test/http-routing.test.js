import test from 'node:test';
import assert from 'node:assert/strict';
import { pathnameFromRequestUrl } from '../src/http-routing.js';

test('research-session query resolves to the product index route', () => {
  assert.equal(pathnameFromRequestUrl('/?research_session=rs_browserA123456'), '/');
});

test('API and static routes ignore query parameters without changing their pathname', () => {
  assert.equal(pathnameFromRequestUrl('/api/eval-results?fresh=1'), '/api/eval-results');
  assert.equal(pathnameFromRequestUrl('/review.html?protocol=v3'), '/review.html');
});
