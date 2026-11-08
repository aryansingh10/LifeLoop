/** Minimal typed clients for the LifeLoop API (proxied through Next.js, same origin). */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
  ) {
    super(message);
  }
  get isAuth() {
    return this.code === 'UNAUTHENTICATED' || this.status === 401;
  }
}

export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/graphql', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new ApiError("Can't reach LifeLoop. Is the API running?", 'NETWORK');
  }
  const body = (await res.json().catch(() => null)) as { data?: T; errors?: Array<{ message: string; extensions?: { code?: string } }> } | null;
  if (body?.errors?.length) {
    const e = body.errors[0];
    throw new ApiError(e.message, e.extensions?.code ?? 'ERROR', res.status);
  }
  if (!res.ok || !body?.data) throw new ApiError(`Request failed (${res.status})`, 'HTTP', res.status);
  return body.data;
}

export async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: init.body instanceof FormData ? init.headers : { 'content-type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError("Can't reach LifeLoop. Is the API running?", 'NETWORK');
  }
  const body = (await res.json().catch(() => null)) as (T & { message?: string | string[] }) | null;
  if (!res.ok) {
    const msg = Array.isArray(body?.message) ? body.message[0] : body?.message;
    throw new ApiError(msg ?? `Request failed (${res.status})`, res.status === 401 ? 'UNAUTHENTICATED' : 'HTTP', res.status);
  }
  return body as T;
}

export const newRequestId = () => crypto.randomUUID();
