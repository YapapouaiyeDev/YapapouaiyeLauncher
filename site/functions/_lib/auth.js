const rateLimitStore = new Map();

export function rateLimited(request, { limit = 5, windowMs = 60000, scope = "default" } = {}) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "127.0.0.1";
  const key = `${scope}:${ip}`;
  const now = Date.now();

  const record = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + windowMs;
  } else {
    record.count += 1;
  }
  rateLimitStore.set(key, record);

  // Periodic cleanup
  if (rateLimitStore.size > 1000) {
    for (const [k, v] of rateLimitStore.entries()) {
      if (now > v.resetAt) rateLimitStore.delete(k);
    }
  }

  return record.count > limit;
}

export function rateLimitResponse(retryAfter = 60) {
  return new Response(JSON.stringify({ error: "Trop de requêtes. Veuillez patienter avant de réessayer." }), {
    status: 429,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Retry-After": String(retryAfter),
      "Cache-Control": "no-store",
    },
  });
}

export async function issueAdminToken(env, ttlHours = 24) {
  const secret = env.ADMIN_TOKEN_SECRET || env.ADMIN_PASSWORD || "yapapouaiye-launcher-secret-key-2026";
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlHours * 3600;
  
  const payload = {
    role: "admin",
    sub: env.ADMIN_USERNAME || "admin",
    iat: now,
    exp: exp,
  };

  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=+$/, "");
  const sigB64 = await signString(payloadB64, secret);
  return `${payloadB64}.${sigB64}`;
}

export async function verifyAdminRequest(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7).trim();
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;

  const secret = env.ADMIN_TOKEN_SECRET || env.ADMIN_PASSWORD || "yapapouaiye-launcher-secret-key-2026";
  const expectedSig = await signString(payloadB64, secret);
  if (expectedSig !== sigB64) return false;

  try {
    const payload = JSON.parse(atob(payloadB64));
    if (!payload || payload.role !== "admin") return false;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return false;
    return payload;
  } catch {
    return false;
  }
}

async function signString(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sigBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
