var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

var worker_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return corsResponse(null, 204);
    }
    const url = new URL(request.url);
    let payload;
    try {
      payload = await verifyAuth(request, env);
    } catch (err) {
      return corsResponse({ error: "Unauthorized: " + err.message }, 401);
    }
    try {
      if (url.pathname === "/upload/presign")            return await handlePresign(request, env, payload);
      if (url.pathname === "/upload/multipart/create")   return await handleMpCreate(request, env, payload);
      if (url.pathname === "/upload/multipart/part")     return await handleMpPart(request, env);
      if (url.pathname === "/upload/multipart/complete") return await handleMpComplete(request, env);
      if (url.pathname === "/upload/multipart/abort")    return await handleMpAbort(request, env);
      if (url.pathname === "/email/send")                return await handleEmail(request, env);
      if (url.pathname === "/stream/upload")             return await handleStreamUpload(request, env);
      if (url.pathname === "/stream/status")             return await handleStreamStatus(request, env);
      if (url.pathname === "/upload/file")               return await handleFileUpload(request, env);
      return corsResponse({ error: "Not found" }, 404);
    } catch (err) {
      console.error(err);
      return corsResponse({ error: err.message || "Internal server error" }, 500);
    }
  }
};

// JWT шалгах — Supabase /auth/v1/user endpoint ашиглана
// HS256/ES256 алгоритмаас үл хамааран ажиллана
async function verifyAuth(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("No Bearer token");
  const token = auth.slice(7);
  if (!token) throw new Error("Empty token");

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "apikey": env.SUPABASE_ANON_KEY,
    }
  });
  if (!res.ok) throw new Error("Token invalid");

  const user = await res.json();
  // payload.sub — хэрэглэгчийн ID буцаана (хуучин кодтой нийцүүлэх)
  return { sub: user.id, email: user.email };
}
__name(verifyAuth, "verifyAuth");

async function handlePresign(request, env, payload) {
  const { filename, contentType, folder } = await request.json();
  if (!filename || !contentType) {
    return corsResponse({ error: "filename and contentType required" }, 400);
  }
  const key = buildKey(folder, filename, payload.sub);
  const publicUrl = `${env.R2_PUBLIC_URL}/${key}`;
  const presignedUrl = await r2PresignPut(env, key, contentType, 600);
  return corsResponse({ url: presignedUrl, publicUrl });
}
__name(handlePresign, "handlePresign");

async function handleMpCreate(request, env, payload) {
  const { filename, contentType, folder } = await request.json();
  if (!filename || !contentType) {
    return corsResponse({ error: "filename and contentType required" }, 400);
  }
  const key = buildKey(folder, filename, payload.sub);
  const publicUrl = `${env.R2_PUBLIC_URL}/${key}`;
  const uploadId = await r2MultipartCreate(env, key, contentType);
  return corsResponse({ uploadId, key, publicUrl });
}
__name(handleMpCreate, "handleMpCreate");

async function handleMpPart(request, env) {
  const { key, uploadId, partNumber } = await request.json();
  if (!key || !uploadId || !partNumber) {
    return corsResponse({ error: "key, uploadId, partNumber required" }, 400);
  }
  const url = await r2PresignUploadPart(env, key, uploadId, partNumber, 600);
  return corsResponse({ url });
}
__name(handleMpPart, "handleMpPart");

async function handleMpComplete(request, env) {
  const { key, uploadId, parts } = await request.json();
  if (!key || !uploadId || !parts) {
    return corsResponse({ error: "key, uploadId, parts required" }, 400);
  }
  await r2MultipartComplete(env, key, uploadId, parts);
  return corsResponse({ ok: true });
}
__name(handleMpComplete, "handleMpComplete");

async function handleMpAbort(request, env) {
  const { key, uploadId } = await request.json();
  if (!key || !uploadId) {
    return corsResponse({ error: "key and uploadId required" }, 400);
  }
  await r2MultipartAbort(env, key, uploadId);
  return corsResponse({ ok: true });
}
__name(handleMpAbort, "handleMpAbort");

