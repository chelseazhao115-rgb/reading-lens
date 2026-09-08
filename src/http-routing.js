export function pathnameFromRequestUrl(requestUrl = '/') {
  try {
    return new URL(requestUrl, 'http://127.0.0.1').pathname;
  } catch {
    return '/invalid-request-path';
  }
}
