const HEADERS = { "User-Agent": "vn-trader/0.1" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch JSON với retry backoff — nguồn public hay trả 429/500 thoáng qua. */
export async function fetchJson<T>(url: string, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return (await res.json()) as T;
      if (res.status < 500 && res.status !== 429) {
        throw new Error(`HTTP ${res.status} ${url}`);
      }
      lastErr = new Error(`HTTP ${res.status} ${url}`);
    } catch (e) {
      lastErr = e;
    }
    await sleep(400 * (attempt + 1));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
