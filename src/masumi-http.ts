/**
 * Auth headers for Masumi Payment Service HTTP APIs.
 * Matches pip-masumi (token + x-api-key for compatibility with registry + payment routes).
 */

export function masumiAuthHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    token: apiKey,
    'x-api-key': apiKey,
  };
}
