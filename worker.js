var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

var worker_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return corsResponse(null, 204);
    }
    const url = new URL(request.url);

    // Нэвтрээгүй хэрэглэгч ч үнэгүй кино үзнэ — эрхийг get_movie_episodes / HLS токен шалгана
    try {
      if (url.pathname === "/stream/token") return await handleStreamToken(request, env);
      if (url.pathname === "/hls/token")    return await handleHlsToken(request, env, url);
      if (url.pathname.startsWith("/hls/upload/") && request.method === "PUT") return await handleHlsUpload(request, env, url);
      if (url.pathname.startsWith("/hls/") && (request.method === "GET" || request.method === "HEAD")) {
        return await handleHlsFile(request, env, url);
      }
    } catch (err) {
      console.error(err);
      return corsResponse({ error: err.message || "Internal server error" }, 500);
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

      // Имэйл зөвхөн админ, бусад нь зөвхөн админ эсвэл модератор
      const role = await getUserRole(env, payload);
      const isAdmin = role === "admin";
      const isStaff = role === "admin" || role === "moderator";

      if (url.pathname === "/email/send") {
        if (!isAdmin) return forbidden();
        return await handleEmail(request, env);
      }
      if (!isStaff) return forbidden();
      if (url.pathname === "/hls/check")                 return await handleHlsCheck(request, env);
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

// Хэрэглэгч (нэвтрээгүй ч байж болно) тухайн киноны энэ видеог үзэх эрхтэй эсэх.
// get_movie_episodes нь эрхгүй хэрэглэгчид хоосон жагсаалт буцаадаг — видео нь тэнд байвал эрхтэй.
async function userCanWatchFile(request, env, movieId, matches) {
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
    if (!rpcRes.ok) return false;
    const episodes = await rpcRes.json();
    return Array.isArray(episodes) && episodes.some(ep => matches(ep?.file));
}

// Stream HLS/DASH URL-аас 32 тэмдэгттэй video UID гаргана
function streamUidFromUrl(url) {
    if (typeof url !== 'string') return null;
    const m = url.match(/(?:cloudflarestream\.com|videodelivery\.net)\/([a-f0-9]{32})\//i);
    return m ? m[1] : null;
}

// ── Stream signed URL (хуучин Stream видеонуудад) ─────────────────
// 6 цагийн хугацаатай token олгоно. requireSignedURLs идэвхтэй видеог token-гүй үзэх боломжгүй.
async function handleStreamToken(request, env) {
    if (!env.STREAM_API_TOKEN || !env.CF_ACCOUNT_ID) {
        return corsResponse({ error: 'Stream тохируулаагүй' }, 500);
    }
    const { movieId, file } = await request.json();
    const uid = streamUidFromUrl(file);
    if (!movieId || !uid) return corsResponse({ error: 'movieId, file шаардлагатай' }, 400);
    if (!await userCanWatchFile(request, env, movieId, f => streamUidFromUrl(f) === uid)) return forbidden();

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

// ── R2 HLS ───────────────────────────────────────────────────────
// Видео нь HLS_BUCKET (нийтэд нээлттэй БИШ) дотор hls/<хавтас>/ доор хадгалагдана:
//   master.m3u8, stream_720p.m3u8, stream_480p.m3u8, 720p_0000.ts ...  (tools/hls-upload.ps1 бэлдэнэ)
// Киноны episodes[].file нь "hls:<хавтас>" хэлбэртэй.
// Тоглуулахад: /hls/token → 6 цагийн HMAC токен → файл бүр (?t=токен) шалгагдаж R2-аас уншигдана.
const HLS_TOKEN_TTL = 4 * 60 * 60;

// Хулгайгаар татахаас сэргийлэх:
//  1) Токен нь үзэгчийн IP сүлжээнд (IPv4 /24, IPv6 /64) уягдана — линкийг хуулж
//     татагч сайт/өөр хүнд өгөхөд тэдний IP өөр тул 403 болно.
//  2) Өөр вэбсайтаас (Origin) ирсэн хүсэлтийг хориглоно — татагч өргөтгөл, хуулбар сайт.
const HLS_ALLOWED_ORIGINS = [
    /^https:\/\/(www\.)?goykino\.uk$/,
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];

function originAllowed(request) {
    const origin = request.headers.get('Origin');
    if (!origin) return true; // Safari-ийн native тоглуулагч Origin илгээдэггүй
    return HLS_ALLOWED_ORIGINS.some(re => re.test(origin));
}

// Үзэгчийн сүлжээ: утас Wi-Fi/дата хооронд шилжихэд жижиг өөрчлөлтийг тэсвэрлэнэ
function clientNet(request) {
    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (ip.includes(':')) {
        const [head, tail = ''] = ip.split('::');
        const h = head ? head.split(':') : [];
        const t = tail ? tail.split(':') : [];
        const full = ip.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h;
        return full.slice(0, 4).map(x => parseInt(x || '0', 16).toString(16)).join(':') + '::/64';
    }
    const p = ip.split('.');
    return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.0/24` : ip;
}
const HLS_FOLDER_RE = /^[A-Za-z0-9_-]{1,64}$/;
const HLS_TYPES = {
    m3u8: 'application/vnd.apple.mpegurl',
    ts:   'video/mp2t',
    m4s:  'video/iso.segment',
    mp4:  'video/mp4',
    aac:  'audio/aac',
    vtt:  'text/vtt',
};

function hlsFolderFromFile(file) {
    if (typeof file !== 'string' || !file.startsWith('hls:')) return null;
    const folder = file.slice(4);
    return HLS_FOLDER_RE.test(folder) ? folder : null;
}

async function hmacHex(secret, data) {
    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
    return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function makeHlsToken(env, folder, net) {
    const exp = Math.floor(Date.now() / 1000) + HLS_TOKEN_TTL;
    return `${exp}.${await hmacHex(env.HLS_SIGNING_KEY, `${folder}.${exp}.${net}`)}`;
}

// Хугацааны ялгаагаар таахаас сэргийлж бүх тэмдэгтийг харьцуулна
function safeEqual(a, b) {
    a = String(a || ''); b = String(b || '');
    if (!a || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

async function verifyHlsToken(env, folder, token, net) {
    const [expStr, sig] = String(token || '').split('.');
    const exp = Number(expStr);
    if (!exp || !sig || exp < Date.now() / 1000) return false;
    return safeEqual(await hmacHex(env.HLS_SIGNING_KEY, `${folder}.${exp}.${net}`), sig);
}

function hlsConfigured(env) {
    return !!(env.HLS_BUCKET && env.HLS_SIGNING_KEY);
}

// POST /hls/token { movieId, file: "hls:<хавтас>" } → { url: ".../hls/<хавтас>/master.m3u8?t=..." }
async function handleHlsToken(request, env, url) {
    if (!hlsConfigured(env)) return corsResponse({ error: 'HLS тохируулаагүй' }, 500);
    if (!originAllowed(request)) return forbidden();
    const { movieId, file } = await request.json();
    const folder = hlsFolderFromFile(file);
    if (!movieId || !folder) return corsResponse({ error: 'movieId, file шаардлагатай' }, 400);
    if (!await userCanWatchFile(request, env, movieId, f => f === file)) return forbidden();

    const token = await makeHlsToken(env, folder, clientNet(request));
    return corsResponse({ url: `${url.origin}/hls/${folder}/master.m3u8?t=${token}` });
}

function hlsHeaders(contentType, cacheControl) {
    return {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'Access-Control-Allow-Origin': '*',
    };
}

// URI-д токен залгана (плейлист доторх сегмент/дэд плейлист бүр шалгагдана)
function withHlsToken(uri, token) {
    if (/^[a-z]+:/i.test(uri)) return uri; // гадны бүтэн URL-д хүрэхгүй
    return `${uri}${uri.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}`;
}

// GET /hls/<хавтас>/<файл>?t=<токен>
async function handleHlsFile(request, env, url) {
    if (!hlsConfigured(env)) return new Response('HLS тохируулаагүй', { status: 500, headers: hlsHeaders('text/plain', 'no-store') });
    const m = url.pathname.match(/^\/hls\/([A-Za-z0-9_-]{1,64})\/([A-Za-z0-9_.\/-]{1,200})$/);
    if (!m || m[2].includes('..')) return new Response('Not found', { status: 404, headers: hlsHeaders('text/plain', 'no-store') });
    const [, folder, rest] = m;
    const token = url.searchParams.get('t');
    if (!originAllowed(request) || !await verifyHlsToken(env, folder, token, clientNet(request))) {
        return new Response('Forbidden', { status: 403, headers: hlsHeaders('text/plain', 'no-store') });
    }

    const obj = await env.HLS_BUCKET.get(`hls/${folder}/${rest}`);
    if (!obj) return new Response('Not found', { status: 404, headers: hlsHeaders('text/plain', 'no-store') });

    const ext = rest.split('.').pop().toLowerCase();
    if (ext === 'm3u8') {
        const text = (await obj.text()).split('\n').map(line => {
            const l = line.trim();
            if (!l) return line;
            if (l.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${withHlsToken(uri, token)}"`);
            return withHlsToken(l, token);
        }).join('\n');
        return new Response(text, { headers: hlsHeaders(HLS_TYPES.m3u8, 'private, max-age=60') });
    }
    // Сегментүүд өөрчлөгддөггүй — хөтөч дээр кэшлэнэ
    return new Response(obj.body, { headers: hlsHeaders(HLS_TYPES[ext] || 'application/octet-stream', 'private, max-age=86400') });
}

