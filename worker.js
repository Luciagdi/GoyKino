var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

var worker_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return corsResponse(null, 204);
    }
    const url = new URL(request.url);

    // /stream/token — нэвтрээгүй хэрэглэгч ч үнэгүй кино үзнэ, эрхийг get_movie_episodes шалгана
    if (url.pathname === "/stream/token") {
      try {
        return await handleStreamToken(request, env);
      } catch (err) {
        console.error(err);
        return corsResponse({ error: err.message || "Internal server error" }, 500);
      }
    }

    let payload;
    try {
      payload = await verifyAuth(request, env);
    } catch (err) {
      return corsResponse({ error: "Unauthorized: " + err.message }, 401);
    }
    try {
      // /upload/file — avatar-ыг энгийн хэрэглэгч ч upload хийж болно, бусад нь staff
      if (url.pathname === "/upload/file")               return await handleFileUpload(request, env, payload);

      // Имэйл зөвхөн админ, бусад upload/stream зөвхөн админ эсвэл модератор
      const role = await getUserRole(env, payload);
      const isAdmin = role === "admin";
      const isStaff = role === "admin" || role === "moderator";

      if (url.pathname === "/email/send") {
        if (!isAdmin) return forbidden();
        return await handleEmail(request, env);
      }
      if (!isStaff) return forbidden();
      if (url.pathname === "/stream/upload")             return await handleStreamUpload(request, env);
      if (url.pathname === "/stream/status")             return await handleStreamStatus(request, env);
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
  return { sub: user.id, email: user.email, token };
}
__name(verifyAuth, "verifyAuth");

// Хэрэглэгчийн role-г Supabase-аас тухайн хэрэглэгчийн token-оор уншина (RLS: өөрийн мөр)
async function getUserRole(env, payload) {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/profile?id=eq.${encodeURIComponent(payload.sub)}&select=role`,
    {
      headers: {
        "Authorization": `Bearer ${payload.token}`,
        "apikey": env.SUPABASE_ANON_KEY,
      }
    }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0]?.role || null;
}
__name(getUserRole, "getUserRole");

function forbidden() {
  return corsResponse({ error: "Forbidden: эрх хүрэлцэхгүй" }, 403);
}
__name(forbidden, "forbidden");

// ── Worker-оор файл upload хийх (CORS асуудлыг шийдэнэ) ─────────
// Зөвхөн зураг зөвшөөрнө — .html гэх мэт файл public R2-д орохоос сэргийлнэ
const IMAGE_TYPES = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
};
const UPLOAD_FOLDERS = ['covers', 'thumbs', 'avatars', 'banners'];

async function handleFileUpload(request, env, payload) {
    const formData = await request.formData();
    const file     = formData.get('file');
    const folder   = formData.get('folder');
    if (!file || typeof file === 'string') return corsResponse({ error: 'file шаардлагатай' }, 400);
    if (!UPLOAD_FOLDERS.includes(folder)) return corsResponse({ error: 'Буруу folder' }, 400);

    // avatars-аас бусад хавтсанд зөвхөн админ/модератор upload хийнэ
    if (folder !== 'avatars') {
        const role = await getUserRole(env, payload);
        if (role !== 'admin' && role !== 'moderator') return forbidden();
    }

    const ext         = (file.name.split('.').pop() || '').toLowerCase();
    const contentType = IMAGE_TYPES[ext];
    if (!contentType) return corsResponse({ error: 'Зөвхөн зураг (jpg, png, webp, gif, avif) зөвшөөрнө' }, 400);

    const maxBytes = folder === 'avatars' ? 2 * 1024 * 1024 : 20 * 1024 * 1024;
    if (file.size > maxBytes) return corsResponse({ error: `Файл хэт том (дээд тал ${maxBytes / 1024 / 1024}MB)` }, 413);

    // Avatar нь хэрэглэгч бүрт тогтмол key-тэй — дахин upload хийхэд дарж бичнэ (storage хязгааргүй өсөхгүй).
    // ?v= нь CDN cache-ийг шинэчилнэ.
    const key = folder === 'avatars'
        ? `avatars/${payload.sub}.${ext}`
        : `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const arrayBuf  = await file.arrayBuffer();

    await env.BUCKET.put(key, arrayBuf, {
        httpMetadata: { contentType },
    });

    const version = folder === 'avatars' ? `?v=${Date.now()}` : '';
    return corsResponse({ publicUrl: `${env.R2_PUBLIC_URL}/${key}${version}`, key });
}

// UTF-8 аюулгүй base64 — btoa() кирилл нэртэй файл дээр алдаа заадаг
function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
}

// Stream HLS/DASH URL-аас 32 тэмдэгттэй video UID гаргана
function streamUidFromUrl(url) {
    if (typeof url !== 'string') return null;
    const m = url.match(/(?:cloudflarestream\.com|videodelivery\.net)\/([a-f0-9]{32})\//i);
    return m ? m[1] : null;
}

// ── Stream signed URL ────────────────────────────────────────────
// Хэрэглэгч тухайн ангийг үзэх эрхтэй эсэхийг get_movie_episodes-ээр шалгаад
// 6 цагийн хугацаатай token олгоно. requireSignedURLs идэвхтэй видеог token-гүй үзэх боломжгүй.
async function handleStreamToken(request, env) {
    if (!env.STREAM_API_TOKEN || !env.CF_ACCOUNT_ID) {
        return corsResponse({ error: 'Stream тохируулаагүй' }, 500);
    }
    const { movieId, file } = await request.json();
    const uid = streamUidFromUrl(file);
    if (!movieId || !uid) return corsResponse({ error: 'movieId, file шаардлагатай' }, 400);

    const auth = request.headers.get('Authorization') || '';
    const rpcRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/get_movie_episodes`, {
        method: 'POST',
        headers: {
            'apikey': env.SUPABASE_ANON_KEY,
            'Authorization': auth.startsWith('Bearer ') ? auth : `Bearer ${env.SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_movie_id: movieId }),
    });
    if (!rpcRes.ok) return forbidden();
    const episodes = await rpcRes.json();
    if (!Array.isArray(episodes) || !episodes.some(ep => streamUidFromUrl(ep?.file) === uid)) {
        return forbidden();
    }

    const tokRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/${uid}/token`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.STREAM_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 6 * 60 * 60 }),
        }
    );
    if (!tokRes.ok) {
        console.error('Stream token error:', tokRes.status, await tokRes.text());
        return corsResponse({ error: 'Stream token үүсгэж чадсангүй' }, 502);
    }
    const token = (await tokRes.json()).result?.token;
    if (!token) return corsResponse({ error: 'Stream token хоосон' }, 502);

    return corsResponse({ url: file.replace(uid, token) });
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
                // requiresignedurls — видеог зөвхөн /stream/token-ий signed URL-аар үзнэ
                'Upload-Metadata': `name ${utf8ToBase64(filename)},requiresignedurls`,
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