// ── Worker-оор файл upload хийх (CORS асуудлыг шийдэнэ) ─────────
async function handleFileUpload(request, env) {
    const formData = await request.formData();
    const file     = formData.get('file');
    const folder   = formData.get('folder') || 'uploads';
    if (!file) return corsResponse({ error: 'file шаардлагатай' }, 400);

    const ext       = file.name.split('.').pop().toLowerCase();
    const key       = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const arrayBuf  = await file.arrayBuffer();

    await env.BUCKET.put(key, arrayBuf, {
        httpMetadata: { contentType: file.type || 'application/octet-stream' },
    });

    return corsResponse({ publicUrl: `${env.R2_PUBLIC_URL}/${key}`, key });
}

// ── Cloudflare Stream upload ─────────────────────────────────────
async function handleStreamUpload(request, env) {
    if (!env.STREAM_API_TOKEN || !env.CF_ACCOUNT_ID) {
        return corsResponse({ error: 'Stream тохируулаагүй' }, 500);
    }
    const { filename, fileSize } = await request.json();
    if (!filename || !fileSize) {
        return corsResponse({ error: 'filename, fileSize шаардлагатай' }, 400);
    }

    // Cloudflare Stream TUS upload URL авна
    const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream?direct_user=true`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.STREAM_API_TOKEN}`,
                'Tus-Resumable': '1.0.0',
                'Upload-Length': String(fileSize),
                'Upload-Metadata': `name ${btoa(filename)}`,
            }
        }
    );

    if (!res.ok) {
        const err = await res.text();
        return corsResponse({ error: 'Stream upload үүсгэхэд алдаа: ' + err }, 500);
    }

    const uploadUrl = res.headers.get('Location');
    const streamId  = res.headers.get('stream-media-id');

    return corsResponse({ uploadUrl, streamId });
}

// ── Stream видео мэдээлэл авах ────────────────────────────────────
async function handleStreamStatus(request, env) {
    const { streamId } = await request.json();
    if (!streamId) return corsResponse({ error: 'streamId шаардлагатай' }, 400);

    const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/${streamId}`,
        {
            headers: { 'Authorization': `Bearer ${env.STREAM_API_TOKEN}` }
        }
    );
    if (!res.ok) return corsResponse({ error: 'Stream олдсонгүй' }, 404);

    const data = await res.json();
    const result = data.result || {};
    return corsResponse({
        status:    result.status?.state,
        hlsUrl:    result.playback?.hls,
        dashUrl:   result.playback?.dash,
        thumbnail: result.thumbnail,
        duration:  result.duration,
    });
}

async function handleEmail(request, env) {
  const { to, subject, html } = await request.json();
  if (!to || !subject || !html) {
    return corsResponse({ error: "to, subject, html required" }, 400);
  }
  if (!env.RESEND_API_KEY) {
    return corsResponse({ error: "RESEND_API_KEY not configured" }, 500);
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "GoyKino <noreply@goykino.uk>",
      to: [to],
      subject,
      html
    })
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("Resend error:", res.status, body);
    return corsResponse({ error: "Email sending failed" }, 502);
  }
  return corsResponse({ ok: true });
}
__name(handleEmail, "handleEmail");

async function r2PresignPut(env, key, contentType, expiresIn) {
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";
  const now = new Date();
  const dateStr = formatDate(now);
  const amzDate = formatAmzDate(now);
  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${env.R2_ACCESS_KEY_ID}/${dateStr}/${region}/${service}/aws4_request`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": "host"
  });
  const canonicalRequest = [
    "PUT",
    `/${env.R2_BUCKET_NAME}/${key}`,
    queryParams.toString(),
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD"
  ].join("\n");
  const sig = await buildSignature(env, canonicalRequest, dateStr, amzDate, region, service);
  queryParams.set("X-Amz-Signature", sig);
  return `https://${host}/${env.R2_BUCKET_NAME}/${key}?${queryParams.toString()}`;
}
__name(r2PresignPut, "r2PresignPut");