// PUT /hls/upload/<хавтас>/<файл> — tools/hls-upload.ps1 видеоны хэсгүүдийг R2 руу хуулна.
// "X-Upload-Key" толгой нь HLS_UPLOAD_KEY нууц түлхүүртэй таарах ёстой (админы компьютер дээр tools/upload-key.txt).
const HLS_UPLOAD_MAX = 50 * 1024 * 1024;

async function handleHlsUpload(request, env, url) {
    if (!hlsConfigured(env) || !env.HLS_UPLOAD_KEY) return corsResponse({ error: 'HLS upload тохируулаагүй' }, 500);
    // trim — `wrangler secret put` stdin-ээр төгсгөлийн мөр шилжүүлэлт хадгалагдаж болдог
    if (!safeEqual(String(request.headers.get('X-Upload-Key') || '').trim(), String(env.HLS_UPLOAD_KEY).trim())) return forbidden();

    const m = url.pathname.match(/^\/hls\/upload\/([A-Za-z0-9_-]{1,64})\/([A-Za-z0-9_-]{1,80}\.(m3u8|ts))$/);
    if (!m) return corsResponse({ error: 'Буруу файлын нэр (зөвхөн .m3u8, .ts)' }, 400);
    const [, folder, name, ext] = m;

    const body = await request.arrayBuffer();
    if (!body.byteLength) return corsResponse({ error: 'Хоосон файл' }, 400);
    if (body.byteLength > HLS_UPLOAD_MAX) return corsResponse({ error: 'Файл хэт том (50MB хүртэл)' }, 413);

    await env.HLS_BUCKET.put(`hls/${folder}/${name}`, body, { httpMetadata: { contentType: HLS_TYPES[ext] } });
    return corsResponse({ ok: true, key: `hls/${folder}/${name}`, size: body.byteLength });
}

// POST /hls/check { folder } — админ: R2 дээр master.m3u8 байгаа эсэх
async function handleHlsCheck(request, env) {
    if (!hlsConfigured(env)) return corsResponse({ error: 'HLS тохируулаагүй' }, 500);
    const { folder } = await request.json();
    if (!HLS_FOLDER_RE.test(folder || '')) return corsResponse({ error: 'Буруу хавтасны нэр' }, 400);
    const head = await env.HLS_BUCKET.head(`hls/${folder}/master.m3u8`);
    return corsResponse({ exists: !!head, uploaded: head?.uploaded || null });
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