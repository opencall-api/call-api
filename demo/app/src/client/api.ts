import { maskToken } from './utils';
import { getAuth } from './auth';
import { addRequest, addResponse, renderEnvelopeViewer } from './envelope';

export async function callApi(op: string, args?: any, ctx?: any) {
  args = args || {};
  ctx = ctx || {};

  const auth = getAuth();
  if (!auth) {
    window.location.href = '/auth';
    return { status: 401, data: { state: 'error', error: { code: 'AUTH_REQUIRED' } }, request: null };
  }

  const requestBody: any = { op, args };
  if (Object.keys(ctx).length > 0) {
    requestBody.ctx = ctx;
  }

  const apiUrl = auth.apiUrl + '/call';
  const startTime = Date.now();

  // Build request entry for envelope viewer
  const requestEntry: any = {
    timestamp: startTime,
    op: op,
    method: 'POST',
    url: apiUrl,
    headers: {
      'Authorization': 'Bearer ' + maskToken(auth.token),
      'Content-Type': 'application/json',
    },
    body: requestBody,
  };

  let res;
  let data;
  try {
    res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + auth.token,
      },
      body: JSON.stringify(requestBody),
    });
    const elapsed = Date.now() - startTime;
    data = await res.json();

    // Store request with requestId from response
    const requestId = data.requestId || crypto.randomUUID();
    requestEntry.requestId = requestId;
    addRequest(requestEntry);

    // Store response
    addResponse(requestId, {
      timestamp: Date.now(),
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body: data,
      timeMs: elapsed,
    });

    // Render envelope viewer
    renderEnvelopeViewer();

    // Check for session expiry (401) - redirect to auth
    if (res.status === 401) {
      sessionStorage.clear();
      window.location.href = '/auth?expired=1';
      return { status: 401, data: data, request: requestEntry };
    }

    return { status: res.status, data: data, request: requestEntry };
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    const errorBody = { state: 'error', error: { code: 'NETWORK_ERROR', message: err.message } };

    const requestId = crypto.randomUUID();
    requestEntry.requestId = requestId;
    addRequest(requestEntry);
    addResponse(requestId, {
      timestamp: Date.now(),
      status: 0,
      headers: {},
      body: errorBody,
      timeMs: elapsed,
    });
    renderEnvelopeViewer();

    return { status: 0, data: errorBody, request: requestEntry };
  }
}

export async function pollOperation(requestId: string) {
  const auth = getAuth();
  if (!auth) {
    return { status: 401, data: { state: 'error', error: { code: 'AUTH_REQUIRED' } } };
  }

  const apiUrl = auth.apiUrl + '/ops/' + encodeURIComponent(requestId);
  const startTime = Date.now();

  try {
    const res = await fetch(apiUrl, {
      headers: { 'Authorization': 'Bearer ' + auth.token },
    });
    const elapsed = Date.now() - startTime;
    const data = await res.json();

    // Add polling response to existing request's response chain
    addResponse(requestId, {
      timestamp: Date.now(),
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body: data,
      timeMs: elapsed,
    });
    renderEnvelopeViewer();

    return { status: res.status, data: data };
  } catch (err: any) {
    return { status: 0, data: { state: 'error', error: { code: 'NETWORK_ERROR', message: err.message } } };
  }
}

export async function fetchChunks(requestId: string) {
  const auth = getAuth();
  if (!auth) {
    return [];
  }

  const chunks: any[] = [];
  let cursor: string | null = null;

  do {
    let url = auth.apiUrl + '/ops/' + encodeURIComponent(requestId) + '/chunks';
    if (cursor) url += '?cursor=' + encodeURIComponent(cursor);

    const res = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + auth.token },
    });
    if (!res.ok) break;

    const chunk = await res.json();
    chunks.push(chunk);
    cursor = chunk.cursor;
  } while (cursor);

  return chunks;
}