async function r2MultipartCreate(env, key, contentType) {
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";
  const now = new Date();
  const dateStr = formatDate(now);
  const amzDate = formatAmzDate(now);
  const bodyHash = await sha256hex("");
  const signedHeaders = "content-type;host;x-amz-date";
  const canonicalRequest = [
    "POST",
    `/${env.R2_BUCKET_NAME}/${key}`,
    "uploads=",
    `content-type:${contentType}\nhost:${host}\nx-amz-date:${amzDate}\n`,
    signedHeaders,
    bodyHash
  ].join("\n");
  const sig = await buildSignature(env, canonicalRequest, dateStr, amzDate, region, service);
  const authHeader = [
    `AWS4-HMAC-SHA256 Credential=${env.R2_ACCESS_KEY_ID}/${dateStr}/${region}/${service}/aws4_request`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${sig}`
  ].join(", ");
  const res = await fetch(`https://${host}/${env.R2_BUCKET_NAME}/${key}?uploads=`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "Host": host,
      "X-Amz-Date": amzDate,
      "Authorization": authHeader
    }
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`R2 multipart create failed (${res.status}): ${txt}`);
  }
  const xml = await res.text();
  const uploadId = xmlExtract(xml, "UploadId");
  if (!uploadId) throw new Error("UploadId not found in R2 response");
  return uploadId;
}
__name(r2MultipartCreate, "r2MultipartCreate");

async function r2PresignUploadPart(env, key, uploadId, partNumber, expiresIn) {
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";
  const now = new Date();
  const dateStr = formatDate(now);
  const amzDate = formatAmzDate(now);
  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${env.R2_ACCESS_KEY_ID}/${dateStr}/${region}/${service}/aws4_request`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": "host",
    partNumber: String(partNumber),
    uploadId
  });
  const sortedParams = new URLSearchParams(
    [...queryParams.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  );
  const canonicalRequest = [
    "PUT",
    `/${env.R2_BUCKET_NAME}/${key}`,
    sortedParams.toString(),
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD"
  ].join("\n");
  const sig = await buildSignature(env, canonicalRequest, dateStr, amzDate, region, service);
  sortedParams.set("X-Amz-Signature", sig);
  return `https://${host}/${env.R2_BUCKET_NAME}/${key}?${sortedParams.toString()}`;
}
__name(r2PresignUploadPart, "r2PresignUploadPart");

