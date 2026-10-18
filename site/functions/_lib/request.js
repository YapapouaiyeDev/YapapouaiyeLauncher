export async function readJsonBody(request, maxBytes = 2048) {
  const fail = (message, status = 400) => Object.assign(new Error(message), { status });
  const reader = request.body?.getReader();
  if (!reader) throw fail('Corps JSON requis.');
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw fail('Requête trop volumineuse.', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw fail('Requête JSON invalide.'); }
}