async function r2MultipartComplete(env, key, uploadId, parts) {
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";
  const now = new Date();
  const dateStr = formatDate(now);
  const amzDate = formatAmzDate(now);
  const bodyXml = `<CompleteMultipartUpload>${parts.map(
    (p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`
  ).join("")}</CompleteMultipartUpload>`;
  const bodyHash = await sha256hex(bodyXml);
  const signedHeaders = "content-type;host;x-amz-date";
  const canonicalRequest = [
    "POST",
    `/${env.R2_BUCKET_NAME}/${key}`,
    `uploadId=${encodeURIComponent(uploadId)}`,
    `content-type:application/xml\nhost:${host}\nx-amz-date:${amzDate}\n`,
    signedHeaders,
    bodyHash
  ].join("\n");
  const sig = await buildSignature(env, canonicalRequest, dateStr, amzDate, region, service);
  const authHeader = [
    `AWS4-HMAC-SHA256 Credential=${env.R2_ACCESS_KEY_ID}/${dateStr}/${region}/${service}/aws4_request`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${sig}`
  ].join(", ");
  const res = await fetch(
    `https://${host}/${env.R2_BUCKET_NAME}/${key}?uploadId=${encodeURIComponent(uploadId)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/xml",
        "Host": host,
        "X-Amz-Date": amzDate,
        "Authorization": authHeader
      },
      body: bodyXml
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`R2 multipart complete failed (${res.status}): ${txt}`);
  }
}
__name(r2MultipartComplete, "r2MultipartComplete");

async function r2MultipartAbort(env, key, uploadId) {
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";
  const now = new Date();
  const dateStr = formatDate(now);
  const amzDate = formatAmzDate(now);
  const bodyHash = await sha256hex("");
  const signedHeaders = "host;x-amz-date";
  const canonicalRequest = [
    "DELETE",
    `/${env.R2_BUCKET_NAME}/${key}`,
    `uploadId=${encodeURIComponent(uploadId)}`,
    `host:${host}\nx-amz-date:${amzDate}\n`,
    signedHeaders,
    bodyHash
  ].join("\n");
  const sig = await buildSignature(env, canonicalRequest, dateStr, amzDate, region, service);
  const authHeader = [
    `AWS4-HMAC-SHA256 Credential=${env.R2_ACCESS_KEY_ID}/${dateStr}/${region}/${service}/aws4_request`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${sig}`
  ].join(", ");
  await fetch(
    `https://${host}/${env.R2_BUCKET_NAME}/${key}?uploadId=${encodeURIComponent(uploadId)}`,
    {
      method: "DELETE",
      headers: { "Host": host, "X-Amz-Date": amzDate, "Authorization": authHeader }
    }
  );
}
__name(r2MultipartAbort, "r2MultipartAbort");

async function buildSignature(env, canonicalRequest, dateStr, amzDate, region, service) {
  const scope = `${dateStr}/${region}/${service}/aws4_request`;
  const crHash = await sha256hex(canonicalRequest);
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, crHash].join("\n");
  const signingKey = await getSigningKey(env.R2_SECRET_ACCESS_KEY, dateStr, region, service);
  const sigBytes = await hmacSign(signingKey, stringToSign);
  return toHex(sigBytes);
}
__name(buildSignature, "buildSignature");

async function getSigningKey(secret, dateStr, region, service) {
  const kDate    = await hmacSign(new TextEncoder().encode("AWS4" + secret), dateStr);
  const kRegion  = await hmacSign(kDate, region);
  const kService = await hmacSign(kRegion, service);
  return await hmacSign(kService, "aws4_request");
}
__name(getSigningKey, "getSigningKey");

async function hmacSign(key, data) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}
__name(hmacSign, "hmacSign");

async function sha256hex(data) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(new Uint8Array(hash));
}
__name(sha256hex, "sha256hex");

function toHex(buf) {
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(toHex, "toHex");

function formatDate(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
__name(formatDate, "formatDate");

function formatAmzDate(d) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
__name(formatAmzDate, "formatAmzDate");

function b64urlDecode(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(b64.length + (4 - b64.length % 4) % 4, "=");
  return atob(padded);
}
__name(b64urlDecode, "b64urlDecode");

function b64urlDecodeBytes(str) {
  const decoded = b64urlDecode(str);
  return Uint8Array.from(decoded, (c) => c.charCodeAt(0));
}
__name(b64urlDecodeBytes, "b64urlDecodeBytes");

function xmlExtract(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)<\/${tag}>`));
  return match ? match[1] : null;
}
__name(xmlExtract, "xmlExtract");

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
}
__name(sanitizeFilename, "sanitizeFilename");

function buildKey(folder, filename, userId) {
  const safe = sanitizeFilename(filename);
  const ts = Date.now();
  const f = folder ? folder.replace(/[^a-z0-9_-]/gi, "") + "/" : "";
  const uid = userId ? userId.slice(0, 8) + "/" : "";
  return `${f}${uid}${ts}_${safe}`;
}
__name(buildKey, "buildKey");

function corsResponse(data, status = 200) {
  const body = data === null ? null : JSON.stringify(data);
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Expose-Headers": "ETag",
      "Access-Control-Max-Age": "14400",
    }
  });
}
__name(corsResponse, "corsResponse");

export { worker_default as default };