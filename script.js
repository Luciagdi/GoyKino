// ===== SUPABASE ТОХИРГОО =====
// SUPABASE_URL, SUPABASE_ANON_KEY, WORKER_URL, WORKER_SECRET, R2_PUBLIC_URL → config.js-с авна
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== ДОТООД ӨГӨГДЛИЙН ХАДГАЛАЛТ =====
let movies = [];
let users = [];
let requests = [];
let currentUser = JSON.parse(sessionStorage.getItem('nova_current_user')) || null;
let currentSelectedMovieId = null;
let tempSelectedAvatarUrl = '';
let currentActiveCategory = 'all';
let tempSelectedVideoFile = '';   // R2 public URL болно
let tempSelectedCoverFile = '';   // R2 public URL болно
let tempSelectedEpThumb = '';     // R2 public URL болно
let adminSelectedSeriesId = null;
let adminEditingMovieId = null;
let adminActiveTab = 'moviesTab';
let confirmCallback = null;

// ===== UTILITY: DEBOUNCE =====
function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ===== UTILITY: XSS ХАМГААЛАЛТ =====
// innerHTML-д хэрэглэгчийн оруулсан утгыг шууд оруулахгүйн тулд
// тусгай тэмдэгтүүдийг HTML entity болгон хөрвүүлнэ
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// javascript: болон data: URL-ийг блоклодог аюулгүй URL шалгагч
function safeUrl(url) {
    if (!url) return '#';
    const lower = url.trim().toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('data:')) return '#';
    return url;
}

// ===== ШУГАМАН ДҮРС ТЭМДЭГ (Lucide загвар, MIT) =====
// <i class="lc" data-icon="house"></i> → нимгэн шугаман SVG. Өнгө нь текстийн өнгийг (currentColor) дагана.
const LC_ICONS = {
    house:  '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    crown:  '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
    'user-cog': '<circle cx="18" cy="15" r="3"/><circle cx="9" cy="7" r="4"/><path d="M10 15H6a4 4 0 0 0-4 4v2"/><path d="m21.7 16.4-.9-.3"/><path d="m15.2 13.9-.9-.3"/><path d="m16.6 18.7.3-.9"/><path d="m19.1 12.2.3-.9"/><path d="m19.6 18.7-.4-1"/><path d="m16.8 12.3-.4-1"/><path d="m14.3 16.6 1-.4"/><path d="m20.7 13.8 1-.4"/>',
    'pen-line': '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>',
    'shield-check': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    bell:   '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
    menu:   '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'chevron-left':  '<path d="m15 18-6-6 6-6"/>',
    key:    '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
};

function lcSvg(name) {
    return `<svg class="lc" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LC_ICONS[name] || ''}</svg>`;
}

function renderIcons(root = document) {
    root.querySelectorAll('i.lc[data-icon]').forEach(el => {
        if (LC_ICONS[el.dataset.icon]) el.outerHTML = lcSvg(el.dataset.icon);
    });
}
renderIcons();

// HTML attribute (src="...", href="...") дотор оруулах URL — safeUrl + escape.
// escape хийхгүй бол `x" onerror="...` гэсэн avatar/cover attribute-аас гарч XSS болно.
function attrUrl(url) {
    return escapeHtml(safeUrl(url));
}

// ===== APP ЭХЛҮҮЛЭХ =====
window.onload = async function () {
    showLoading('Платформ ачааллаж байна...');

    const bankNumEl  = document.getElementById('khanBankNum');
    const bankNameEl = document.getElementById('bankNameDisplay');
    if (bankNumEl)  bankNumEl.textContent  = BANK_ACCOUNT;
    if (bankNameEl) bankNameEl.textContent = `Банк: ${BANK_NAME}\nХүлээн авагч: ${BANK_OWNER}`;

    let overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.id = 'sidebarOverlay';
    overlay.onclick = closeSidebar;
    document.body.appendChild(overlay);

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        const { data: profile } = await supabaseClient
            .from('profile')
            .select('*')
            .eq('id', session.user.id)
            .single();
        if (profile) {
            currentUser = profile;
            sessionStorage.setItem('nova_current_user', JSON.stringify(currentUser));
        }
    }

    supabaseClient.auth.onAuthStateChange((event, _session) => {
        if (event === 'PASSWORD_RECOVERY') {
            openPasswordResetModal();
        }
    });

    // PKCE flow: URL-д ?code= байвал session солиод PASSWORD_RECOVERY modal нээнэ
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const type = urlParams.get('type');
    if (code && type === 'recovery') {
        supabaseClient.auth.exchangeCodeForSession(code).then(({ error }) => {
            if (!error) openPasswordResetModal();
        });
    }

    await loadInitialDataFromSupabase();
    checkAuthUI();
    updateRequestBadge();
    showPage('homePage');
    hideLoading();

    setupRealtime();
    loadNotifications();
};

// ===== REALTIME =====
// Нэвтрэх/гарах бүрт дахин дуудна — өмнө нь зөвхөн хуудас ачаалахад үүсдэг байсан тул
// login хийсний дараа refresh хийх хүртэл VIP sync, админы мэдэгдэл ажилладаггүй байв.
function setupRealtime() {
    supabaseClient.removeAllChannels();
    if (!currentUser) return;

    // ── Хэрэглэгчийн профайл real-time шинэчлэлт ──────────────────
    // Admin approve хийхэд хэрэглэгч хуудсаа refresh хийхгүйгээр VIP болно
    supabaseClient
        .channel('profile-vip-sync')
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'profile', filter: `id=eq.${currentUser.id}` },
            async (payload) => {
                const updated = payload.new;
                if (!updated || !currentUser) return;
                const wasVip = isVipActive(currentUser);
                currentUser.vipExpires   = updated.vipExpires   ?? currentUser.vipExpires;
                currentUser.role         = updated.role         ?? currentUser.role;
                currentUser.rentedMovies = updated.rentedMovies ?? currentUser.rentedMovies;
                sessionStorage.setItem('nova_current_user', JSON.stringify(currentUser));
                checkAuthUI();
                if (!wasVip && isVipActive(currentUser)) showToast('🎉 VIP эрх амжилттай нээгдлээ!');
                loadNotifications();
                // Хэрэглэгч кино хуудсанд байвал товчуудыг шинэчилнэ
                if (currentSelectedMovieId) {
                    let m = movies.find(mv => mv.id === currentSelectedMovieId);
                    if (m) {
                        // Эрх нээгдсэн бол ангиудыг server-ээс дахин татна
                        m.episodes = await fetchEpisodes(m.id);
                        renderMovieActionButtons(m);
                    }
                }
            }
        )
        .subscribe();

    // ── Өөрийн хүсэлтийн төлөв өөрчлөгдөхөд 🔔 шинэчилнэ (татгалзсан ч мэдэгдэнэ)
    supabaseClient
        .channel('my-requests-sync')
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'requests', filter: `userId=eq.${currentUser.id}` },
            () => loadNotifications()
        )
        .subscribe();

    // ── Admin Realtime sync ──────────────────────────────────────
    // Admin байвал requests шинэчлэлтийг real-time сонсоно
    if (currentUser.role !== 'admin') return;
    supabaseClient
        .channel('admin-requests-sync')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'requests' },
            (payload) => {
                if (!requests.find(r => r.id === payload.new.id)) {
                    requests.push(payload.new);
                    updateRequestBadge();
                    showToast('📬 Шинэ хүсэлт ирлээ!');
                    if (adminActiveTab === 'requestsTab') renderAdminRequests();
                }
            }
        )
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'requests' },
            (payload) => {
                // Нөгөө admin баталгаажуулсан/татгалзсан эсвэл алдааны улмаас pending болгож буцаасан
                let idx = requests.findIndex(r => r.id === payload.new.id);
                if (idx !== -1) requests[idx] = payload.new;
                else if (payload.new.status === 'pending') requests.push(payload.new);
                updateRequestBadge();
                if (adminActiveTab === 'requestsTab') renderAdminRequests();
            }
        )
        .subscribe();
}

// ===== НҮҮР ХУУДАС =====
// Дараалал: 1 том баннер → 2 Үргэлжлүүлэн үзэх → 3 Шинэ → 4 зар → 5 Trending (TOP 10) → 6 AI → 7 Орчин үеийн → 8 Түүхэн

// Админы оруулсан баннерууд (supabase: banners). Хүснэгт байхгүй бол хоосон — hero нь кинонуудаас бүрдэнэ.
let banners = [];

async function loadBanners() {
    const { data, error } = await supabaseClient
        .from('banners').select('*').order('position').order('id');
    if (error) {
        console.warn('Баннер татах алдаа (security.sql ажиллуулсан эсэхийг шалгана уу):', error.message);
        banners = [];
        return;
    }
    banners = data || [];
}

// ── 1. Том баннер (hero) ─────────────────────────────────────────
let carouselIndex = 0;
let carouselAutoTimer = null;
let heroSlides = [];

function renderCarousel() {
    let hero   = document.getElementById('homeCarousel');
    let track  = document.getElementById('carouselTrack');
    let dotsEl = document.getElementById('carouselDots');
    if (!hero || !track || !dotsEl) return;

    let heroBanners = banners.filter(b => b.kind === 'hero').slice(0, 6);
    heroSlides = heroBanners.length > 0
        ? heroBanners.map(b => ({ image: b.image, movieId: b.movie_id, link: b.link, movie: movies.find(m => m.id === b.movie_id) }))
        : movies.filter(m => m.cover && (m.isTrending || m.isNew)).slice(0, 6).map(m => ({ image: m.cover, movieId: m.id, movie: m }));

    if (heroSlides.length === 0) { hero.classList.add('hidden'); return; }
    hero.classList.remove('hidden');

    track.innerHTML = heroSlides.map((s, i) => {
        let m = s.movie;
        let info = '';
        if (m) {
            let meta = [];
            if (m.rating != null && m.rating !== '') meta.push(`<span class="hero-star"><i class="fas fa-star"></i> ${Number(m.rating).toFixed(1)}</span>`);
            if (m.year) meta.push(`<span>${escapeHtml(m.year)}</span>`);
            info = `
                <div class="hero-info">
                    <h2 class="hero-title">${escapeHtml(m.title)}</h2>
                    <div class="hero-meta">
                        <span class="hero-tag ${m.price === 0 ? 'free' : ''}">${m.price === 0 ? 'Үнэгүй' : 'VIP'}</span>
                        ${meta.join('<span class="hero-sep"></span>')}
                    </div>
                </div>`;
        }
        return `
            <div class="hero-slide" onclick="openHeroSlide(${i})">
                <img class="hero-img" src="${attrUrl(s.image)}" alt="" draggable="false">
                <div class="hero-shade"></div>
                ${info}
            </div>`;
    }).join('');

    dotsEl.innerHTML = heroSlides.map((_, i) =>
        `<span class="hero-dot ${i === 0 ? 'active' : ''}" onclick="event.stopPropagation();carouselGoTo(${i})"></span>`
    ).join('');

    carouselIndex = 0;
    updateCarouselPosition();
    startCarouselAuto(heroSlides.length);
}

function openHeroSlide(i) {
    let s = heroSlides[i];
    if (!s) return;
    if (s.movieId) return showMovieProfile(s.movieId);
    if (s.link && /^https?:\/\//i.test(s.link)) window.open(s.link, '_blank', 'noopener,noreferrer');
}

function updateCarouselPosition() {
    let track = document.getElementById('carouselTrack');
    if (track) track.style.transform = `translateX(-${carouselIndex * 100}%)`;
    document.querySelectorAll('.hero-dot').forEach((d, i) => d.classList.toggle('active', i === carouselIndex));
}

function carouselMove(dir) {
    if (!heroSlides.length) return;
    carouselIndex = (carouselIndex + dir + heroSlides.length) % heroSlides.length;
    updateCarouselPosition();
    startCarouselAuto(heroSlides.length);
}

function carouselGoTo(idx) {
    carouselIndex = idx;
    updateCarouselPosition();
    startCarouselAuto(heroSlides.length);
}

function startCarouselAuto(len) {
    if (carouselAutoTimer) clearInterval(carouselAutoTimer);
    if (len < 2) return;
    carouselAutoTimer = setInterval(() => {
        carouselIndex = (carouselIndex + 1) % len;
        updateCarouselPosition();
    }, 5000);
}

// Баннерыг хуруугаар (эсвэл хулганаар) хажуу тийш гүйлгэнэ
(function setupHeroSwipe() {
    let hero = document.getElementById('homeCarousel');
    if (!hero) return;
    let startX = null, swiped = false;
    hero.addEventListener('pointerdown', e => { startX = e.clientX; swiped = false; });
    hero.addEventListener('pointerup', e => {
        if (startX === null) return;
        let dx = e.clientX - startX;
        startX = null;
        if (Math.abs(dx) > 40) { swiped = true; carouselMove(dx < 0 ? 1 : -1); }
    });
    hero.addEventListener('pointercancel', () => { startX = null; });
    hero.addEventListener('click', e => {
        if (swiped) { e.stopPropagation(); e.preventDefault(); swiped = false; }
    }, true);
})();

// ── 2. Үргэлжлүүлэн үзэх — сүүлд үзсэн анги, секундыг энэ төхөөрөмж дээр хадгална ──
function progressKey() {
    return 'goykino_progress_' + (currentUser?.id || 'guest');
}

function readProgress() {
    try { return JSON.parse(localStorage.getItem(progressKey()) || '{}'); }
    catch (_) { return {}; }
}

function saveProgress(movieId, ep, t, d) {
    if (!movieId || !ep) return;
    try {
        let all = readProgress();
        all[movieId] = { ep, t: Math.floor(t || 0), d: Math.floor(d || 0), at: Date.now() };
        localStorage.setItem(progressKey(), JSON.stringify(all));
    } catch (_) { /* хадгалж чадахгүй бол зүгээр л "Үргэлжлүүлэн үзэх"-д гарахгүй */ }
}

// playEpisode тоглуулж буй ангийг энд тэмдэглэнэ; 5 секунд тутамд байрлалыг хадгална
let nowPlayingInfo = null;
let lastProgressSave = 0;

(function setupProgressTracking() {
    let video = document.getElementById('myVideo');
    if (!video) return;
    video.addEventListener('timeupdate', () => {
        if (!nowPlayingInfo || Date.now() - lastProgressSave < 5000) return;
        lastProgressSave = Date.now();
        saveProgress(nowPlayingInfo.movieId, nowPlayingInfo.ep, video.currentTime, video.duration);
    });
    ['pause', 'ended'].forEach(ev => video.addEventListener(ev, () => {
        if (nowPlayingInfo && video.currentTime > 0) {
            saveProgress(nowPlayingInfo.movieId, nowPlayingInfo.ep, video.currentTime, video.duration);
        }
    }));
})();

// "Үргэлжлүүлэн үзэх" карт дарахад — кино нээгээд сүүлд үзсэн анги, секундээс нь тоглуулна
async function resumeMovie(id) {
    await showMovieProfile(id);
    let p = readProgress()[id];
    let m = movies.find(mv => mv.id === id);
    if (!p || !m) return;
    let ep = (m.episodes || []).find(e => e.num === p.ep);
    if (!ep) return; // эрх дууссан эсвэл анги устсан — кино хуудас нээгдсэн хэвээр үлдэнэ
    await playEpisode(ep.num, ep.file, ep.title || `${ep.num}-р анги`);
    let video = document.getElementById('myVideo');
    let seek = () => { if (p.t > 5 && (!p.d || p.t < p.d - 10)) video.currentTime = p.t; };
    if (video.readyState >= 1) seek(); else video.addEventListener('loadedmetadata', seek, { once: true });
}

// ── Картууд ─────────────────────────────────────────────────────
function homeCard(m, opts = {}) {
    let cover = attrUrl(m.cover || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300');
    let badge = m.price === 0 ? '<span class="hc-badge free">Үнэгүй</span>' : '<span class="hc-badge">VIP</span>';
    let label = opts.label || '';
    let bar   = opts.progress != null
        ? `<span class="hc-progress"><span style="width:${Math.min(100, Math.max(3, opts.progress))}%"></span></span>` : '';
    let click = opts.resume ? `resumeMovie(${m.id})` : `showMovieProfile(${m.id})`;
    return `
        <div class="hc-card" onclick="${click}">
            <div class="hc-cover">
                <img src="${cover}" alt="${escapeHtml(m.title)}" loading="lazy" draggable="false">
                ${badge}
                ${label ? `<span class="hc-label">${escapeHtml(label)}</span>` : ''}
                ${bar}
            </div>
            <div class="hc-title">${escapeHtml(m.title)}</div>
        </div>`;
}

// Trending — "TOP 1" том тоо + доор нь өнгөт хэсэгт нэр, анги
const TREND_TINTS = ['#2b1a3a', '#1f1c46', '#16263f', '#2a1f2e', '#1b2a33'];

function trendCard(m, rank) {
    let cover = attrUrl(m.cover || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300');
    let tint  = TREND_TINTS[(rank - 1) % TREND_TINTS.length];
    let sub   = categoryLabel(m.category);
    return `
        <div class="hc-card hc-trend" style="--tint:${tint}" onclick="showMovieProfile(${m.id})">
            <div class="hc-cover">
                <img src="${cover}" alt="${escapeHtml(m.title)}" loading="lazy" draggable="false">
                ${m.price === 0 ? '<span class="hc-badge free">Үнэгүй</span>' : '<span class="hc-badge">VIP</span>'}
                <span class="hc-rank">TOP ${rank}</span>
            </div>
            <div class="hc-trend-info">
                <div class="hc-trend-title">${escapeHtml(m.title)}</div>
                <div class="hc-trend-sub">${escapeHtml(sub)}</div>
            </div>
        </div>`;
}

function homeSection(title, cardsHtml, moreAction) {
    let more = moreAction
        ? `<button class="home-sec-more" onclick="${moreAction}" aria-label="Бүгдийг үзэх">${lcSvg('chevron-right')}</button>` : '';
    return `
        <div class="home-sec">
            <div class="home-sec-head"><h3>${title}</h3>${more}</div>
            <div class="home-row">${cardsHtml}</div>
        </div>`;
}

function adBannerHtml() {
    let ad = banners.find(b => b.kind === 'ad');
    if (!ad) return '';
    return `
        <div class="home-ad" onclick="openAdBanner(${ad.id})">
            <img src="${attrUrl(ad.image)}" alt="" loading="lazy" draggable="false">
        </div>`;
}

function openAdBanner(id) {
    let ad = banners.find(b => b.id === id);
    if (!ad) return;
    if (ad.movie_id) return showMovieProfile(ad.movie_id);
    if (ad.link && /^https?:\/\//i.test(ad.link)) window.open(ad.link, '_blank', 'noopener,noreferrer');
}

// "›" — тухайн төрлөөр шүүсэн "Бүх кино" хуудас
function openCategory(cat) {
    currentActiveCategory = cat;
    showPage('allMoviesPage');
}

// Admin үйлдлийн дараа олон удаа дуудагддаг тул debounce ашиглана
const renderHomeMovies = debounce(function _renderHomeMovies() {
    let box = document.getElementById('homeSections');
    if (!box) return;
    let html = '';

    // 2. Үргэлжлүүлэн үзэх
    let progress = readProgress();
    let continueList = Object.entries(progress)
        .sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
        .map(([id, p]) => ({ m: movies.find(mv => mv.id === Number(id)), p }))
        .filter(x => x.m)
        .slice(0, 12);
    if (continueList.length) {
        html += homeSection('Үргэлжлүүлэн үзэх', continueList.map(({ m, p }) =>
            homeCard(m, { resume: true, progress: p.d ? (p.t / p.d) * 100 : null })).join(''));
    }

    // 3. Шинэ
    let newest = [...movies].sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, 15);
    if (newest.length) html += homeSection('Шинэ', newest.map(m => homeCard(m)).join(''), "openCategory('all')");

    // 4. Зар
    html += adBannerHtml();

    // 5. Trending — үзэлтээрээ эхний 10
    let trending = [...movies].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 10);
    if (trending.length) html += homeSection('Trending', trending.map((m, i) => trendCard(m, i + 1)).join(''));

    // 6-8. Төрлүүд
    [['ai', 'AI'], ['modern', 'Орчин үеийн'], ['historical', 'Түүхэн']].forEach(([cat, title]) => {
        let list = movies.filter(m => m.category === cat).sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, 15);
        if (list.length) html += homeSection(title, list.map(m => homeCard(m)).join(''), `openCategory('${cat}')`);
    });

    box.innerHTML = html || '<p class="pf-empty">Контент байхгүй байна.</p>';
    renderCarousel();
}, 200);

// Debounce + server-side хайлт: 400ms хүлээсний дараа Supabase .ilike() хайна
const searchMoviesHome = debounce(async function () {
    let val      = document.getElementById('mainMovieSearchInput').value.trim();
    let results  = document.getElementById('homeSearchResults');
    let sections = [document.getElementById('homeCarousel'), document.getElementById('homeSections')];

    // Хоосон бол анхны байдалд буцаана
    if (!val) {
        results.classList.add('hidden');
        sections.forEach(el => el && el.classList.remove('hidden'));
        renderHomeMovies();
        return;
    }

    // Хайлт header-т байгаа тул өөр хуудаснаас хайвал үр дүнг нүүр хуудсанд харуулна
    let homePage = document.getElementById('homePage');
    if (homePage && homePage.classList.contains('hidden')) showPage('homePage');

    // Server-side хайлт — ачааллагдаагүй кинонуудаас ч хайна
    // episodes (видео линк) татахгүй — зөвхөн жагсаалтын баганууд
    const { data, error } = await supabaseClient
        .from('movies')
        .select(MOVIE_LIST_COLUMNS)
        .ilike('title', `%${val}%`)
        .limit(50);

    if (error) {
        console.warn('Хайлтын алдаа:', error.message);
        return;
    }

    sections.forEach(el => el && el.classList.add('hidden'));
    results.classList.remove('hidden');
    document.getElementById('homeSearchTitle').innerText = `"${val}" — ${(data || []).length} үр дүн`;
    document.getElementById('homeSearchGrid').innerHTML = (data || []).length
        ? data.map(createMovieCard).join('')
        : '<p style="color:var(--text-muted);">Үр дүн олдсонгүй.</p>';
}, 400);

// ===== САНАЛ БОЛГОХ КИНО =====
function renderRecommendedMovies(currentId) {
    let container = document.getElementById('recommendedMoviesList');
    if (!container) return;
    let recs = movies.filter(m => m.id !== currentId).slice(0, 12);
    if (recs.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">Санал болгох кино байхгүй.</p>';
        return;
    }
    // Жижиг poster картууд — хажуу тийш гүйлгэнэ
    container.innerHTML = recs.map(m => {
        let cover = attrUrl(m.cover || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300');
        let price = m.price === 0
            ? '<span class="rec-card-tag free">Үнэгүй</span>'
            : `<span class="rec-card-tag">${m.price.toLocaleString()} ₮</span>`;
        return `
            <div class="rec-card" onclick="showMovieProfile(${m.id})">
                <div class="rec-card-cover">
                    <img src="${cover}" alt="${escapeHtml(m.title)}" loading="lazy" draggable="false">
                    ${price}
                </div>
                <div class="rec-card-title">${escapeHtml(m.title)}</div>
            </div>
        `;
    }).join('');
    container.scrollLeft = 0;
}

// Компьютер дээр хулганаар чирж хажуу тийш гүйлгэнэ (утсан дээр хуруугаар шууд гүйлгэнэ).
// Нэг удаа document дээр бүртгэнэ — дараа нь үүссэн мөрүүд (нүүр хуудасны хэсгүүд) ч ажиллана.
// Чирсний дараах click-ийг киног нээхгүйн тулд таслана.
const DRAG_SCROLL_SELECTOR = '.rec-row, .home-row, .category-filter-container';

(function setupDragScroll() {
    let el = null, startX = 0, startScroll = 0, moved = false;
    document.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'mouse') return;
        el = e.target.closest(DRAG_SCROLL_SELECTOR);
        if (!el) return;
        moved = false;
        startX = e.clientX;
        startScroll = el.scrollLeft;
    });
    window.addEventListener('pointermove', e => {
        if (!el) return;
        let dx = e.clientX - startX;
        if (Math.abs(dx) > 5) { moved = true; el.classList.add('dragging'); }
        el.scrollLeft = startScroll - dx;
    });
    window.addEventListener('pointerup', () => {
        if (el) el.classList.remove('dragging');
        el = null;
    });
    document.addEventListener('click', e => {
        if (moved && e.target.closest(DRAG_SCROLL_SELECTOR)) { e.stopPropagation(); e.preventDefault(); }
        moved = false;
    }, true);
})();

// ===== МОДЕРАТОР ТАБ =====
function switchModTab(tabId) {
    document.querySelectorAll('#modPage .admin-tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('#modPage .admin-tabs-nav button').forEach(b => b.classList.remove('active'));
    let tab = document.getElementById(tabId);
    if (tab) tab.classList.remove('hidden');
    let btnMap = { modAddMovieTab: 'btn-mod-tab-add', modAddEpTab: 'btn-mod-tab-ep' };
    let btn = document.getElementById(btnMap[tabId]);
    if (btn) btn.classList.add('active');
    if (tabId === 'modAddEpTab') populateModEpMovieSelect();
}

function populateModEpMovieSelect() {
    let sel = document.getElementById('modEpMovieSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Кино сонгох --</option>' +
        movies.map(m => `<option value="${m.id}">${escapeHtml(m.title)} (${escapeHtml(m.code)})</option>`).join('');
}

async function submitModEpisodeRequest() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'moderator')) {
        return showToast('Зөвхөн модератор эсвэл админ хүсэлт гаргах боломжтой!', 'error');
    }
    let movieId = parseInt(document.getElementById('modEpMovieSelect').value);
    let epNum = parseInt(document.getElementById('modEpNumber').value);
    let epTitle = document.getElementById('modEpTitle').value.trim();
    let videoUrl = document.getElementById('modEpVideoUrl').value.trim();

    if (!movieId) return showToast('Кино сонгоно уу!', 'error');
    if (!epNum) return showToast('Ангийн дугаар оруулна уу!', 'error');
    if (!videoUrl) return showToast('Видео URL оруулна уу!', 'error');

    let m = movies.find(mv => mv.id === movieId);
    if (!m) return;

    let newRequest = {
        type: 'EPISODE_ADD',
        movieId, movieTitle: m.title, movieCode: m.code,
        epNum, epTitle: epTitle || `${epNum}-р анги`, videoUrl,
        senderName: currentUser.name, senderId: currentUser.id,
        status: 'pending', createdAt: new Date().toISOString()
    };

    // DB-д insert амжилтгүй бол амжилттай гэж хэлэхгүй
    const { data: inserted, error } = await supabaseClient
        .from('requests').insert({ ...newRequest }).select().single();
    if (error || !inserted) {
        console.error('Supabase request insert алдаа:', error);
        return showToast('Хүсэлт илгээж чадсангүй: ' + (error?.message || 'тодорхойгүй'), 'error');
    }

    requests.push(inserted);
    updateRequestBadge();

    document.getElementById('modEpNumber').value = '';
    document.getElementById('modEpTitle').value = '';
    document.getElementById('modEpVideoUrl').value = '';
    showToast('Анги нэмэх хүсэлт амжилттай илгээгдлээ!');
}

// ЗАСАЛ 3: Байхгүй байсан функц нэмэгдлээ
async function submitModRequest() {
    if (!await verifyIsAdminOrMod()) return;

    let title    = document.getElementById('modReqTitle').value.trim();
    let code     = document.getElementById('modReqCode').value.trim().toUpperCase();
    let desc     = document.getElementById('modReqDesc').value.trim();
    let category = document.getElementById('modReqCategory').value;
    let movieStatus = document.getElementById('modReqStatus').value;
    let price    = parseInt(document.getElementById('modReqPrice').value) || 0;

    if (!title || !code) return showToast('Нэр болон код заавал шаардлагатай!', 'error');
    if (movies.some(m => m.code === code))
        return showToast('Энэ код аль хэдийн бүртгэлтэй байна!', 'error');

    let newRequest = {
        type: 'MOVIE_ADD',
        title, code, desc, category, movieStatus, price,
        senderName: currentUser.name, senderId: currentUser.id,
        status: 'pending', createdAt: new Date().toISOString()
    };

    // DB-д insert амжилтгүй бол амжилттай гэж хэлэхгүй
    const { data: inserted, error } = await supabaseClient
        .from('requests').insert({ ...newRequest }).select().single();
    if (error || !inserted) {
        console.error('Supabase request insert алдаа:', error);
        return showToast('Хүсэлт илгээж чадсангүй: ' + (error?.message || 'тодорхойгүй'), 'error');
    }

    requests.push(inserted);
    updateRequestBadge();

    ['modReqTitle','modReqCode','modReqDesc'].forEach(id => {
        let el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('modReqPrice').value = '0';
    showToast('✅ Кино нэмэх хүсэлт амжилттай илгээгдлээ!');
}

// ===== АЮУЛГҮЙ БАЙДАЛ: SERVER-SIDE ROLE ШАЛГАЛТ =====
// sessionStorage-ийн role-д найдахгүй — Supabase DB-аас шууд авна
async function verifyIsAdmin() {
    if (!currentUser) return false;
    const { data, error } = await supabaseClient
        .from('profile').select('role').eq('id', currentUser.id).single();
    if (error || data?.role !== 'admin') {
        showToast('⛔ Таны эрх хүрэлцэхгүй байна!', 'error');
        return false;
    }
    return true;
}

async function verifyIsAdminOrMod() {
    if (!currentUser) return false;
    const { data, error } = await supabaseClient
        .from('profile').select('role').eq('id', currentUser.id).single();
    if (error || !['admin', 'moderator'].includes(data?.role)) {
        showToast('⛔ Таны эрх хүрэлцэхгүй байна!', 'error');
        return false;
    }
    return true;
}

// ЗАСАЛ 5: saveData → updateLocalState гэж нэрлэж, хийдэг зүйлээ тодорхой болголоо
// Supabase-д юу ч бичдэггүй — зөвхөн local array болон sessionStorage шинэчилнэ
function updateLocalState() {
    if (currentUser) {
        let idx = users.findIndex(u => u.id === currentUser.id);
        if (idx !== -1) users[idx] = currentUser;
        sessionStorage.setItem('nova_current_user', JSON.stringify(currentUser));
    }
}

// ===== ХУУДАС ШИЛЖИЛТ =====
function showPage(pageId) {
    document.querySelectorAll('.page-section').forEach(p => p.classList.add('hidden'));
    let target = document.getElementById(pageId);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.nav-menu a').forEach(a => a.classList.remove('active'));

    let navMap = {
        homePage: 'nav-home', allMoviesPage: 'nav-allMovies',
        vipPage: 'nav-vip', profilePage: 'nav-profile',
        adminPage: 'nav-admin', modPage: 'nav-modPanel', profileListPage: 'nav-profile'
    };
    let navEl = document.getElementById(navMap[pageId]);
    if (navEl) navEl.classList.add('active');

    if (pageId === 'homePage') renderHomeMovies();
    if (pageId === 'allMoviesPage') renderAllMoviesPage();
    if (pageId === 'vipPage') renderVipPlans();
    if (pageId === 'profilePage') {
        // Хуудас нээхэд Supabase-аас шинэ өгөгдөл татна — sessionStorage хуучирсан байж болно
        if (currentUser && currentUser.id) {
            supabaseClient.from('profile').select('*').eq('id', currentUser.id).single()
                .then(({ data: fresh, error }) => {
                    if (error) {
                        // 400/406 алдаа гарвал sessionStorage-ийн өгөгдлөөр л харуулна
                        console.warn('Profile refresh алдаа:', error.message);
                    } else if (fresh) {
                        currentUser = fresh;
                        sessionStorage.setItem('nova_current_user', JSON.stringify(currentUser));
                    }
                    renderUserProfile();
                });
        } else {
            renderUserProfile();
        }
    }
    if (pageId === 'adminPage') initAdminPanel();

    if (window.innerWidth <= 768) closeSidebar();
    window.scrollTo(0, 0);
    updateHeaderStyle();
}

// ===== HEADER: кино хуудасны cover дээр тунгалаг, бусад үед шилэн (glass) =====
function updateHeaderStyle() {
    let header = document.getElementById('mainHeader');
    let moviePage = document.getElementById('movieProfilePage');
    if (!header || !moviePage) return;
    let overHero = !moviePage.classList.contains('hidden') && window.scrollY < 60;
    header.classList.toggle('header-transparent', overHero);
}
window.addEventListener('scroll', updateHeaderStyle, { passive: true });

// ===== УТСАН ДЭЭРХ ХАЙЛТ — 🔍 дарахад header дээгүүр нээгдэнэ =====
function openHeaderSearch() {
    document.getElementById('mainHeader').classList.add('search-open');
    document.getElementById('mainMovieSearchInput').focus();
}

function closeHeaderSearch() {
    document.getElementById('mainHeader').classList.remove('search-open');
}

function toggleSidebar() {
    let sidebar = document.getElementById('appSidebar');
    let overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
}

function closeSidebar() {
    let sidebar = document.getElementById('appSidebar');
    let overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
}

// ===== AUTH UI =====
function checkAuthUI() {
    const authBtn = document.getElementById('authBtnContainer');
    const userBox = document.getElementById('topUserAvatarBox');

    ['nav-profile', 'nav-admin', 'nav-modPanel'].forEach(id => {
        let el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    // 🔔 зөвхөн нэвтэрсэн хэрэглэгчид
    let bellWrap = document.getElementById('headerBellWrap');
    if (bellWrap) bellWrap.classList.toggle('hidden', !currentUser);

    if (currentUser) {
        if (authBtn) authBtn.classList.add('hidden');
        if (userBox) userBox.classList.remove('hidden');
        document.getElementById('topUsername').innerText = currentUser.name;
        document.getElementById('topUserImg').src = currentUser.avatar || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';

        let navProfile = document.getElementById('nav-profile');
        if (navProfile) navProfile.classList.remove('hidden');

        if (currentUser.role === 'admin') {
            let navAdmin = document.getElementById('nav-admin');
            if (navAdmin) navAdmin.classList.remove('hidden');
        } else if (currentUser.role === 'moderator') {
            let navMod = document.getElementById('nav-modPanel');
            if (navMod) navMod.classList.remove('hidden');
        }
    } else {
        if (authBtn) authBtn.classList.remove('hidden');
        if (userBox) userBox.classList.add('hidden');
    }
}

// ===== МОДАЛ =====
function openModal(modalId) {
    let modal = document.getElementById(modalId);
    if (modal) { modal.style.display = 'flex'; modal.classList.remove('hidden'); }
}

function closeModal(modalId) {
    let modal = document.getElementById(modalId);
    if (modal) { modal.style.display = 'none'; modal.classList.add('hidden'); }
}

function switchForm(formId) {
    ['loginForm', 'registerForm'].forEach(f => {
        let el = document.getElementById(f);
        if (el) el.classList.add('hidden');
    });
    let target = document.getElementById(formId);
    if (target) target.classList.remove('hidden');
}

// ===== CUSTOM CONFIRM =====
function showConfirm(message, onConfirm, title = 'Итгэлтэй байна уу?', btnText = 'Тийм, устгах') {
    document.getElementById('confirmTitle').innerText = title;
    document.getElementById('confirmMessage').innerText = message;
    document.getElementById('confirmYesBtn').innerText = btnText;
    confirmCallback = onConfirm;
    openModal('confirmModal');
}

function confirmYes() {
    closeModal('confirmModal');
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
}

function closeConfirmModal() {
    closeModal('confirmModal');
    confirmCallback = null;
}

// ===== НЭВТРЭХ =====
async function loginLogic() {
    let email = document.getElementById('loginEmail').value.trim();
    let pass = document.getElementById('loginPass').value;
    if (!email || !pass) return showToast('Имэйл болон нууц үгээ оруулна уу!', 'error');

    showLoading('Нэвтэрч байна...');
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
    if (error) { hideLoading(); return showToast('Имэйл эсвэл нууц үг буруу байна!', 'error'); }

    const { data: profile, error: profileErr } = await supabaseClient
        .from('profile').select('*').eq('id', data.user.id).single();
    if (profileErr || !profile) { hideLoading(); return showToast('Профайл олдсонгүй!', 'error'); }

    currentUser = profile;
    sessionStorage.setItem('nova_current_user', JSON.stringify(currentUser));
    await loadPendingRequests();
    updateRequestBadge();
    setupRealtime();
    loadNotifications();
    hideLoading();
    closeModal('loginModal');
    checkAuthUI();
    showPage('homePage');
    showToast(`Тавтай морил, ${currentUser.name}! 👋`);
}

// ===== БҮРТГҮҮЛЭХ =====
async function registerLogic() {
    let name  = document.getElementById('regName').value.trim();
    let phone = document.getElementById('regPhone').value.trim();
    let email = document.getElementById('regEmail').value.trim();
    let pass  = document.getElementById('regPass').value;

    if (!name || !phone || !email || !pass)
        return showToast('Бүх талбарыг бөглөнө үү!', 'error');
    if (pass.length < 6)
        return showToast('Нууц үг дор хаяж 6 тэмдэгт байх ёстой!', 'error');

    showLoading('Бүртгэж байна...');

    // profile хүснэгт бусдад уншигдахгүй (RLS) тул бүртгэлтэй эсэхийг signUp-ийн хариугаар шалгана
    // name/phone-ийг metadata-д дамжуулна — signup trigger profile үүсгэхдээ ашиглаж болно
    const { data, error } = await supabaseClient.auth.signUp({
        email, password: pass, options: { data: { name, phone } }
    });
    if (error) {
        hideLoading();
        // Зөвхөн "бүртгэлтэй" алдаанд тэгж хэлнэ — rate limit, сул нууц үг зэрэгт жинхэнэ шалтгааныг харуулна
        const alreadyExists = /already|registered|exists/i.test(error.message);
        return showToast(alreadyExists
            ? 'Энэ имэйл аль хэдийн бүртгэлтэй байна. Нэвтэрнэ үү!'
            : 'Бүртгэл амжилтгүй: ' + error.message, 'error');
    }
    // Бүртгэлтэй имэйлд Supabase identities хоосон user буцаадаг
    if (!data?.user || data.user.identities?.length === 0) {
        hideLoading();
        return showToast('Энэ имэйл аль хэдийн бүртгэлтэй байна. Нэвтэрнэ үү!', 'error');
    }
    // Имэйл баталгаажуулалт асаалттай бол session байхгүй — profile-д бичих эрх ч байхгүй
    if (!data.session) {
        hideLoading();
        closeModal('loginModal');
        return showToast('Имэйл рүү тань баталгаажуулах линк илгээлээ. Баталгаажуулсны дараа нэвтэрнэ үү.');
    }

    // Trigger profile үүсгэдэг тул хэсэг хүлээгээд profile уншина
    await new Promise(r => setTimeout(r, 1000));

    const { data: profile } = await supabaseClient
        .from('profile').select('*').eq('id', data.user.id).single();

    let newUser = profile || {
        id: data.user.id, name, phone, email, role: 'user',
        vipExpires: null, rentedMovies: [], history: [],
        avatar: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
    };

    // Trigger profile үүсгээгүй бол гараар нэмнэ
    const { error: profileErr } = !profile
        ? await supabaseClient.from('profile').upsert(newUser)
        // Trigger үүсгэсэн profile-д name, phone шинэчилнэ
        : await supabaseClient.from('profile').update({ name, phone }).eq('id', data.user.id);
    if (profileErr) {
        console.error('Profile хадгалах алдаа:', profileErr);
        hideLoading();
        return showToast('Профайл үүсгэхэд алдаа: ' + profileErr.message, 'error');
    }
    newUser.name  = name;
    newUser.phone = phone;

    users.push(newUser);
    currentUser = newUser;
    sessionStorage.setItem('nova_current_user', JSON.stringify(currentUser));
    updateLocalState();
    setupRealtime();
    loadNotifications();
    hideLoading();
    closeModal('loginModal');
    checkAuthUI();
    showPage('homePage');
    showToast('Бүртгэл амжилттай үүслээ! 🎉');
}

// ===== ГАРАХ =====
async function logout() {
    supabaseClient.removeAllChannels();
    await supabaseClient.auth.signOut();
    currentUser = null;
    requests = [];
    myNotifications = [];
    document.getElementById('notifPanel')?.classList.add('hidden');
    sessionStorage.removeItem('nova_current_user');
    checkAuthUI();
    showPage('homePage');
}

// ===== LOADING =====
function showLoading(text = 'Ачааллаж байна...') {
    let el  = document.getElementById('loadingOverlay');
    let txt = document.getElementById('loadingText');
    if (el) el.classList.add('active');
    if (txt) txt.innerText = text;
}

function hideLoading() {
    let el = document.getElementById('loadingOverlay');
    if (el) el.classList.remove('active');
}

// ===== TOAST =====
function showToast(message, type = 'success') {
    let existing = document.getElementById('toastBox');
    if (existing) existing.remove();

    let toast = document.createElement('div');
    toast.id = 'toastBox';
    toast.style.cssText = `
        position:fixed;bottom:30px;right:20px;z-index:9999;
        background:#101424;border:1px solid ${type === 'error' ? 'rgba(239,68,68,0.5)' : '#1c2031'};
        color:#f5f7fb;padding:14px 20px;border-radius:12px;
        font-size:14px;font-weight:600;max-width:320px;
        box-shadow:0 10px 30px rgba(0,0,0,0.5);
        animation:slideIn 0.3s ease;
    `;
    // escapeHtml — message нь хэрэглэгчийн нэр зэрэг гадны өгөгдөл агуулж болно
    toast.innerHTML = `<i class="fas fa-${type === 'error' ? 'times-circle' : 'check-circle'}" style="color:${type === 'error' ? '#ef4444' : '#00c388'};margin-right:6px;"></i>${escapeHtml(message)}`;
    document.body.appendChild(toast);

    let style = document.createElement('style');
    style.textContent = '@keyframes slideIn{from{opacity:0;transform:translateX(100px);}to{opacity:1;transform:translateX(0);}}';
    document.head.appendChild(style);

    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3500);
}

// ===== КИНО КАРТ =====
function createMovieCard(m) {
    let badge = m.price > 0
        ? `<div class="badge-vip-card">${m.price.toLocaleString()} ₮</div>`
        : `<div class="badge-vip-card" style="background:#00c388;">Үнэгүй</div>`;
    let cover = attrUrl(m.cover || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400');
    return `
        <div class="movie-card" onclick="showMovieProfile(${m.id})">
            ${badge}
            <img class="card-cover" src="${cover}" alt="${escapeHtml(m.title)}" loading="lazy">
            <div class="card-info">
                <div class="card-title">${escapeHtml(m.title)}</div>
                <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-top:4px;">
                    <span class="badge">${escapeHtml(categoryLabel(m.category))}</span>
                </div>
            </div>
        </div>
    `;
}

// "Романтик, Түүхэн" → ['Романтик', 'Түүхэн']
function movieGenres(m) {
    return (m.genres || '').split(',').map(g => g.trim()).filter(Boolean);
}

// Киноны төрөл (movies.category). web/drama нь хуучин өгөгдөл — засах хүртэл зөвхөн "Бүгд"-д харагдана.
const CATEGORY_LABELS = { modern: 'Орчин үеийн', historical: 'Түүхэн', ai: 'AI', web: 'Вэбтун', drama: 'Цуврал' };
const CATEGORY_FILTERS = ['modern', 'historical', 'ai'];

function categoryLabel(cat) {
    return CATEGORY_LABELS[cat] || cat || '';
}

function movieMatchesCategory(m, cat) {
    return cat === 'all' || m.category === cat;
}

// Бүгд | Орчин үеийн | Түүхэн | AI
function renderCategoryFilters() {
    let box = document.getElementById('categoryFilters');
    if (!box) return;
    let cats = [{ cat: 'all', label: 'Бүгд' }, ...CATEGORY_FILTERS.map(c => ({ cat: c, label: CATEGORY_LABELS[c] }))];
    // Дахин зурахад гүйлгэсэн байрлал алдагдахгүй
    let scroll = box.scrollLeft;
    box.innerHTML = cats.map(c => `
        <button class="filter-btn ${c.cat === currentActiveCategory ? 'active' : ''}"
            data-cat="${escapeHtml(c.cat)}" onclick="filterCategory(this.dataset.cat, this)">${escapeHtml(c.label)}</button>`).join('');
    box.scrollLeft = scroll;
}

function renderAllMoviesPage() {
    let grid = document.getElementById('grid-all-movies');
    if (!grid) return;
    renderCategoryFilters();
    let filtered = movies.filter(m => movieMatchesCategory(m, currentActiveCategory));

    // hasMoreMovies flag-аар Load More товч харуулах эсэхийг шийдэнэ
    let loadMoreBtn = hasMoreMovies
        ? `<div style="grid-column:1/-1;text-align:center;margin-top:10px;">
               <button class="btn-main" onclick="loadMoreMovies()" style="padding:12px 30px;">
                   <i class="fas fa-plus"></i> Цаашид үзэх
               </button>
           </div>`
        : '';

    grid.innerHTML = filtered.length > 0
        ? filtered.map(createMovieCard).join('') + loadMoreBtn
        : '<p style="color:var(--text-muted);">Энэ ангилалд одоогоор контент байхгүй байна.</p>';
}

function filterCategory(cat, element) {
    currentActiveCategory = cat;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    if (element) element.classList.add('active');
    renderAllMoviesPage();
}

// ===== КИНО ДЭЛГЭРЭНГҮЙ =====
const MOVIE_BASE_COLUMNS = 'id, title, desc, code, category, status, cover, price, views, isTrending, isNew';
// episode_count багана supabase/security.sql-ээр нэмэгдэнэ. Байхгүй бол loadInitialDataFromSupabase
// MOVIE_BASE_COLUMNS руу буцна.
let MOVIE_LIST_COLUMNS = MOVIE_BASE_COLUMNS + ', episode_count, year, duration, rating, translator, genres';

function episodeCount(m) {
    return m.episode_count ?? (m.episodes ? m.episodes.length : 0);
}

// Анги нэмэх/устгахыг server талд atomic хийнэ (add_movie_episode / remove_movie_episode RPC).
// Шинэ ангиудын жагсаалтыг буцаана, алдаа гарвал throw хийнэ.
async function addEpisodeAtomic(movieId, episode) {
    const { data, error } = await supabaseClient.rpc('add_movie_episode', { p_movie_id: movieId, p_episode: episode });
    if (error) throw new Error(error.message);
    return data || [];
}

async function removeEpisodeAtomic(movieId, epNum) {
    const { data, error } = await supabaseClient.rpc('remove_movie_episode', { p_movie_id: movieId, p_num: epNum });
    if (error) throw new Error(error.message);
    return data || [];
}

// Ангиудыг server талд эрх шалгадаг get_movie_episodes RPC-ээр татна.
// Эрхгүй хэрэглэгчид хоосон жагсаалт ирнэ (supabase/security.sql-ийг үзнэ үү).
async function fetchEpisodes(movieId) {
    const { data, error } = await supabaseClient.rpc('get_movie_episodes', { p_movie_id: movieId });
    if (!error) return data || [];
    // RPC хараахан үүсээгүй (security.sql ажиллуулаагүй) бол хуучин аргаар татна
    if (error.code === 'PGRST202') {
        console.warn('get_movie_episodes RPC байхгүй — supabase/security.sql-ийг ажиллуулна уу.');
        const { data: fullMovie } = await supabaseClient
            .from('movies').select('episodes').eq('id', movieId).single();
        return fullMovie?.episodes || [];
    }
    console.error('Анги татах алдаа:', error);
    return [];
}

async function showMovieProfile(id) {
    let m = movies.find(mv => mv.id === id);
    if (!m) {
        // Хайлтаар олдсон, гэхдээ эхний 100-д ороогүй кино
        const { data: fetched } = await supabaseClient
            .from('movies').select(MOVIE_LIST_COLUMNS).eq('id', id).maybeSingle();
        if (!fetched) return;
        movies.push(fetched);
        m = fetched;
    }
    currentSelectedMovieId = id;

    // Ангиудыг байнга шинээр татна — нэвтрэх/VIP болох үед эрх өөрчлөгддөг
    showLoading('Кино мэдээлэл татаж байна...');
    m.episodes = await fetchEpisodes(id);
    hideLoading();

    // ЗАСАЛ 2: Atomic increment — race condition байхгүй
    // Нэг session-д нэг кино 1 удаа л тоологдоно — хуудас дахин нээх бүрт үзэлт өсөхгүй
    if (markViewedThisSession(id)) {
        supabaseClient.rpc('increment_views', { movie_id: id }).then(({ error }) => {
            if (error) console.warn('increment_views RPC алдаа:', error.message);
        });
        m.views = (m.views || 0) + 1; // UI-д шууд харуулах
    }

    if (currentUser) {
        if (!currentUser.history) currentUser.history = [];
        currentUser.history = currentUser.history.filter(hid => hid !== id);
        currentUser.history.unshift(id);
        if (currentUser.history.length > 8) currentUser.history = currentUser.history.slice(0, 8);
        // ЗАСАЛ 5: Үзсэн түүхийг Supabase-д хадгална — өөр төхөөрөмжид ч харагдана
        supabaseClient.from('profile')
            .update({ history: currentUser.history })
            .eq('id', currentUser.id)
            .then(({ error }) => { if (error) console.error('History update алдаа:', error); });
    }
    updateLocalState();

    document.getElementById('mProfTitle').innerText = m.title;
    document.getElementById('mProfDesc').innerText  = m.desc || '';
    renderMovieInfo(m);
    updateSaveButton();

    // Hero: арын бүдгэрүүлсэн давхарга + үндсэн cover (доод сүүдрийг CSS ::after хийнэ)
    let cover = attrUrl(m.cover || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800');
    document.getElementById('mProfCoverContainer').innerHTML =
        `<img class="mp-hero-bg" src="${cover}" alt="" aria-hidden="true">` +
        `<img class="mp-hero-img" src="${cover}" alt="${escapeHtml(m.title)}">`;

    closeVideoPlayer();
    renderMovieActionButtons(m);
    showPage('movieProfilePage');
    updateMovieDescToggle();
    renderRecommendedMovies(id);
}

// ===== ❤️ ХАДГАЛАХ — poster-ийн баруун дээд буланд =====
// profile.saved (кино id-ийн жагсаалт) — өөр төхөөрөмжөөс нэвтэрсэн ч хадгалагдсан хэвээр
function isMovieSaved(movieId) {
    return !!currentUser && (currentUser.saved || []).includes(movieId);
}

function updateSaveButton() {
    let btn = document.getElementById('mProfSaveBtn');
    if (!btn) return;
    let saved = isMovieSaved(currentSelectedMovieId);
    btn.classList.toggle('saved', saved);
    btn.innerHTML = `<i class="${saved ? 'fas' : 'far'} fa-heart"></i>`;
    btn.title = saved ? 'Хадгалснаас хасах' : 'Хадгалах';
}

async function toggleSaveMovie() {
    if (!currentUser) return openModal('loginModal');
    let id = currentSelectedMovieId;
    if (!id) return;

    let wasSaved = isMovieSaved(id);
    let saved = wasSaved
        ? (currentUser.saved || []).filter(sid => sid !== id)
        : [id, ...(currentUser.saved || [])];

    const { error } = await supabaseClient.from('profile').update({ saved }).eq('id', currentUser.id);
    if (error) {
        console.error('Хадгалах алдаа:', error);
        return showToast('Хадгалж чадсангүй: ' + error.message, 'error');
    }
    currentUser.saved = saved;
    updateLocalState();
    updateSaveButton();
    showToast(wasSaved ? 'Хадгалснаас хаслаа' : '❤️ Хадгаллаа — Профайл хэсгээс харна');
}

// 125 → "2 цаг 5 мин", 45 → "45 мин"
function formatDuration(minutes) {
    let h = Math.floor(minutes / 60), min = minutes % 60;
    if (!h) return `${min} мин`;
    return min ? `${h} цаг ${min} мин` : `${h} цаг`;
}

// Нэрийн доорх мөр: он | хугацаа | ⭐ үнэлгээ/10 | 👁 үзэлт | орчуулагч (байхгүйг нь алгасна)
function renderMovieInfo(m) {
    let parts = [];
    if (m.year)     parts.push(`<span>${escapeHtml(m.year)}</span>`);
    if (m.duration) parts.push(`<span>${formatDuration(Number(m.duration))}</span>`);
    if (m.rating != null && m.rating !== '') {
        parts.push(`<span class="mp-rating"><i class="fas fa-star"></i> ${Number(m.rating).toFixed(1)}<small>/10</small></span>`);
    }
    parts.push(`<span><i class="far fa-eye"></i> ${(m.views || 0).toLocaleString()}</span>`);
    // Орчуулагч тусдаа мөрөнд — урт нэр мөрийг таслахад "|" үлдэхгүй
    let translator = m.translator
        ? `<div class="mp-info-sub"><span class="mp-info-label">Орчуулагч</span> ${escapeHtml(m.translator)}</div>`
        : '';
    // Ангилалууд — "Романтик, Түүхэн" → тус бүр тусдаа хайрцаг
    let genres = movieGenres(m);
    let tags = genres.length
        ? `<div class="mp-tags">${genres.map(g => `<span class="mp-tag">${escapeHtml(g)}</span>`).join('')}</div>`
        : '';
    document.getElementById('mProfInfo').innerHTML =
        `<div class="mp-info-row">${parts.join('<span class="mp-info-sep"></span>')}</div>${translator}${tags}`;
}

// Тайлбар 3 мөрөөс урт бол "Дэлгэрэнгүй" товч харуулна (хуудас харагдсаны дараа хэмжинэ)
function updateMovieDescToggle() {
    let desc = document.getElementById('mProfDescBox');
    let btn  = document.getElementById('mProfMoreBtn');
    if (!desc || !btn) return;
    desc.classList.remove('expanded');
    btn.classList.remove('expanded');
    btn.innerHTML = 'Дэлгэрэнгүй <i class="fas fa-chevron-down"></i>';
    requestAnimationFrame(() => {
        btn.classList.toggle('hidden', desc.scrollHeight <= desc.clientHeight + 2);
    });
}

function toggleMovieDesc() {
    let desc = document.getElementById('mProfDescBox');
    let btn  = document.getElementById('mProfMoreBtn');
    let expanded = desc.classList.toggle('expanded');
    btn.classList.toggle('expanded', expanded);
    btn.innerHTML = `${expanded ? 'Хураах' : 'Дэлгэрэнгүй'} <i class="fas fa-chevron-down"></i>`;
}

// "Үзэх" товч — эхний ангийг тоглуулна. Эрхгүй бол get_movie_episodes хоосон буцаадаг.
function playFirstEpisode() {
    let m = movies.find(mv => mv.id === currentSelectedMovieId);
    if (!m) return;
    let episodes = [...(m.episodes || [])].sort((a, b) => a.num - b.num);
    if (episodes.length > 0) {
        let first = episodes[0];
        return playEpisode(first.num, first.file, first.title || `${first.num}-р анги`);
    }
    if (m.price > 0 && !currentUser) return openModal('loginModal');
    if (!hasMovieAccess(m)) {
        document.getElementById('movieActionButtonsContainer').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return showToast('Үзэхийн тулд VIP авах эсвэл түрээслэнэ үү.', 'error');
    }
    showToast('Анги одоогоор оруулаагүй байна.', 'error');
}

// Энэ session-д анх удаа үзэж байвал true
function markViewedThisSession(movieId) {
    try {
        const viewed = JSON.parse(sessionStorage.getItem('goykino_viewed') || '[]');
        if (viewed.includes(movieId)) return false;
        viewed.push(movieId);
        sessionStorage.setItem('goykino_viewed', JSON.stringify(viewed));
    } catch (_) { /* sessionStorage хаалттай бол тоолсоор байна */ }
    return true;
}

function isVipActive(user) {
    if (!user || !user.vipExpires) return false;
    return Number(new Date(user.vipExpires)) > Date.now();
}

// 🔍 Admin debug хэрэгсэл — browser console-д дуудах: debugVipStatus()
window.debugVipStatus = async function() {
    if (!currentUser) { console.log('currentUser байхгүй'); return; }
    console.log('=== VIP DEBUG ===');
    console.log('Local currentUser:', {
        id: currentUser.id, role: currentUser.role,
        vipExpires: currentUser.vipExpires,
        vipExpiresDate: currentUser.vipExpires ? new Date(currentUser.vipExpires).toString() : 'байхгүй',
        isVipActive: isVipActive(currentUser)
    });
    const { data, error } = await supabaseClient.from('profile').select('id,role,vipExpires').eq('id', currentUser.id).single();
    console.log('Supabase DB өгөгдөл:', data, error ? 'АЛДАА:' + error.message : '');
    if (data) {
        console.log('DB vipExpires:', data.vipExpires, '→', data.vipExpires ? new Date(data.vipExpires).toString() : 'байхгүй');
        console.log('DB role:', data.role);
    }
    // pending хүсэлтүүд
    const { data: reqs } = await supabaseClient.from('requests').select('*').eq('userId', currentUser.id).order('id', {ascending:false}).limit(5);
    console.log('Сүүлийн 5 хүсэлт:', reqs);
    console.log('=================');
};

// Үзэх эрхтэй (үнэгүй / VIP / түрээсэлсэн / staff) бол нэг урт "▶ Үзэх" товч,
// эрхгүй бол хоёр тусдаа том товч: [🔑 үнэ — Түрээслэх] [👑 VIP]
function hasMovieAccess(m) {
    if (m.price === 0) return true;
    if (!currentUser) return false;
    return isVipActive(currentUser)
        || (currentUser.rentedMovies || []).includes(m.code)
        || ['admin', 'moderator'].includes(currentUser.role);
}

function renderMovieActionButtons(m) {
    let container = document.getElementById('movieActionButtonsContainer');
    let epBlock   = document.getElementById('episodesBlockContainer');

    if (hasMovieAccess(m)) {
        container.innerHTML = `<button class="mp-big-btn mp-btn-play" onclick="playFirstEpisode()"><i class="fas fa-play"></i> Үзэх</button>`;
        // Нэг ангитай кинонд "Бүх ангиуд" жагсаалт хэрэггүй — "▶ Үзэх" товч шууд тоглуулна
        if (epBlock) epBlock.classList.toggle('hidden', (m.episodes || []).length <= 1);
        renderEpisodesList(m.episodes);
        return;
    }

    // data-attribute ашиглан onclick-д шууд утга оруулахгүй (injection хамгаалалт).
    // Нэвтрээгүй бол rentMovieDirect нэвтрэх цонх нээнэ.
    container.innerHTML = `
        <button class="mp-big-btn mp-btn-rent" id="rentBtn" data-code="${escapeHtml(m.code)}" data-price="${m.price}">
            <i class="fas fa-key"></i> ${m.price.toLocaleString()} ₮ <span class="mp-btn-sub">Түрээслэх</span>
        </button>
        <button class="mp-big-btn mp-btn-vip" onclick="showPage('vipPage')"><i class="fas fa-crown"></i> VIP</button>
    `;
    document.getElementById('rentBtn').addEventListener('click', function () {
        rentMovieDirect(this.dataset.code, parseInt(this.dataset.price));
    });
    if (epBlock) epBlock.classList.add('hidden');
}

function renderEpisodesList(episodes) {
    let grid = document.getElementById('mProfEpisodesGrid');
    if (!grid) return;
    if (!episodes || episodes.length === 0) {
        grid.innerHTML = `<p style="color:var(--text-muted);font-size:12px;">Анги одоогоор оруулаагүй байна.</p>`;
        return;
    }
    let sorted = [...episodes].sort((a, b) => a.num - b.num);
    // ep.file болон ep.title-г onclick string-д шууд оруулахгүй —
    // data attribute ашиглан injection-оос хамгаалсан
    grid.innerHTML = sorted.map(ep => {
        let epLabel = ep.title || (ep.num + '-р анги');
        return `
            <button class="ep-btn" id="epBtn-${ep.num}"
                data-num="${ep.num}"
                data-file="${escapeHtml(ep.file || '')}"
                data-title="${escapeHtml(epLabel)}"
                onclick="playEpisodeFromBtn(this)">
                <i class="fas fa-play" style="font-size:10px;"></i><br>
                Анги ${ep.num}
                ${ep.title ? `<br><span style="font-size:10px;font-weight:400;color:var(--text-muted);">${escapeHtml(ep.title)}</span>` : ''}
            </button>
        `;
    }).join('');
}

// data attribute-аас утгыг аюулгүй унших wrapper
function playEpisodeFromBtn(btn) {
    playEpisode(
        parseInt(btn.dataset.num),
        btn.dataset.file,
        btn.dataset.title
    );
}

// ===== ВИДЕО ТОГЛУУЛАГЧ =====
// HLS instance глобалд хадгална — episode солихдоо destroy хийнэ
let hlsInstance = null;
// Анги солих/хаах бүрт нэмэгдэнэ — удаан ирсэн token хуучин ангийг тоглуулахгүй
let playEpisodeGen = 0;

// Cloudflare Stream видеонд Worker-ээс хугацаатай signed URL авна (requireSignedURLs).
// Амжилтгүй бол анхны URL-ыг буцаана — signed шаарддаг видео тэгвэл зүгээр л тоглохгүй.
async function getPlayableUrl(movieId, file) {
    if (!/(?:cloudflarestream\.com|videodelivery\.net)\/[a-f0-9]{32}\//i.test(file)) return file;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const headers = { 'Content-Type': 'application/json' };
        if (session) headers['Authorization'] = `Bearer ${session.access_token}`;
        const res = await fetch(WORKER_URL + '/stream/token', {
            method: 'POST', headers, body: JSON.stringify({ movieId, file }),
        });
        if (res.ok) {
            const { url } = await res.json();
            if (url) return url;
        }
        console.warn('Stream token авч чадсангүй:', res.status);
    } catch (err) {
        console.warn('Stream token алдаа:', err.message);
    }
    return file;
}

async function playEpisode(num, file, title) {
    let videoPlayerBox = document.getElementById('videoPlayerBox');
    let myVideo        = document.getElementById('myVideo');
    let nowPlaying     = document.getElementById('videoNowPlayingTitle');

    if (!file || file === 'undefined' || file === '') {
        showToast('Видео файл байхгүй байна.', 'error');
        return;
    }

    const gen = ++playEpisodeGen;
    file = await getPlayableUrl(currentSelectedMovieId, file);
    if (gen !== playEpisodeGen) return; // Энэ хооронд өөр анги сонгосон эсвэл хаасан
    nowPlayingInfo = { movieId: currentSelectedMovieId, ep: num };
    // Өөр анги эхэлбэл "Үргэлжлүүлэн үзэх"-д шууд гарна (ижил анги бол хадгалсан секунд хэвээр)
    if (readProgress()[currentSelectedMovieId]?.ep !== num) saveProgress(currentSelectedMovieId, num, 0, 0);

    // Өмнөх HLS instance байвал цэвэрлэнэ
    if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
    }

    if (videoPlayerBox && myVideo) {
        videoPlayerBox.classList.remove('hidden');

        const isHLS = file.includes('.m3u8');

        if (isHLS) {
            // ── HLS файл (.m3u8) ──────────────────────────────────
            if (Hls.isSupported()) {
                hlsInstance = new Hls({
                    maxBufferLength: 30,
                    maxMaxBufferLength: 60,
                    startLevel: -1,              // автомат чанар сонгоно
                    abrEwmaDefaultEstimate: 500000,
                });
                hlsInstance.loadSource(file);
                hlsInstance.attachMedia(myVideo);
                hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                    myVideo.play().catch(e => console.log('Autoplay:', e));
                });
                hlsInstance.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        showToast('Видео ачааллахад алдаа гарлаа.', 'error');
                        console.error('HLS алдаа:', data);
                    }
                });
            } else if (myVideo.canPlayType('application/vnd.apple.mpegurl')) {
                // Safari — native HLS дэмждэг
                myVideo.src = file;
                myVideo.load();
                myVideo.play().catch(e => console.log('Safari autoplay:', e));
            } else {
                showToast('Таны броузер энэ форматыг дэмжихгүй байна.', 'error');
                return;
            }
        } else {
            // ── MP4 файл (хуучин, ажиллаж л байна) ───────────────
            myVideo.src = file;
            myVideo.load();
            myVideo.play().catch(e => console.log('Автоматаар тоглуулж чадсангүй:', e));
        }

        if (nowPlaying) {
            nowPlaying.innerHTML = `<i class="fas fa-play-circle"></i> Анги ${num}${title ? ' - ' + escapeHtml(title) : ''} тоглуулж байна...`;
        }

        document.querySelectorAll('.ep-btn').forEach(btn => btn.classList.remove('active-ep'));
        let activeBtn = document.getElementById(`epBtn-${num}`);
        if (activeBtn) activeBtn.classList.add('active-ep');

        setTimeout(() => videoPlayerBox.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
}

function closeVideoPlayer() {
    let videoPlayerBox = document.getElementById('videoPlayerBox');
    let myVideo        = document.getElementById('myVideo');
    playEpisodeGen++;
    if (nowPlayingInfo && myVideo && myVideo.currentTime > 0) {
        saveProgress(nowPlayingInfo.movieId, nowPlayingInfo.ep, myVideo.currentTime, myVideo.duration);
    }
    nowPlayingInfo = null;

    // HLS instance цэвэрлэнэ
    if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
    }

    if (videoPlayerBox) videoPlayerBox.classList.add('hidden');
    if (myVideo) { myVideo.pause(); myVideo.src = ''; }
    document.querySelectorAll('.ep-btn').forEach(btn => btn.classList.remove('active-ep'));
}

function goBackToContent() {
    closeVideoPlayer();
    if (currentActiveCategory !== 'all') showPage('allMoviesPage');
    else showPage('homePage');
}

// ===== VIP =====
// Багцуудын цорын ганц эх сурвалж — карт, хоног, мэдэгдлийн нэр бүгд эндээс.
// Үнэ supabase/security.sql-ийн validate_payment_request-тэй ижил байх ёстой (server тэндээс тооцоолно).
const VIP_PLANS = [
    { code: 'VIP-1M',   title: '1 сарын эрх',  days: 30,    price: 6900,  icon: 'fa-bolt' },
    { code: 'VIP-3M',   title: '3 сарын эрх',  days: 90,    price: 16900, icon: 'fa-rocket' },
    { code: 'VIP-6M',   title: '6 сарын эрх',  days: 180,   price: 29900, icon: 'fa-crown' },
    { code: 'VIP-YEAR', title: '1 жилийн эрх', days: 365,   price: 49900, icon: 'fa-gem',      payRef: 'VIP-12M' },
    { code: 'VIP-LIFE', title: 'Хязгааргүй',   days: 36500, price: 99000, icon: 'fa-infinity', lifetime: true },
];

// Гүйлгээний утгад бичигдэх код (жишээ нь VIP-YEAR → VIP-12M)
function vipPayRef(code) {
    return VIP_PLANS.find(p => p.code === code)?.payRef || code;
}

function getVipDays(code) {
    return VIP_PLANS.find(p => p.code === code)?.days || 30;
}

let selectedVipCode = 'VIP-3M';

// Сарын багцтай харьцуулсан хямдрал (%)
function vipDiscountPercent(plan) {
    let monthly = VIP_PLANS[0];
    if (plan.lifetime || plan.code === monthly.code) return 0;
    let full = monthly.price * (plan.days / monthly.days);
    return Math.round((1 - plan.price / full) * 100);
}

function renderVipPlans() {
    let list = document.getElementById('vipPlanList');
    if (!list) return;
    list.innerHTML = VIP_PLANS.map(p => {
        let off = vipDiscountPercent(p);
        let perDay = p.lifetime ? 'Насан туршид' : `Өдөрт ₮${Math.round(p.price / p.days).toLocaleString()}`;
        let duration = p.lifetime ? 'Хугацаагүй эрх' : `${p.days} хоногийн эрх`;
        return `
            <button class="vip-plan ${p.code === selectedVipCode ? 'selected' : ''}" onclick="selectVipPlan('${p.code}')">
                <div class="vip-plan-top">
                    <div class="vip-plan-icon"><i class="fas ${p.icon}"></i></div>
                    <div class="vip-plan-info">
                        <div class="vip-plan-title">
                            <span>${p.title}</span>
                            ${off > 0 ? `<span class="vip-tag-off">-${off}%</span>` : ''}
                        </div>
                        <div class="vip-plan-sub">${duration}</div>
                    </div>
                </div>
                <div class="vip-plan-bottom">
                    <span class="vip-plan-price">₮${p.price.toLocaleString()}</span>
                    <span class="vip-plan-perday">${perDay}</span>
                </div>
            </button>`;
    }).join('');
    updateVipCheckoutBar();
}

function selectVipPlan(code) {
    selectedVipCode = code;
    renderVipPlans();
}

function updateVipCheckoutBar() {
    let p = VIP_PLANS.find(pl => pl.code === selectedVipCode);
    if (!p) return;
    document.getElementById('vipSelectedTitle').innerText = p.title;
    document.getElementById('vipSelectedPrice').innerText = `₮${p.price.toLocaleString()}`;
    document.getElementById('vipSelectedDays').innerText  = p.lifetime ? 'Хугацаагүй' : `${p.days} хоног`;
    document.getElementById('vipContinueBtn').innerText   = `Үргэлжлүүлэх (₮${p.price.toLocaleString()})`;
}

function continueVipPurchase() {
    let p = VIP_PLANS.find(pl => pl.code === selectedVipCode);
    if (p) buyVipPackageAction(p.title, p.price, p.code);
}

let activePaymentType = null;
let pendingCode  = '';
let pendingAmount = 0;

function setPaymentModalTitle(icon, text) {
    document.getElementById('payTitleIcon').innerHTML = lcSvg(icon);
    document.getElementById('payTitleText').innerText = text;
}

function buyVipPackageAction(name, price, code) {
    if (!currentUser) return openModal('loginModal');
    activePaymentType = 'VIP';
    pendingCode   = code;
    pendingAmount = price;
    setPaymentModalTitle('crown', 'Багц авах');
    document.getElementById('payAmount').innerText = `${price.toLocaleString()} ₮`;
    document.getElementById('payDetail').innerText = `${vipPayRef(code)}-${currentUser.phone}`;
    openModal('paymentModal');
}

function rentMovieDirect(movieCode, price) {
    if (!currentUser) return openModal('loginModal');
    activePaymentType = 'RENT';
    pendingCode   = movieCode;
    pendingAmount = price;
    setPaymentModalTitle('key', 'Кино түрээслэх');
    document.getElementById('payAmount').innerText = `${price.toLocaleString()} ₮`;
    document.getElementById('payDetail').innerText = `${movieCode}-${currentUser.phone}`;
    openModal('paymentModal');
}

function copyText(elementId) {
    let el = document.getElementById(elementId);
    if (!el) return;
    navigator.clipboard.writeText(el.innerText.trim())
        .then(() => showToast('Амжилттай хуулагдлаа!'))
        .catch(() => showToast('Хуулж чадсангүй.', 'error'));
}

async function confirmPaymentSubmit() {
    if (!currentUser) return openModal('loginModal');
    // amount, userEmail/Name/Phone-ийг server trigger (validate_payment_request) дахин тооцоолно
    let newRequest = {
        type: 'PAYMENT',
        paymentType: activePaymentType, code: pendingCode,
        amount: pendingAmount, userId: currentUser.id,
        userEmail: currentUser.email, userName: currentUser.name,
        userPhone: currentUser.phone,
        status: 'pending', createdAt: new Date().toISOString()
    };

    // Insert амжилтгүй бол "илгээгдлээ" гэж хэлэхгүй — хэрэглэгч мөнгө шилжүүлсэн байж болно
    const { data: inserted, error } = await supabaseClient
        .from('requests').insert({ ...newRequest }).select().single();
    if (error || !inserted) {
        console.error('Supabase request insert алдаа:', error);
        return showToast('Хүсэлт илгээж чадсангүй. Дахин оролдоно уу! ' + (error?.message || ''), 'error');
    }

    requests.push(inserted);

    closeModal('paymentModal');
    updateRequestBadge();
    loadNotifications();
    showToast('Төлбөрийн хүсэлт илгээгдлээ. Админ шалгаж эрхийг нээнэ.');
}

// ===== ПРОФАЙЛ =====
// Профайлын 3 жагсаалт — мөр болон "Бүгдийг үзэх" хуудас хоёулаа эндээс авна
const PROFILE_LISTS = {
    saved:   { title: 'Дуртай',       rowId: 'profileSavedGrid',
               get: () => (currentUser.saved || []).map(sid => movies.find(m => m.id === sid)).filter(Boolean),
               empty: 'Дуртай кино байхгүй. Кино хуудасны <i class="far fa-heart"></i> товчийг дарж нэмнэ.' },
    rented:  { title: 'Түрээсэлсэн',  rowId: 'profileRentedGrid',
               get: () => movies.filter(m => (currentUser.rentedMovies || []).includes(m.code)),
               empty: 'Түрээсэлсэн кино байхгүй.' },
    history: { title: 'Сүүлд үзсэн',  rowId: 'profileHistoryGrid',
               get: () => (currentUser.history || []).map(hid => movies.find(m => m.id === hid)).filter(Boolean),
               empty: 'Үзсэн түүх байхгүй.' },
};

function renderUserProfile() {
    if (!currentUser) return;
    document.getElementById('profileNameField').innerText = currentUser.name;
    document.getElementById('profileMainImg').src = currentUser.avatar || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';

    // "Таны эрх: 28 хоног" эсвэл "Эрх байхгүй" (дарахад VIP хуудас)
    let access = document.getElementById('profileAccess');
    if (isVipActive(currentUser)) {
        let daysLeft = Math.ceil((new Date(currentUser.vipExpires) - Date.now()) / (1000 * 60 * 60 * 24));
        access.innerHTML = `Таны эрх: <strong>${daysLeft > 9999 ? 'Хязгааргүй' : `${daysLeft} хоног`}</strong>`;
        access.classList.add('active');
        access.onclick = null;
    } else {
        access.innerHTML = 'Эрх байхгүй <span class="pf-access-link">VIP авах ›</span>';
        access.classList.remove('active');
        access.onclick = () => showPage('vipPage');
    }

    Object.values(PROFILE_LISTS).forEach(l => renderProfileRow(l.rowId, l.get(), l.empty));
}

// Жижиг poster картууд (санал болгох мөртэй ижил загвар)
function renderProfileRow(id, list, emptyHtml) {
    let row = document.getElementById(id);
    if (!row) return;
    let seeAll = document.querySelector(`.pf-see-all[data-target="${id}"]`);
    if (seeAll) seeAll.classList.toggle('hidden', list.length === 0);
    if (list.length === 0) {
        row.innerHTML = `<p class="pf-empty">${emptyHtml}</p>`;
        return;
    }
    row.innerHTML = list.map(m => {
        let cover = attrUrl(m.cover || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300');
        return `
            <div class="rec-card" onclick="showMovieProfile(${m.id})">
                <div class="rec-card-cover"><img src="${cover}" alt="${escapeHtml(m.title)}" loading="lazy" draggable="false"></div>
                <div class="rec-card-title">${escapeHtml(m.title)}</div>
            </div>`;
    }).join('');
}

// › дарахад — бүх киног нэг мөрөнд нэгээр жагсаана, ‹ товчоор профайл руу буцна
function openProfileList(key) {
    let cfg = PROFILE_LISTS[key];
    if (!cfg || !currentUser) return;
    let list = cfg.get();
    document.getElementById('profileListTitle').innerText = cfg.title;
    document.getElementById('profileListCount').innerText = list.length;
    document.getElementById('profileListItems').innerHTML = list.length === 0
        ? `<p class="pf-empty">${cfg.empty}</p>`
        : list.map(m => {
            let cover = attrUrl(m.cover || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=200');
            let meta = [categoryLabel(m.category)];
            meta.push(m.price === 0 ? 'Үнэгүй' : `${m.price.toLocaleString()} ₮`);
            return `
                <div class="pl-item" onclick="showMovieProfile(${m.id})">
                    <img class="pl-thumb" src="${cover}" alt="${escapeHtml(m.title)}" loading="lazy">
                    <div class="pl-info">
                        <div class="pl-name">${escapeHtml(m.title)}</div>
                        <div class="pl-sub">${escapeHtml(meta.filter(Boolean).join(' · '))}</div>
                    </div>
                    ${lcSvg('chevron-right')}
                </div>`;
        }).join('');
    showPage('profileListPage');
}

// Avatar дээр дарж шууд солих — R2-д upload хийгээд profile.avatar-ыг шинэчилнэ
async function changeAvatarDirect(event) {
    let file = event.target.files[0];
    event.target.value = '';
    if (!file || !currentUser) return;
    if (file.size > 2 * 1024 * 1024) return showToast('Зураг 2MB-аас бага байх ёстой!', 'error');

    showLoading('Зураг солиж байна...');
    try {
        let url = await uploadSingle(file, 'avatars');
        const { error } = await supabaseClient.from('profile').update({ avatar: url }).eq('id', currentUser.id);
        if (error) throw new Error(error.message);
        currentUser.avatar = url;
        updateLocalState();
        checkAuthUI();
        renderUserProfile();
        showToast('Зураг солигдлоо!');
    } catch (err) {
        console.error('Avatar солих алдаа:', err);
        showToast('Зураг солиход алдаа: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
}

function openProfileEditBox() {
    document.getElementById('editProfileName').value  = currentUser.name;
    document.getElementById('editProfilePhone').value = currentUser.phone || '';
    tempSelectedAvatarUrl = currentUser.avatar || '';
    tempSelectedAvatarFile = null;
    let statusEl = document.getElementById('editAvatarStatus');
    if (statusEl) statusEl.innerText = 'Сонгоогүй байна.';
    openModal('profileEditModal');
}

// Avatar-ыг base64 болгож DB-д хадгалахгүй — хадгалах үед R2-д upload хийнэ
let tempSelectedAvatarFile = null;

function previewUserAvatarFile(event) {
    let file = event.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
        event.target.value = '';
        return showToast('Зураг 2MB-аас бага байх ёстой!', 'error');
    }
    tempSelectedAvatarFile = file;
    let statusEl = document.getElementById('editAvatarStatus');
    if (statusEl) statusEl.innerText = `✅ Сонгогдлоо: ${file.name}`;
}

async function saveUserProfileChanges() {
    let newName  = document.getElementById('editProfileName').value.trim();
    let newPhone = document.getElementById('editProfilePhone').value.trim();
    if (!newName || !newPhone) return showToast('Талбаруудыг бүрэн бөглөнө үү!', 'error');

    if (tempSelectedAvatarFile) {
        showLoading('Зураг upload хийж байна...');
        try {
            tempSelectedAvatarUrl = await uploadSingle(tempSelectedAvatarFile, 'avatars');
        } catch (err) {
            hideLoading();
            return showToast('Зураг upload алдаа: ' + err.message, 'error');
        }
        hideLoading();
        tempSelectedAvatarFile = null;
    }

    let updates = { name: newName, phone: newPhone, avatar: tempSelectedAvatarUrl || currentUser.avatar };
    const { error } = await supabaseClient
        .from('profile').update(updates).eq('id', currentUser.id);
    if (error) {
        console.error('Supabase profile update алдаа:', error);
        return showToast('Хадгалахад алдаа: ' + error.message, 'error');
    }
    Object.assign(currentUser, updates);
    updateLocalState();

    closeModal('profileEditModal');
    checkAuthUI();
    renderUserProfile();
    showToast('Мэдээлэл амжилттай шинэчлэгдлээ!');
}

// ===== НУУЦ ҮГ ХАРУУЛАХ/НУУХ =====
function togglePasswordVisibility(inputId, iconId) {
    let input = document.getElementById(inputId);
    let icon  = document.getElementById(iconId);
    if (input && icon) {
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
    }
}

// ===== НУУЦ ҮГ СЭРГЭЭХ =====
function openForgotModal() {
    closeModal('loginModal');
    ['forgotStep1', 'forgotStep2', 'forgotStep3'].forEach(id => {
        let el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    let step1 = document.getElementById('forgotStep1');
    if (step1) step1.classList.remove('hidden');
    const forgotEmailEl = document.getElementById('forgotEmail');
    if (forgotEmailEl) forgotEmailEl.value = '';
    openModal('forgotModal');
}

function openPasswordResetModal() {
    ['forgotStep1', 'forgotStep2'].forEach(id => {
        let el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    let step3 = document.getElementById('forgotStep3');
    if (step3) step3.classList.remove('hidden');
    openModal('forgotModal');
}

// ── OTP countdown таймер ──────────────────────────────────────────
let otpCountdownTimer = null;
function startOtpCountdown(seconds = 60) {
    const btn      = document.getElementById('resendOtpBtn');
    const countdown = document.getElementById('resendCountdown');
    if (!btn || !countdown) return;
    btn.style.display      = 'none';
    countdown.style.display = 'inline';
    let left = seconds;
    countdown.textContent  = `${left}с дараа дахин авах`;
    clearInterval(otpCountdownTimer);
    otpCountdownTimer = setInterval(() => {
        left--;
        if (left <= 0) {
            clearInterval(otpCountdownTimer);
            countdown.style.display = 'none';
            btn.style.display       = 'inline';
        } else {
            countdown.textContent = `${left}с дараа дахин авах`;
        }
    }, 1000);
}

// ── OTP баталгаажуулах ───────────────────────────────────────────
async function verifyOtpLogic() {
    const email = document.getElementById('otpTargetEmail')?.textContent?.trim();
    const token = document.getElementById('otpCodeInput')?.value?.trim();
    if (!token || token.length < 6) return showToast('Кодоо бүрэн оруулна уу!', 'error');

    const { error } = await supabaseClient.auth.verifyOtp({
        email, token, type: 'recovery'
    });
    if (error) return showToast('Код буруу байна эсвэл хугацаа дууссан!', 'error');

    // Амжилттай — шинэ нууц үг оруулах алхам руу шилжинэ
    document.getElementById('forgotStep2').classList.add('hidden');
    document.getElementById('forgotStep3').classList.remove('hidden');
}

// ── Дахин OTP илгээх ─────────────────────────────────────────────
async function resendOtpLogic() {
    const email = document.getElementById('otpTargetEmail')?.textContent?.trim();
    if (!email) return;
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${SITE_URL}?type=recovery`
    });
    if (error) return showToast('Код илгээхэд алдаа гарлаа!', 'error');
    showToast('Шинэ код илгээгдлээ!');
    startOtpCountdown(60);
}

async function recoverPasswordLogic() {
    let email = document.getElementById('forgotEmail').value.trim();
    if (!email) return showToast('Имэйл хаягаа оруулна уу!', 'error');

    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${SITE_URL}?type=recovery`
    });
    if (error) { showToast('Имэйл илгээхэд алдаа гарлаа: ' + error.message, 'error'); return; }

    document.getElementById('forgotStep1').classList.add('hidden');
    document.getElementById('forgotStep2').classList.remove('hidden');
    let otpEmailEl = document.getElementById('otpTargetEmail');
    if (otpEmailEl) otpEmailEl.textContent = email;
    startOtpCountdown(60);
    showToast('Нэг удаагийн код таны имэйл рүү илгээгдлээ!');
}

async function resetPasswordLogic() {
    let newPass = document.getElementById('newPassInput').value;
    if (!newPass || newPass.length < 6) return showToast('Нууц үг дор хаяж 6 тэмдэгт байх ёстой!', 'error');

    const { error } = await supabaseClient.auth.updateUser({ password: newPass });
    if (error) { showToast('Нууц үг солиход алдаа гарлаа: ' + error.message, 'error'); return; }

    showToast('Нууц үг амжилттай солигдлоо! Шинэ нууц үгээрээ нэвтэрнэ үү.');
    closeModal('forgotModal');
    setTimeout(() => openModal('loginModal'), 500);
}

// ─────────────────────────────────────────────────────────────────
// ███████╗    R2 UPLOAD СИСТЕМ
// ─────────────────────────────────────────────────────────────────
/**
 * Worker-т POST хийх helper
 * АЮУЛГҮЙ БАЙДЛЫН ЗАСАЛ: WORKER_SECRET биш Supabase JWT ашиглах
 * Worker талд: request.headers.get('Authorization') → Bearer token шалгана
 */
async function workerPost(path, body) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error('Нэвтрээгүй байна — upload хийхийн өмнө нэвтэрнэ үү');

    const res = await fetch(WORKER_URL + path, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Worker алдаа: ' + res.status);
    }
    return res.json();
}

/**
 * Зураг upload (cover, thumb, avatar) — Worker-оор R2-д хадгална
 */
async function uploadSingle(file, folder, onProgress) {
    // Worker-оор шууд upload хийнэ — CORS асуудлыг шийдэнэ
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error('Нэвтрээгүй байна');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);

    const xhr = new XMLHttpRequest();
    await new Promise((resolve, reject) => {
        xhr.upload.onprogress = e => {
            if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100));
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) return resolve();
            let msg = `Upload алдаа: ${xhr.status}`;
            try { msg = JSON.parse(xhr.responseText).error || msg; } catch (_) {}
            reject(new Error(msg));
        };
        xhr.onerror = () => reject(new Error('Network алдаа'));
        xhr.open('POST', WORKER_URL + '/upload/file');
        xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
        xhr.send(formData);
    });

    const result = JSON.parse(xhr.responseText);
    if (result.error) throw new Error(result.error);
    return result.publicUrl;
}

// ── Progress bar UI ────────────────────────────────────────────
function showUploadBar(anchorId, filename, sizeLabel) {
    let old = document.getElementById('r2UploadBar');
    if (old) old.remove();

    const bar = document.createElement('div');
    bar.id = 'r2UploadBar';
    bar.innerHTML = `
        <div style="margin-top:10px;background:#03071b;border-radius:8px;padding:12px;border:1px solid #1c2031;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-size:12px;color:#717d92;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70%;">
                    <i class="fas fa-cloud-upload-alt" style="color:#c9a15a;margin-right:4px;"></i>
                    ${escapeHtml(filename.substring(0, 35))}${filename.length > 35 ? '...' : ''}
                </span>
                <span style="font-size:11px;color:#4e566e;">${sizeLabel}</span>
            </div>
            <div style="background:#101424;border-radius:4px;height:8px;overflow:hidden;">
                <div id="r2UploadFill"
                    style="height:100%;background:linear-gradient(90deg,#c9a15a,#ffa400);
                           width:0%;transition:width 0.4s ease;border-radius:4px;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:4px;">
                <span id="r2UploadPct" style="font-size:11px;color:#717d92;">0%</span>
                <span id="r2UploadStatus" style="font-size:11px;color:#4e566e;">Эхлэж байна...</span>
            </div>
        </div>`;

    const anchor = document.getElementById(anchorId);
    if (anchor) anchor.appendChild(bar);
    else document.body.appendChild(bar);
}

function updateUploadBar(pct, statusText) {
    const fill   = document.getElementById('r2UploadFill');
    const pctEl  = document.getElementById('r2UploadPct');
    const status = document.getElementById('r2UploadStatus');
    if (fill)   fill.style.width = pct + '%';
    if (pctEl)  pctEl.innerText  = pct + '%';
    if (status) status.innerText = statusText || '';
}

function hideUploadBar(delay = 1500) {
    setTimeout(() => {
        const bar = document.getElementById('r2UploadBar');
        if (bar) bar.remove();
    }, delay);
}

function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

// ── Cover зураг сонгох (R2 upload) ────────────────────────────
async function handleCoverFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    showUploadBar('coverUploadArea', file.name, formatBytes(file.size));

    try {
        const url = await uploadSingle(file, 'covers', (pct) => {
            updateUploadBar(pct, pct < 100 ? 'Upload хийж байна...' : 'Дууслаа ✅');
        });
        tempSelectedCoverFile = url;

        const preview    = document.getElementById('coverPreviewImg');
        const previewBox = document.getElementById('coverPreviewBox');
        if (preview)    preview.src               = url;
        if (previewBox) previewBox.style.display  = 'block';
        const label = document.getElementById('coverPreviewLabel');
        if (label) label.innerHTML = '<i class="fas fa-check"></i> Cover R2-д upload дууслаа';

        hideUploadBar(1000);
        showToast('Cover зураг амжилттай upload хийгдлээ!');
    } catch (err) {
        hideUploadBar(0);
        showToast('Cover upload алдаа: ' + err.message, 'error');
        console.error(err);
    }
}

function toggleCoverUrlInput() {
    let urlInput = document.getElementById('admCoverUrl');
    if (urlInput) {
        urlInput.style.display = urlInput.style.display === 'none' ? 'block' : 'none';
        if (urlInput.style.display === 'block') {
            urlInput.focus();
            urlInput.oninput = function () {
                tempSelectedCoverFile = this.value;
                let preview    = document.getElementById('coverPreviewImg');
                let previewBox = document.getElementById('coverPreviewBox');
                if (preview && this.value) {
                    preview.src = this.value;
                    if (previewBox) previewBox.style.display = 'block';
                }
            };
        }
    }
}

// ── Видео файл сонгох (Cloudflare Stream) ─────────────────────
// ЗАСАЛ: encode дуусахыг хязгааргүй хугацаагаар background-д хүлээнэ.
// 10GB, 180 мин видео ч алдаа гарахгүй.
// Видео сонголт бүрт нэмэгдэнэ — хуучин upload/encode дуусахдаа шинэ сонголтыг дарж бичихгүй
let videoSelectionGen = 0;

async function handleVideoFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const gen = ++videoSelectionGen;
    const isStale = () => gen !== videoSelectionGen;

    const statusText = document.getElementById('admVideoStatusText');
    const saveBtn    = document.getElementById('admAddEpBtn');
    if (statusText) statusText.innerText = `⏳ Upload эхлэж байна: ${file.name}`;
    if (saveBtn)    { saveBtn.disabled = true; saveBtn.style.opacity = '0.5'; }

    tempSelectedVideoFile = ''; // Encode дуустал хоосон — санамсаргүй хадгалахаас сэргийлнэ

    showUploadBar('admVideoUploadArea', file.name, formatBytes(file.size));

    try {
        // 1️⃣ TUS upload хийнэ — streamId буцаана (encode хүлээхгүй)
        const streamId = await uploadVideoToStream(file, (pct) => {
            if (isStale()) return;
            updateUploadBar(pct, `Upload хийж байна... (${pct}%)`);
            if (statusText) statusText.innerText = `⏳ ${pct}% — ${file.name}`;
        });
        if (isStale()) return; // Энэ хооронд өөр видео сонгогдсон

        // Upload дууслаа — encode background-д эхлэнэ
        updateUploadBar(100, '✅ Upload дууслаа! Encode хүлээж байна...');
        if (statusText) {
            statusText.innerHTML =
                `⏳ Encode хийгдэж байна... <span id="encodeTimer" style="color:#d6a142;">0 сек</span><br>` +
                `<span style="font-size:10px;color:var(--text-muted);">Хуудсыг хаахгүй байна уу</span>`;
        }
        showToast('Upload дууслаа! Encode дуусахыг хүлээж байна... 🎬');

        // Encode явцын таймер
        let encodeSeconds = 0;
        const encodeTimerInterval = setInterval(() => {
            if (isStale()) return clearInterval(encodeTimerInterval);
            encodeSeconds++;
            const timerEl = document.getElementById('encodeTimer');
            if (timerEl) {
                const mins = Math.floor(encodeSeconds / 60);
                const secs = encodeSeconds % 60;
                timerEl.innerText = mins > 0 ? `${mins} мин ${secs} сек` : `${secs} сек`;
            }
        }, 1000);

        // 2️⃣ Background polling — хязгааргүй хугацаагаар шалгана
        pollStreamUntilReady(streamId, (hlsUrl) => {
            clearInterval(encodeTimerInterval);
            tempSelectedVideoFile = hlsUrl;
            hideUploadBar(500);
            if (statusText) statusText.innerHTML =
                `✅ Encode дууслаа! Видео бэлэн болсон.<br>` +
                `<span style="font-size:10px;color:#00c388;">${escapeHtml(file.name)}</span>`;
            if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = '1'; }
            showToast('Видео encode дууслаа! Анги нэмэх товч идэвхжлээ. 🎬');
        }, (errMsg) => {
            clearInterval(encodeTimerInterval);
            hideUploadBar(0);
            if (statusText) statusText.innerText = `❌ Encode алдаа: ${errMsg}`;
            if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = '1'; }
            showToast('Encode алдаа: ' + errMsg, 'error');
        }, isStale);

    } catch (err) {
        if (isStale()) return;
        hideUploadBar(0);
        if (statusText) statusText.innerText = `❌ Upload алдаа: ${err.message}`;
        if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = '1'; }
        showToast('Видео upload алдаа: ' + err.message, 'error');
        console.error(err);
    }
}

/**
 * Cloudflare Stream encode дуусахыг хязгааргүй хугацаагаар background-д шалгана.
 * Хугацааны алхам: 0–5мин → 10с, 5–30мин → 20с, 30мин+ → 30с
 * @param {string}   streamId  - Cloudflare Stream ID
 * @param {Function} onReady   - encode дуусмагц hlsUrl-тай дуудагдана
 * @param {Function} onError   - Worker-ийн encode алдаа гарвал дуудагдана
 * @param {Function} isCancelled - true буцаавал polling чимээгүй зогсоно (өөр видео сонгогдсон)
 */
function pollStreamUntilReady(streamId, onReady, onError, isCancelled = () => false) {
    let attempts = 0;

    function getInterval() {
        if (attempts < 30) return 10_000;  // 0–5 мин: 10 секунд тутамд
        if (attempts < 90) return 20_000;  // 5–30 мин: 20 секунд тутамд
        return 30_000;                     // 30 мин+: 30 секунд тутамд (хязгааргүй)
    }

    async function check() {
        if (isCancelled()) return;
        attempts++;
        try {
            const status = await workerPost('/stream/status', { streamId });
            if (isCancelled()) return;
            if (status.status === 'ready') {
                onReady(status.hlsUrl);
                return; // Polling зогсоно
            }
            if (status.status === 'error') {
                onError('Cloudflare Stream encode алдаа гарлаа');
                return;
            }
            // Хэвийн processing → дараагийн шалгалт
            setTimeout(check, getInterval());
        } catch (err) {
            // Network алдаа тохиолдвол retry — хаяхгүй
            console.warn(`Stream status шалгах алдаа (оролдлого ${attempts}):`, err.message);
            setTimeout(check, getInterval());
        }
    }

    setTimeout(check, 10_000); // Эхний шалгалт 10 секундын дараа
}

function toggleVideoUrlInput() {
    let urlInput = document.getElementById('admVideoUrl');
    if (urlInput) {
        urlInput.style.display = urlInput.style.display === 'none' ? 'block' : 'none';
        if (urlInput.style.display === 'block') {
            urlInput.focus();
            urlInput.oninput = function () {
                videoSelectionGen++; // явж буй upload/encode-ийг цуцална
                tempSelectedVideoFile = this.value;
                let statusText = document.getElementById('admVideoStatusText');
                if (statusText) statusText.innerText = `✅ URL оруулсан: ${this.value.substring(0, 50)}`;
            };
        }
    }
}

// ── Episode thumbnail ──────────────────────────────────────────
async function handleEpThumbSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const statusEl = document.getElementById('admThumbStatusText');
    if (statusEl) statusEl.innerText = `⏳ Upload хийж байна...`;

    showUploadBar('admThumbUploadArea', file.name, formatBytes(file.size));

    try {
        const url = await uploadSingle(file, 'thumbs', (pct) => {
            updateUploadBar(pct, pct < 100 ? `${pct}%` : '✅ Дууслаа');
        });
        tempSelectedEpThumb = url;
        if (statusEl) statusEl.innerText = `✅ Thumbnail: ${file.name}`;
        hideUploadBar(1000);
        showToast('Thumbnail upload хийгдлээ!');
    } catch (err) {
        hideUploadBar(0);
        if (statusEl) statusEl.innerText = `❌ Алдаа: ${err.message}`;
        showToast('Thumbnail upload алдаа: ' + err.message, 'error');
        console.error(err);
    }
}

// ── Cloudflare Stream-д видео upload хийх (TUS protocol) ─────────
async function uploadVideoToStream(file, onProgress) {
    // 1. Worker-ээс TUS upload URL авна
    const { uploadUrl, streamId } = await workerPost('/stream/upload', {
        filename: file.name,
        fileSize: file.size,
    });

    // 2. TUS upload хийнэ — chunk 50MB
    const CHUNK = 50 * 1024 * 1024;
    let offset = 0;

    while (offset < file.size) {
        const chunk = file.slice(offset, offset + CHUNK);
        const res   = await fetch(uploadUrl, {
            method: 'PATCH',
            headers: {
                'Tus-Resumable':  '1.0.0',
                'Upload-Offset':  String(offset),
                'Content-Type':   'application/offset+octet-stream',
                'Content-Length': String(chunk.size),
            },
            body: chunk,
        });
        if (!res.ok) throw new Error('Stream upload chunk алдаа: ' + res.status);
        offset += chunk.size;
        if (onProgress) onProgress(Math.round(offset / file.size * 95));
    }

    // 3. Upload дуусмагц streamId-г шууд буцаана — encode хүлээхгүй.
    // Encode background-д явна (pollStreamUntilReady ашиглана).
    if (onProgress) onProgress(100);
    return streamId;
}

// ─────────────────────────────────────────────────────────────────
// ███████╗    ИМЭЙЛ ЯВУУЛАХ  (Cloudflare Worker → Resend)
// ─────────────────────────────────────────────────────────────────

/**
 * Нэг имэйл явуулах — Worker-д дамжуулна
 */
async function sendEmail(to, subject, html) {
    if (!WORKER_URL || WORKER_URL.includes('YOUR_NAME')) return;
    try {
        // АЮУЛГҮЙ БАЙДЛЫН ЗАСАЛ: JWT ашиглах
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;
        const emailRes = await fetch(WORKER_URL + '/email/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ to, subject, html }),
        });
        if (!emailRes.ok) {
            const errText = await emailRes.text().catch(() => emailRes.status);
            console.warn(`Имэйл Worker алдаа ${emailRes.status}:`, errText,
                '\n→ Worker-ийн SUPABASE_URL/SUPABASE_ANON_KEY болон таны админ эрхийг шалгана уу.');
        }
    } catch (err) {
        console.warn('Имэйл явуулж чадсангүй:', err.message);
    }
}

/** VIP идэвхжсэн мэдэгдэл */
function emailVipApproved(user, vipLabel, expiryDate) {
    sendEmail(
        user.email,
        '👑 GoyKino — VIP эрх идэвхжлээ!',
        `<div style="font-family:sans-serif;background:#03071b;color:#f5f7fb;padding:32px;border-radius:12px;">
            <h2 style="color:#d6a142;">👑 VIP эрх идэвхжлээ, ${escapeHtml(user.name)}!</h2>
            <p style="color:#717d92;line-height:1.6;margin-top:12px;">
                Таны <strong style="color:#fff;">${escapeHtml(vipLabel)}</strong> VIP эрх идэвхжлээ.<br>
                Дуусах хугацаа: <strong style="color:#d6a142;">${escapeHtml(expiryDate)}</strong>
            </p>
            <a href="${SITE_URL}" style="display:inline-block;margin-top:20px;background:#d6a142;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">
                Кино үзэх →
            </a>
            <p style="color:#2a3045;font-size:12px;margin-top:24px;">GoyKino · Монголын кино платформ</p>
        </div>`
    );
}

/** Түрээс нээгдсэн мэдэгдэл */
function emailRentApproved(user, movieTitle) {
    sendEmail(
        user.email,
        `🎬 GoyKino — "${movieTitle}" нээгдлээ!`,
        `<div style="font-family:sans-serif;background:#03071b;color:#f5f7fb;padding:32px;border-radius:12px;">
            <h2 style="color:#c9a15a;">🎬 Кино нээгдлээ, ${escapeHtml(user.name)}!</h2>
            <p style="color:#717d92;line-height:1.6;margin-top:12px;">
                <strong style="color:#fff;">${escapeHtml(movieTitle)}</strong> киног одоо үзэх боломжтой боллоо.
            </p>
            <a href="${SITE_URL}" style="display:inline-block;margin-top:20px;background:#c9a15a;color:#140f04;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">
                Кино үзэх →
            </a>
            <p style="color:#2a3045;font-size:12px;margin-top:24px;">GoyKino · Монголын кино платформ</p>
        </div>`
    );
}

// ─────────────────────────────────────────────────────────────────
// ADMIN
// ─────────────────────────────────────────────────────────────────
function switchAdminTab(tabId) {
    adminActiveTab = tabId;
    document.querySelectorAll('.admin-tabs-nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));

    let tabBtnMap = { moviesTab: 'btn-tab-movies', requestsTab: 'btn-tab-requests', usersTab: 'btn-tab-users', bannersTab: 'btn-tab-banners' };
    let btn = document.getElementById(tabBtnMap[tabId]);
    if (btn) btn.classList.add('active');
    let tab = document.getElementById(tabId);
    if (tab) tab.classList.remove('hidden');
    initAdminPanel();
}

function initAdminPanel() {
    if (adminActiveTab === 'moviesTab')    renderAdminMovieList();
    else if (adminActiveTab === 'usersTab')    renderAdminUsersTable();
    else if (adminActiveTab === 'requestsTab') renderAdminRequests();
    else if (adminActiveTab === 'bannersTab')  renderAdminBanners();
    updateRequestBadge();
}

// ===== АДМИН: НҮҮР ХУУДАСНЫ БАННЕР =====
const HERO_BANNER_LIMIT = 6;

function renderAdminBanners() {
    let options = '<option value="">— Кино холбохгүй —</option>' +
        movies.map(m => `<option value="${m.id}">${escapeHtml(m.title)} (${escapeHtml(m.code)})</option>`).join('');
    ['heroBannerMovie', 'adBannerMovie'].forEach(id => {
        let sel = document.getElementById(id);
        if (sel) { let v = sel.value; sel.innerHTML = options; sel.value = v; }
    });

    let heroes = banners.filter(b => b.kind === 'hero');
    let countEl = document.getElementById('heroBannerCount');
    if (countEl) countEl.innerText = `${heroes.length}/${HERO_BANNER_LIMIT}`;

    let item = b => {
        let movie = movies.find(m => m.id === b.movie_id);
        let target = movie ? `🎬 ${escapeHtml(movie.title)}` : b.link ? `🔗 ${escapeHtml(b.link)}` : 'Холбоосгүй';
        return `
            <div class="banner-admin-item">
                <img src="${attrUrl(b.image)}" alt="">
                <div class="banner-admin-target">${target}</div>
                <button class="banner-admin-del" onclick="adminDeleteBanner(${b.id})" title="Устгах"><i class="fas fa-trash"></i></button>
            </div>`;
    };
    let empty = '<p class="banner-help" style="margin-top:12px;">Одоогоор баннер алга.</p>';
    document.getElementById('heroBannerList').innerHTML = heroes.length ? heroes.map(item).join('') : empty;
    let ads = banners.filter(b => b.kind === 'ad');
    document.getElementById('adBannerList').innerHTML = ads.length ? ads.map(item).join('') : empty;
}

async function adminAddBanner(kind) {
    if (!await verifyIsAdmin()) return;
    let fileInput = document.getElementById(kind + 'BannerFile');
    let movieSel  = document.getElementById(kind + 'BannerMovie');
    let linkInput = document.getElementById(kind + 'BannerLink');
    let file      = fileInput.files[0];
    let movieId   = parseInt(movieSel.value) || null;
    let link      = linkInput ? linkInput.value.trim() : '';

    if (!file) return showToast('Зураг сонгоно уу!', 'error');
    if (kind === 'hero' && banners.filter(b => b.kind === 'hero').length >= HERO_BANNER_LIMIT) {
        return showToast(`Нүүр баннер ${HERO_BANNER_LIMIT}-аас ихгүй байна. Эхлээд нэгийг устгана уу.`, 'error');
    }
    if (link && !/^https?:\/\//i.test(link)) return showToast('Холбоос https://-ээр эхлэх ёстой!', 'error');

    showLoading('Баннер upload хийж байна...');
    try {
        let image = await uploadSingle(file, 'banners');
        let position = Math.max(0, ...banners.filter(b => b.kind === kind).map(b => b.position || 0)) + 1;
        const { data, error } = await supabaseClient.from('banners')
            .insert({ kind, image, movie_id: movieId, link: link || null, position })
            .select().single();
        if (error) throw new Error(error.message);
        banners.push(data);
        fileInput.value = '';
        movieSel.value = '';
        if (linkInput) linkInput.value = '';
        renderAdminBanners();
        renderHomeMovies();
        showToast('Баннер нэмэгдлээ!');
    } catch (err) {
        console.error('Баннер нэмэх алдаа:', err);
        showToast('Баннер нэмэхэд алдаа: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
}

async function adminDeleteBanner(id) {
    if (!await verifyIsAdmin()) return;
    showConfirm('Энэ баннерыг устгах уу?', async () => {
        const { error } = await supabaseClient.from('banners').delete().eq('id', id);
        if (error) return showToast('Устгахад алдаа: ' + error.message, 'error');
        banners = banners.filter(b => b.id !== id);
        renderAdminBanners();
        renderHomeMovies();
        showToast('Баннер устгагдлаа.');
    }, 'Баннер устгах', 'Тийм, устгах');
}

async function adminAddEpisodeToMovie() {
    if (!await verifyIsAdmin()) return; // SERVER-SIDE ШАЛГАЛТ — өмнө дутуу байсан
    if (!adminSelectedSeriesId) return showToast('Эхлээд жагсаалтаас кино сонгоно уу!', 'error');
    let num    = parseInt(document.getElementById('admNewEpNumber').value);
    let epTitle = document.getElementById('admNewEpTitle')?.value.trim() || `${num}-р анги`;

    if (!num) return showToast('Ангийн дугаар заавал оруулна уу!', 'error');
    if (!tempSelectedVideoFile) return showToast('Видео файл эсвэл URL оруулна уу!', 'error');

    let m = movies.find(mv => mv.id === adminSelectedSeriesId);
    if (!m) return;

    // Server талд мөрийг түгжиж нэмнэ — давхардсан дугаар болон 2 админ зэрэг нэмэхийг шалгана
    try {
        m.episodes = await addEpisodeAtomic(m.id, { num, title: epTitle, file: tempSelectedVideoFile, thumb: tempSelectedEpThumb });
        m.episode_count = m.episodes.length;
    } catch (err) {
        console.error('Анги нэмэх алдаа:', err);
        return showToast('Анги нэмэхэд алдаа: ' + err.message, 'error');
    }

    document.getElementById('admNewEpNumber').value = '';
    if (document.getElementById('admNewEpTitle')) document.getElementById('admNewEpTitle').value = '';
    document.getElementById('admVideoFileInput').value = '';
    document.getElementById('admVideoStatusText').innerText = 'Файл сонгоогүй байна.';
    if (document.getElementById('admEpThumbInput')) document.getElementById('admEpThumbInput').value = '';
    if (document.getElementById('admThumbStatusText')) document.getElementById('admThumbStatusText').innerText = 'Thumbnail сонгоогүй.';
    tempSelectedVideoFile = '';
    tempSelectedEpThumb   = '';
    videoSelectionGen++;

    renderAdminMovieList();
    renderHomeMovies();
    showToast(`${m.title} кинонд Анги ${num} нэмэгдлээ!`);
}

// Кино хуудсанд нэрийн доор харагдах нэмэлт мэдээлэл (supabase/security.sql-д нэмэгдсэн баганууд)
const MOVIE_DETAIL_FIELDS = [
    { column: 'year',       input: 'admYear',       type: 'int' },
    { column: 'duration',   input: 'admDuration',   type: 'int' },
    { column: 'rating',     input: 'admRating',     type: 'float' },
    { column: 'translator', input: 'admTranslator', type: 'text' },
    { column: 'genres',     input: 'admGenres',     type: 'text' },
];

// Хоосон талбар → null. Баганууд DB-д хараахан байхгүй (SQL ажиллуулаагүй) бол юу ч буцаахгүй,
// тэгэхгүй бол insert/update бүхэлдээ алдаа заана.
function readMovieDetailsForm() {
    if (MOVIE_LIST_COLUMNS === MOVIE_BASE_COLUMNS) return {};
    let details = {};
    MOVIE_DETAIL_FIELDS.forEach(f => {
        let raw = (document.getElementById(f.input)?.value || '').trim();
        if (!raw) { details[f.column] = null; return; }
        details[f.column] = f.type === 'int' ? parseInt(raw) : f.type === 'float' ? parseFloat(raw) : raw;
        if (f.type !== 'text' && isNaN(details[f.column])) details[f.column] = null;
    });
    return details;
}

async function adminSaveMovie() {
    if (!await verifyIsAdmin()) return; // SERVER-SIDE ШАЛГАЛТ
    let title    = document.getElementById('admTitle').value.trim();
    let desc     = document.getElementById('admDesc').value.trim();
    let price    = parseInt(document.getElementById('admPrice').value) || 0;
    let code     = document.getElementById('admManualCode').value.trim();
    let category = document.getElementById('admCategory').value;
    let status   = document.getElementById('admStatus').value;
    let cover    = tempSelectedCoverFile || document.getElementById('admCoverUrl')?.value || '';
    let details  = readMovieDetailsForm();

    if (!title || !code) return showToast('Нэр болон код заавал хэрэгтэй!', 'error');
    if (details.rating != null && (details.rating < 0 || details.rating > 10)) {
        return showToast('Үнэлгээ 0-10 хооронд байх ёстой!', 'error');
    }

    if (adminEditingMovieId) {
        let m = movies.find(mv => mv.id === adminEditingMovieId);
        if (m) {
            // Түрээс киноны кодоор (rentedMovies) холбогддог — код солиход түрээслэгчид эрхээ алдана
            if (code !== m.code) {
                return showToast('Киноны кодыг өөрчлөх боломжгүй — түрээслэсэн хэрэглэгчид эрхээ алдана!', 'error');
            }
            let updates = { title, desc, price, category, status, cover: cover || m.cover, ...details };

            const { error } = await supabaseClient.from('movies')
                .update(updates).eq('id', adminEditingMovieId);
            if (error) {
                console.error('Supabase movie update алдаа:', error);
                return showToast('Хадгалахад алдаа: ' + error.message, 'error');
            }
            Object.assign(m, updates);
            showToast('Киноны мэдээлэл амжилттай шинэчлэгдлээ!');
        }
        adminEditingMovieId = null;
        let btn = document.getElementById('btnAdminMovieSubmit');
        if (btn) { btn.innerText = 'Шууд нийтлэх'; btn.style.background = '#00c388'; }
    } else {
        const { data: dup } = await supabaseClient
            .from('movies').select('id').eq('code', code).limit(1);
        if (dup?.length) return showToast('Энэ код аль хэдийн бүртгэлтэй байна!', 'error');

        let newMovie = {
            title, desc, price, code, category, status,
            cover: cover || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400',
            views: 0, episodes: [], isTrending: false, isNew: true, ...details
        };

        const { data: inserted, error } = await supabaseClient
            .from('movies').insert(newMovie).select('id').single();
        if (error || !inserted) {
            console.error('Supabase movie insert алдаа:', error);
            return showToast('Кино нэмэхэд алдаа: ' + (error?.message || 'тодорхойгүй'), 'error');
        }
        newMovie.id = inserted.id;
        newMovie.episode_count = 0;

        movies.push(newMovie);
        showToast('Шинэ кино амжилттай нэмэгдлээ!');
    }

    ['admTitle', 'admDesc', 'admManualCode', ...MOVIE_DETAIL_FIELDS.map(f => f.input)].forEach(id => {
        let el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('admPrice').value = '0';
    if (document.getElementById('admCoverUrl')) document.getElementById('admCoverUrl').value = '';
    let previewBox = document.getElementById('coverPreviewBox');
    if (previewBox) previewBox.style.display = 'none';
    tempSelectedCoverFile = '';

    renderAdminMovieList();
    renderHomeMovies();
}

function adminPrepareEditMovie(id) {
    let m = movies.find(mv => mv.id === id);
    if (!m) return;
    adminEditingMovieId = id;
    document.getElementById('admTitle').value       = m.title;
    document.getElementById('admDesc').value        = m.desc;
    document.getElementById('admPrice').value       = m.price;
    document.getElementById('admManualCode').value  = m.code;
    document.getElementById('admCategory').value    = m.category;
    document.getElementById('admStatus').value      = m.status;
    MOVIE_DETAIL_FIELDS.forEach(f => {
        let el = document.getElementById(f.input);
        if (el) el.value = m[f.column] ?? '';
    });

    if (m.cover) {
        tempSelectedCoverFile = m.cover;
        let preview    = document.getElementById('coverPreviewImg');
        let previewBox = document.getElementById('coverPreviewBox');
        if (preview)    preview.src             = m.cover;
        if (previewBox) previewBox.style.display = 'block';
    }

    let btn = document.getElementById('btnAdminMovieSubmit');
    if (btn) { btn.innerText = 'Өөрчлөлтийг хадгалах'; btn.style.background = '#c9a15a'; }

    switchAdminTab('moviesTab');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`Засах горим: ${m.title}`);
}

async function adminSelectMovieForEpisodes(id) {
    let m = movies.find(mv => mv.id === id);
    if (!m) return;
    adminSelectedSeriesId = id;
    m.episodes = await fetchEpisodes(id);
    let display = document.getElementById('admSelectedSeriesDisplay');
    if (display) display.innerHTML = `✅ Сонгогдсон: <strong>${escapeHtml(m.title)}</strong> (${escapeHtml(m.code)}) - ${m.episodes ? m.episodes.length : 0} анги`;
}

function renderAdminMovieList() {
    let container = document.getElementById('adminMovieList');
    if (!container) return;
    if (movies.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:10px;">Кино байхгүй байна.</p>';
        return;
    }
    container.innerHTML = movies.map(m => {
        let epList = (m.episodes && m.episodes.length > 0)
            ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #1c2031;">
                <div style="font-size:11px;color:var(--text-muted);margin-bottom:5px;">Ангиуд:</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;">
                    ${m.episodes.map(ep => `
                        <div style="display:flex;align-items:center;gap:3px;background:#1c2031;padding:3px 6px;border-radius:4px;">
                            <span style="font-size:11px;color:#e8d3a8;">${ep.num}-р анги</span>
                            <button onclick="adminDeleteEpisode(${m.id},${ep.num})" title="Устгах"
                                style="background:#ef4444;color:#fff;border:none;width:16px;height:16px;border-radius:3px;cursor:pointer;font-size:10px;line-height:1;padding:0;">×</button>
                        </div>
                    `).join('')}
                </div>
              </div>`
            : '<div style="font-size:11px;color:var(--text-muted);margin-top:5px;">Анги байхгүй</div>';

        return `
        <div style="margin-bottom:8px;background:var(--bg-dark);padding:10px;border-radius:6px;border:1px solid var(--border-color);">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="display:flex;align-items:center;gap:10px;">
                    ${m.cover ? `<img src="${attrUrl(m.cover)}" style="width:40px;height:55px;object-fit:cover;border-radius:4px;">` : '<div style="width:40px;height:55px;background:#1c2031;border-radius:4px;"></div>'}
                    <div>
                        <strong style="font-size:13px;">${escapeHtml(m.title)}</strong>
                        <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(m.code)} · ${episodeCount(m)} анги · ${m.price === 0 ? 'Үнэгүй' : m.price.toLocaleString() + ' ₮'}</div>
                    </div>
                </div>
                <div style="display:flex;gap:5px;flex-wrap:wrap;">
                    <button onclick="adminSelectMovieForEpisodes(${m.id})" style="background:#1c2031;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">Анги+</button>
                    <button onclick="adminPrepareEditMovie(${m.id})" style="background:#d6a142;color:#000;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;">Засах</button>
                    <button onclick="adminDeleteMovie(${m.id})" style="background:#ef4444;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">Устгах</button>
                </div>
            </div>
            ${epList}
        </div>`;
    }).join('');
}

async function adminDeleteMovie(id) {
    if (!await verifyIsAdmin()) return; // SERVER-SIDE ШАЛГАЛТ
    let m = movies.find(mv => mv.id === id);
    if (!m) return;
    showConfirm(
        `"${m.title}" киног устгахдаа итгэлтэй байна уу? Ангиуд ч хамт устагдана.`,
        async () => {
            const { error } = await supabaseClient.from('movies').delete().eq('id', id);
            if (error) {
                console.error('Supabase movie delete алдаа:', error);
                return showToast('Устгахад алдаа: ' + error.message, 'error');
            }
            movies = movies.filter(mv => mv.id !== id);
            if (adminSelectedSeriesId === id) {
                adminSelectedSeriesId = null;
                let display = document.getElementById('admSelectedSeriesDisplay');
                if (display) display.innerText = 'Кино сонгогдоогүй байна.';
            }
            renderAdminMovieList();
            renderHomeMovies();
            showToast('Кино устгагдлаа.');
        },
        'Кино устгах', 'Тийм, устгах'
    );
}

// ===== ХЭРЭГЛЭГЧДИЙН ХҮСНЭГТ =====
const USERS_PER_PAGE = 20;
let usersCurrentPage = 0;
let usersTotalCount  = 0;

async function renderAdminUsersTable(page = 0) {
    let tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;

    usersCurrentPage = page;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px;"><i class="fas fa-spinner fa-spin"></i> Ачааллаж байна...</td></tr>';

    const from = page * USERS_PER_PAGE;
    const to   = from + USERS_PER_PAGE - 1;

    const { data: usersData, count, error } = await supabaseClient
        .from('profile')
        .select('*', { count: 'exact' })
        .order('id', { ascending: false })
        .range(from, to);

    if (error) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#ef4444;padding:20px;">Татахад алдаа гарлаа.</td></tr>';
        return;
    }

    users = usersData || [];
    usersTotalCount = count || 0;

    tbody.innerHTML = users.map((u, idx) => {
        // isVipActive ашиглан зөв шалгах
        let vipText = isVipActive(u)
            ? `<span style="color:#00c388;">Идэвхтэй (${new Date(u.vipExpires).toLocaleDateString('mn-MN')})</span>`
            : '<span style="color:var(--text-muted);">Ердийн</span>';

        // Имэйлийг onclick string-д шууд оруулахгүй — data-email-ээс уншина
        // (JSON.stringify-ийн "..." нь onclick="..." attribute-ыг эвдэж байсан)
        let emailAttr = escapeHtml(u.email);
        let actionButtons = u.role !== 'admin' ? `
            <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;">
                ${u.role === 'moderator'
                    ? `<button data-email="${emailAttr}" onclick="changeUserRole(this.dataset.email,'user')" style="background:#b8883a;color:#fff;padding:4px 8px;font-size:11px;border:none;border-radius:4px;cursor:pointer;">Mod цуцлах</button>`
                    : `<button data-email="${emailAttr}" onclick="changeUserRole(this.dataset.email,'moderator')" style="background:#c9a15a;color:#140f04;padding:4px 8px;font-size:11px;border:none;border-radius:4px;cursor:pointer;">Mod болгох</button>`
                }
                <input type="number" id="vipDays-${idx}" placeholder="Хоног"
                    style="width:60px;padding:4px;font-size:11px;background:#03071b;border:1px solid #1c2031;color:#fff;border-radius:4px;">
                <button data-email="${emailAttr}" onclick="adminGiveVipDays(this.dataset.email,${idx})" style="background:#00c388;color:#fff;padding:4px 8px;font-size:11px;border:none;border-radius:4px;cursor:pointer;">VIP өгөх</button>
                <button data-email="${emailAttr}" onclick="adminApprovePayment(this.dataset.email)" style="background:#1c2031;color:#fff;padding:4px 8px;font-size:11px;border:none;border-radius:4px;cursor:pointer;">Түрээс нээх</button>
            </div>
        ` : `<span style="color:var(--vip-color);font-weight:600;">Үндсэн Админ</span>`;

        return `
            <tr>
                <td><img src="${attrUrl(u.avatar || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png')}"
                    style="width:28px;height:28px;border-radius:50%;margin-right:8px;vertical-align:middle;">${escapeHtml(u.name)}</td>
                <td>${escapeHtml(u.email)}</td>
                <td>${escapeHtml(u.phone || '-')}</td>
                <td><span class="badge" style="background:#2a3045;color:#fff;">${escapeHtml((u.role || 'user').toUpperCase())}</span></td>
                <td>${vipText}</td>
                <td>${actionButtons}</td>
            </tr>`;
    }).join('');

    // Pagination товчнууд
    const totalPages = Math.ceil(usersTotalCount / USERS_PER_PAGE);
    if (totalPages > 1) {
        const paginationEl = document.getElementById('usersPagination') || (() => {
            const el = document.createElement('div');
            el.id = 'usersPagination';
            el.style.cssText = 'display:flex;gap:8px;align-items:center;justify-content:center;margin-top:15px;';
            tbody.closest('.table-responsive')?.after(el);
            return el;
        })();

        paginationEl.innerHTML = `
            <button onclick="renderAdminUsersTable(${page - 1})"
                style="background:#1c2031;color:#fff;border:none;padding:7px 14px;border-radius:6px;cursor:pointer;font-size:13px;${page === 0 ? 'opacity:0.4;pointer-events:none;' : ''}"
            ><i class="fas fa-chevron-left"></i></button>
            <span style="font-size:13px;color:var(--text-muted);">
                ${page + 1} / ${totalPages} <span style="font-size:11px;">(Нийт ${usersTotalCount} хэрэглэгч)</span>
            </span>
            <button onclick="renderAdminUsersTable(${page + 1})"
                style="background:#1c2031;color:#fff;border:none;padding:7px 14px;border-radius:6px;cursor:pointer;font-size:13px;${page + 1 >= totalPages ? 'opacity:0.4;pointer-events:none;' : ''}"
            ><i class="fas fa-chevron-right"></i></button>`;
    }
}

async function adminGiveVipDays(userEmail, idx) {
    if (!await verifyIsAdmin()) return; // SERVER-SIDE ШАЛГАЛТ
    let dayInput = document.getElementById(`vipDays-${idx}`);
    let days = parseInt(dayInput.value);
    if (!days || days <= 0) return showToast('Зөв хоногийн тоо оруулна уу!', 'error');

    let u = users.find(us => us.email === userEmail);
    if (!u) return;

    let currentMs = u.vipExpires ? Number(new Date(u.vipExpires)) : 0;
    let base      = currentMs > Date.now() ? currentMs : Date.now();
    let newExpiry = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();

    // role-ыг өөрчлөхгүй — VIP-ийг vipExpires-ээр шалгадаг, модератор эрхээ алдахгүй
    const { error } = await supabaseClient
        .from('profile').update({ vipExpires: newExpiry }).eq('email', userEmail);
    if (error) {
        console.error('Supabase VIP update алдаа:', error);
        return showToast('VIP нэмэхэд алдаа: ' + error.message, 'error');
    }
    u.vipExpires = newExpiry;

    emailVipApproved(u, `${days} хоногийн VIP`, new Date(u.vipExpires).toLocaleDateString('mn-MN'));

    renderAdminUsersTable();
    dayInput.value = '';
    showToast(`${u.name} хэрэглэгчид ${days} хоногийн VIP нэмлээ!`);
}

async function adminApprovePayment(userEmail) {
    if (!await verifyIsAdmin()) return;

    // 1️⃣ DB-аас шинэ pending хүсэлтүүдийг татна (local state-д найдахгүй)
    const { data: freshReqs, error: fetchErr } = await supabaseClient
        .from('requests')
        .select('*')
        .eq('userEmail', userEmail)
        .eq('type', 'PAYMENT')
        .eq('status', 'pending');

    if (fetchErr || !freshReqs || freshReqs.length === 0)
        return showToast('Энэ хэрэглэгчид хүлээгдэж байгаа төлбөрийн хүсэлт байхгүй байна.', 'error');

    // 2️⃣ Хэрэглэгчийн шинэ өгөгдлийг DB-аас татна
    const { data: freshUser, error: userErr } = await supabaseClient
        .from('profile').select('*').eq('email', userEmail).single();
    if (userErr || !freshUser) return showToast('Хэрэглэгч олдсонгүй!', 'error');

    let approvedCount = 0;
    for (const r of freshReqs) {
        // 3️⃣ Тус бүрд lock хийнэ — 2 admin зэрэг дарвал зөвхөн нэг нь амжина
        // 0 мөр шинэчлэгдэхэд Supabase error буцаадаггүй тул .select()-ээр шалгана
        const { data: locked, error: lockErr } = await supabaseClient
            .from('requests').update({ status: 'approved' })
            .eq('id', r.id).eq('status', 'pending').select('id');
        if (lockErr || !locked?.length) continue; // Аль хэдийн өөр admin батласан

        const grantErr = await grantPaymentToUser(freshUser, r);
        if (grantErr) {
            console.error('adminApprovePayment алдаа:', grantErr);
            await unlockRequest(r.id);
            showToast('Эрх нээхэд алдаа: ' + grantErr.message, 'error');
            continue;
        }

        // Local state шинэчилнэ
        let localReq = requests.find(req => req.id === r.id);
        if (localReq) localReq.status = 'approved';
        approvedCount++;
    }

    // Local user шинэчилнэ
    let localUser = users.find(us => us.id === freshUser.id);
    if (localUser) {
        localUser.vipExpires   = freshUser.vipExpires;
        localUser.rentedMovies = freshUser.rentedMovies;
    }

    renderAdminUsersTable();
    updateRequestBadge();
    showToast(approvedCount > 0
        ? `${freshUser.name} хэрэглэгчийн ${approvedCount} хүсэлт баталгаажлаа!`
        : 'Хүсэлтүүд аль хэдийн баталгаажсан байна.');
}

async function changeUserRole(userEmail, newRole) {
    if (!await verifyIsAdmin()) return; // SERVER-SIDE ШАЛГАЛТ
    let u = users.find(us => us.email === userEmail);
    if (!u) return;

    const { error } = await supabaseClient
        .from('profile').update({ role: newRole }).eq('email', userEmail);
    if (error) {
        console.error('Supabase role update алдаа:', error);
        return showToast('Эрх өөрчлөхөд алдаа: ' + error.message, 'error');
    }
    u.role = newRole;

    renderAdminUsersTable();
    checkAuthUI();
    showToast(`${u.name} → ${newRole === 'moderator' ? 'Модератор болголлоо ✅' : 'Энгийн хэрэглэгч болголлоо'}`);
}

// ===== ХҮСЭЛТҮҮД =====
function renderAdminRequests() {
    let container = document.getElementById('adminRequestsList');
    if (!container) return;

    let pendingReqs = requests.filter(r => r.status === 'pending');
    if (pendingReqs.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">Шинэ хүсэлт ирээгүй байна.</p>';
        return;
    }

    container.innerHTML = pendingReqs.map(r => {
        if (r.type === 'PAYMENT') {
            return `
                <div class="request-card" style="border-left:4px solid var(--vip-color);">
                    <div class="request-header">
                        <strong>💰 ТӨЛБӨРИЙН ХҮСЭЛТ</strong>
                        <span class="badge" style="background:#1c2031;color:#fff;">${escapeHtml(r.paymentType || 'PAYMENT')}</span>
                    </div>
                    <p>Хэрэглэгч: <strong>${escapeHtml(r.userName)}</strong> (Утас: ${escapeHtml(r.userPhone)})</p>
                    <p>Код: <strong>${escapeHtml(r.paymentType === 'VIP' ? vipPayRef(r.code) : r.code)}</strong> · Дүн: <strong style="color:#00c388;">${r.amount?.toLocaleString()} ₮</strong></p>
                    <p style="font-size:11px;color:var(--text-muted);">${new Date(r.createdAt).toLocaleString('mn-MN')}</p>
                    <div style="display:flex;gap:10px;margin-top:10px;">
                        <button onclick="approveRequest(${r.id})" style="background:#00c388;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-weight:bold;">✅ Баталгаажуулах</button>
                        <button onclick="rejectRequest(${r.id})" style="background:#ef4444;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;">❌ Татгалзах</button>
                    </div>
                </div>`;
        } else if (r.type === 'MOVIE_ADD') {
            return `
                <div class="request-card" style="border-left:4px solid var(--primary);">
                    <div class="request-header">
                        <strong>🎬 КИНО НЭМЭХ ХҮСЭЛТ</strong>
                        <span class="badge">${escapeHtml(categoryLabel(r.category))}</span>
                    </div>
                    <h4>${escapeHtml(r.title)} (${escapeHtml(r.code)})</h4>
                    <p style="color:var(--text-muted);font-size:13px;">${escapeHtml(r.desc)}</p>
                    <p>Үнэ: <strong>${r.price === 0 ? 'Үнэгүй' : r.price.toLocaleString() + ' ₮'}</strong> · Илгээсэн: <strong>${escapeHtml(r.senderName)}</strong></p>
                    <div style="display:flex;gap:10px;margin-top:10px;">
                        <button onclick="approveMovieRequest(${r.id})" style="background:#00c388;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-weight:bold;">✅ Нийтлэх</button>
                        <button onclick="rejectRequest(${r.id})" style="background:#ef4444;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;">❌ Татгалзах</button>
                    </div>
                </div>`;
        } else if (r.type === 'EPISODE_ADD') {
            let safeVideoUrl = attrUrl(r.videoUrl || '');
            let shortUrl = escapeHtml((r.videoUrl || '').substring(0, 50));
            return `
                <div class="request-card" style="border-left:4px solid #1c2031;">
                    <div class="request-header">
                        <strong>📺 АНГИ НЭМЭХ ХҮСЭЛТ</strong>
                        <span class="badge" style="background:#1c2031;color:#fff;">Анги ${r.epNum}</span>
                    </div>
                    <h4>${escapeHtml(r.movieTitle)} · <span style="color:var(--text-muted);font-size:13px;">${escapeHtml(r.epTitle)}</span></h4>
                    <p style="font-size:12px;color:var(--text-muted);">Видео: <a href="${safeVideoUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--primary);">${shortUrl}...</a></p>
                    <p style="font-size:12px;">Илгээсэн: <strong>${escapeHtml(r.senderName)}</strong> · ${new Date(r.createdAt).toLocaleString('mn-MN')}</p>
                    <div style="display:flex;gap:10px;margin-top:10px;">
                        <button onclick="approveEpisodeRequest(${r.id})" style="background:#00c388;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-weight:bold;">✅ Нэмэх</button>
                        <button onclick="rejectRequest(${r.id})" style="background:#ef4444;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;">❌ Татгалзах</button>
                    </div>
                </div>`;
        }
        return '';
    }).join('');
}

// ── 2 Admin race condition хамгаалалт ─────────────────────────────
// 1) Шалгах боломжтой бүхнийг эхлээд шалгана
// 2) status='approved' болгож "түгжинэ" — 2 admin зэрэг дарвал эхнийх нь л амжина
// 3) Эрх/кино/анги нэмнэ. Энэ алхам бүтэлгүйтвэл түгжээг буцааж pending болгоно
function dropLocalRequest(reqId) {
    requests = requests.filter(r => r.id !== reqId);
    renderAdminRequests();
    updateRequestBadge();
}

function markLocalRequestApproved(reqId) {
    let r = requests.find(req => req.id === reqId);
    if (r) r.status = 'approved';
}

// DB-аас хүсэлтийг шинээр татна (local state-д найдахгүй). pending биш бол null
async function fetchPendingRequest(reqId) {
    const { data, error } = await supabaseClient
        .from('requests').select('*').eq('id', reqId).single();
    if (error || !data) {
        showToast('Хүсэлт олдсонгүй!', 'error');
        return null;
    }
    if (data.status !== 'pending') {
        dropLocalRequest(reqId);
        showToast('Энэ хүсэлтийг аль хэдийн шийдвэрлэсэн байна!', 'error');
        return null;
    }
    return data;
}

// pending → approved. Өөр admin түрүүлсэн эсвэл алдаа гарвал false
async function lockRequest(reqId) {
    // 0 мөр шинэчлэгдэхэд Supabase error буцаадаггүй тул .select()-ээр шалгана
    const { data: locked, error } = await supabaseClient
        .from('requests').update({ status: 'approved' })
        .eq('id', reqId).eq('status', 'pending').select('id');
    if (error) {
        showToast('Баталгаажуулахад алдаа гарлаа!', 'error');
        return false;
    }
    if (!locked?.length) {
        dropLocalRequest(reqId);
        showToast('Энэ хүсэлтийг аль хэдийн баталгаажуулсан байна!', 'error');
        return false;
    }
    return true;
}

// Түгжсэний дараах алхам бүтэлгүйтвэл хүсэлтийг дахин pending болгоно
async function unlockRequest(reqId) {
    const { error } = await supabaseClient
        .from('requests').update({ status: 'pending' }).eq('id', reqId);
    if (error) console.error('Хүсэлтийг pending болгож чадсангүй:', error);
}

// Төлбөрийн хүсэлтийн эрхийг (VIP хугацаа / түрээс) хэрэглэгчид нээнэ, user объектыг шинэчилнэ.
// role-ыг өөрчлөхгүй — VIP-ийг vipExpires-ээр шалгадаг, модератор VIP авахад эрхээ алдахгүй.
// Алдаа гарвал error буцаана.
async function grantPaymentToUser(user, req) {
    if (req.paymentType === 'VIP') {
        let days      = getVipDays(req.code);
        let currentMs = user.vipExpires ? Number(new Date(user.vipExpires)) : 0;
        let base      = currentMs > Date.now() ? currentMs : Date.now();
        let newExpiry = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
        const { error } = await supabaseClient.from('profile')
            .update({ vipExpires: newExpiry }).eq('id', user.id);
        if (error) return error;
        user.vipExpires = newExpiry;
        emailVipApproved(user, req.code, new Date(newExpiry).toLocaleDateString('mn-MN'));
    } else if (req.paymentType === 'RENT') {
        let rentedMovies = user.rentedMovies || [];
        if (!rentedMovies.includes(req.code)) {
            rentedMovies = [...rentedMovies, req.code];
            const { error } = await supabaseClient.from('profile')
                .update({ rentedMovies }).eq('id', user.id);
            if (error) return error;
            user.rentedMovies = rentedMovies;
            let movie = movies.find(m => m.code === req.code);
            if (movie) emailRentApproved(user, movie.title);
        }
    }
    return null;
}

async function approveRequest(reqId) {
    if (!await verifyIsAdmin()) return;

    const freshReq = await fetchPendingRequest(reqId);
    if (!freshReq) return;

    // Хэрэглэгчийн ШИНЭ өгөгдлийг түгжихээс өмнө авна
    const { data: freshUser } = await supabaseClient
        .from('profile').select('*').eq('id', freshReq.userId).single();
    if (!freshUser) return showToast('Хэрэглэгч олдсонгүй!', 'error');

    if (!await lockRequest(reqId)) return;

    const grantErr = await grantPaymentToUser(freshUser, freshReq);
    if (grantErr) {
        console.error('Эрх нээх алдаа:', grantErr);
        await unlockRequest(reqId);
        return showToast('Эрх нээхэд алдаа: ' + grantErr.message, 'error');
    }

    // Approve хийж буй admin нь тухайн хэрэглэгч өөрөө бол local state шинэчилнэ
    if (currentUser && currentUser.id === freshUser.id) {
        currentUser.vipExpires   = freshUser.vipExpires;
        currentUser.rentedMovies = freshUser.rentedMovies;
        sessionStorage.setItem('nova_current_user', JSON.stringify(currentUser));
        checkAuthUI();
        renderUserProfile();
    }

    markLocalRequestApproved(reqId);
    renderAdminRequests();
    updateRequestBadge();
    showToast('Хүсэлт баталгаажлаа!');
}

async function approveMovieRequest(reqId) {
    if (!await verifyIsAdmin()) return;

    const freshReq = await fetchPendingRequest(reqId);
    if (!freshReq) return;

    // Код давхцвал түгжихээс өмнө зогсооно
    const { data: dup } = await supabaseClient
        .from('movies').select('id').eq('code', freshReq.code).limit(1);
    if (dup?.length) return showToast(`"${freshReq.code}" код аль хэдийн бүртгэлтэй байна!`, 'error');

    if (!await lockRequest(reqId)) return;

    let newMovie = {
        title: freshReq.title, desc: freshReq.desc, price: freshReq.price,
        code: freshReq.code, category: freshReq.category,
        status: freshReq.movieStatus || 'Үргэлжилж байгаа',
        cover: freshReq.cover || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400',
        views: 0, episodes: [], isTrending: false, isNew: true
    };

    const { data: inserted, error: movieErr } = await supabaseClient
        .from('movies').insert(newMovie).select('id').single();
    if (movieErr || !inserted) {
        console.error('Movie insert алдаа:', movieErr);
        await unlockRequest(reqId);
        return showToast('Кино нэмэхэд алдаа: ' + (movieErr?.message || 'тодорхойгүй'), 'error');
    }
    newMovie.id = inserted.id;
    newMovie.episode_count = 0;

    movies.push(newMovie);
    markLocalRequestApproved(reqId);

    renderAdminRequests();
    renderHomeMovies();
    updateRequestBadge();
    showToast('Кино нийтлэгдлээ!');
}

async function approveEpisodeRequest(reqId) {
    if (!await verifyIsAdmin()) return;

    const freshReq = await fetchPendingRequest(reqId);
    if (!freshReq) return;

    // Ангийн дугаар давхцвал түгжихээс өмнө зогсооно
    const existing = await fetchEpisodes(freshReq.movieId);
    if (existing.some(e => e.num === freshReq.epNum)) {
        return showToast('Энэ ангийн дугаар аль хэдийн байна!', 'error');
    }

    if (!await lockRequest(reqId)) return;

    let episodes;
    try {
        episodes = await addEpisodeAtomic(freshReq.movieId, {
            num: freshReq.epNum, title: freshReq.epTitle, file: freshReq.videoUrl, thumb: ''
        });
    } catch (err) {
        console.error('Анги нэмэх алдаа:', err);
        await unlockRequest(reqId);
        return showToast('Анги нэмэхэд алдаа: ' + err.message, 'error');
    }

    let m = movies.find(mv => mv.id === freshReq.movieId);
    if (m) { m.episodes = episodes; m.episode_count = episodes.length; }
    markLocalRequestApproved(reqId);

    renderAdminRequests();
    renderHomeMovies();
    updateRequestBadge();
    showToast(`${m?.title || freshReq.movieTitle} кинонд Анги ${freshReq.epNum} нэмэгдлээ!`);
}

async function adminDeleteEpisode(movieId, epNum) {
    // verifyIsAdmin() confirm dialog харуулахаас ӨМНӨ шалгана
    if (!await verifyIsAdmin()) return;
    showConfirm(
        `Анги ${epNum}-г устгахдаа итгэлтэй байна уу?`,
        async () => {
            let episodes;
            try {
                episodes = await removeEpisodeAtomic(movieId, epNum);
            } catch (err) {
                console.error('Анги устгах алдаа:', err);
                return showToast('Анги устгахад алдаа: ' + err.message, 'error');
            }
            let m = movies.find(mv => mv.id === movieId);
            if (m) { m.episodes = episodes; m.episode_count = episodes.length; }

            renderAdminMovieList();
            renderHomeMovies();
            showToast('Анги устгагдлаа.');
        },
        'Анги устгах', 'Тийм, устгах'
    );
}

async function rejectRequest(reqId) {
    if (!await verifyIsAdmin()) return; // SERVER-SIDE ШАЛГАЛТ

    // Зөвхөн pending хүсэлтийг татгалзана — өөр admin баталсныг дарж бичихгүй
    const { data: rejected, error } = await supabaseClient
        .from('requests').update({ status: 'rejected' })
        .eq('id', reqId).eq('status', 'pending').select('id');
    if (error) {
        console.error('Supabase request reject алдаа:', error);
        return showToast('Татгалзахад алдаа: ' + error.message, 'error');
    }
    if (!rejected?.length) {
        dropLocalRequest(reqId);
        return showToast('Энэ хүсэлтийг аль хэдийн шийдвэрлэсэн байна!', 'error');
    }

    let r = requests.find(req => req.id === reqId);
    if (r) r.status = 'rejected';

    renderAdminRequests();
    updateRequestBadge();
    showToast('Хүсэлт татгалзагдлаа.', 'error');
}

function updateRequestBadge() {
    let el = document.getElementById('reqBadgeCount');
    if (el) el.innerText = requests.filter(r => r.status === 'pending').length;
    updateBellDot();
}

// ===== 🔔 МЭДЭГДЭЛ =====
// Хэрэглэгчийн төлбөрийн хүсэлтүүдийн төлөв (хүлээгдэж / баталгаажсан / татгалзсан).
// Харсан төлвийг localStorage-д хадгалж, шинэ өөрчлөлт байвал хонх дээр цэг харуулна.
// Админд мөн шийдвэрлээгүй хүсэлтүүдийн тоог харуулна.
let myNotifications = [];

const VIP_PACKAGE_LABELS = Object.fromEntries(VIP_PLANS.map(p => [p.code, `VIP · ${p.title}`]));
const NOTIF_STATUS = {
    pending:  { text: 'Хүлээгдэж байна', icon: 'fa-clock',        cls: 'pending' },
    approved: { text: 'Эрх нээгдлээ',    icon: 'fa-check-circle', cls: 'approved' },
    rejected: { text: 'Татгалзсан',      icon: 'fa-times-circle', cls: 'rejected' },
};

function readSeenNotifs() {
    try { return JSON.parse(localStorage.getItem('goykino_notif_seen_' + currentUser?.id) || '{}'); }
    catch (_) { return {}; }
}

function writeSeenNotifs(seen) {
    try { localStorage.setItem('goykino_notif_seen_' + currentUser?.id, JSON.stringify(seen)); }
    catch (_) { /* хадгалж чадахгүй бол цэг дахин гарна — өөр асуудалгүй */ }
}

async function loadNotifications() {
    if (!currentUser) { myNotifications = []; updateBellDot(); return; }
    const { data, error } = await supabaseClient
        .from('requests')
        .select('id, paymentType, code, amount, status, createdAt')
        .eq('userId', currentUser.id).eq('type', 'PAYMENT')
        .order('id', { ascending: false }).limit(15);
    if (error) { console.warn('Мэдэгдэл татах алдаа:', error.message); return; }
    myNotifications = data || [];
    updateBellDot();
    if (!document.getElementById('notifPanel')?.classList.contains('hidden')) renderNotifications();
}

function adminPendingCount() {
    return currentUser?.role === 'admin' ? requests.filter(r => r.status === 'pending').length : 0;
}

function updateBellDot() {
    let dot = document.getElementById('bellDot');
    if (!dot) return;
    let seen = readSeenNotifs();
    let hasNew = myNotifications.some(n => seen[n.id] !== n.status) || adminPendingCount() > 0;
    dot.classList.toggle('hidden', !currentUser || !hasNew);
}

function renderNotifications() {
    let panel = document.getElementById('notifPanel');
    if (!panel) return;
    let seen  = readSeenNotifs();
    let items = '';

    let pending = adminPendingCount();
    if (pending > 0) {
        items += `
            <button class="notif-item notif-admin" onclick="openAdminRequestsFromNotif()">
                <i class="fas fa-inbox"></i>
                <div class="notif-body">
                    <div class="notif-title">${pending} шинэ хүсэлт хүлээгдэж байна</div>
                    <div class="notif-sub">Админ удирдлага руу орох</div>
                </div>
            </button>`;
    }

    items += myNotifications.map(n => {
        let st    = NOTIF_STATUS[n.status] || NOTIF_STATUS.pending;
        let label = n.paymentType === 'VIP'
            ? (VIP_PACKAGE_LABELS[n.code] || n.code)
            : `"${movies.find(m => m.code === n.code)?.title || n.code}" түрээс`;
        let isNew = seen[n.id] !== n.status;
        return `
            <div class="notif-item ${isNew ? 'unread' : ''}">
                <i class="fas ${st.icon} notif-status-${st.cls}"></i>
                <div class="notif-body">
                    <div class="notif-title">${escapeHtml(label)}</div>
                    <div class="notif-sub"><span class="notif-status-${st.cls}">${st.text}</span> · ${new Date(n.createdAt).toLocaleDateString('mn-MN')}</div>
                </div>
            </div>`;
    }).join('');

    panel.innerHTML = `
        <div class="notif-head">Мэдэгдэл</div>
        ${items || '<div class="notif-empty"><i class="far fa-bell-slash"></i> Мэдэгдэл алга байна</div>'}`;
}

function toggleNotifications(event) {
    event.stopPropagation();
    let panel = document.getElementById('notifPanel');
    let opening = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !opening);
    if (!opening) return;

    renderNotifications();
    // Нээж харсан тул одоогийн төлвүүдийг "харсан" гэж тэмдэглэнэ
    let seen = readSeenNotifs();
    myNotifications.forEach(n => { seen[n.id] = n.status; });
    writeSeenNotifs(seen);
    updateBellDot();
}

function openAdminRequestsFromNotif() {
    document.getElementById('notifPanel').classList.add('hidden');
    showPage('adminPage');
    switchAdminTab('requestsTab');
}

// Панелаас гадуур дарахад хаана
document.addEventListener('click', (e) => {
    let wrap = document.getElementById('headerBellWrap');
    if (wrap && !wrap.contains(e.target)) document.getElementById('notifPanel')?.classList.add('hidden');
});

// ===== SUPABASE ӨГӨГДӨЛ АЧААЛЛАХ =====
// Хүсэлтүүд: зөвхөн админд, зөвхөн pending-ийг татна (бусдын нэр/утас задрахгүй)
async function loadPendingRequests() {
    if (currentUser?.role !== 'admin') { requests = []; return; }
    const { data: reqData, error: reqErr } = await supabaseClient
        .from('requests').select('*').eq('status', 'pending');
    if (!reqErr && Array.isArray(reqData)) requests = reqData;
}

async function loadInitialDataFromSupabase() {
    // ЗАСАЛ 1+3: Бүх хэрэглэгч татахгүй, кино 100-аар хязгаарлах (pagination)
    // episodes-ийг эхэнд татахгүй — кино нээхэд л татна (lazy load)
    const fetchFirstPage = () => supabaseClient
        .from('movies')
        .select(MOVIE_LIST_COLUMNS)
        .order('id', { ascending: false })
        .limit(100);
    let { data: moviesData, error: moviesErr } = await fetchFirstPage();
    if (moviesErr && MOVIE_LIST_COLUMNS !== MOVIE_BASE_COLUMNS) {
        // episode_count багана хараахан байхгүй (security.sql ажиллуулаагүй) — түүнгүйгээр дахин татна
        console.warn('episode_count багана байхгүй — supabase/security.sql-ийг ажиллуулна уу.', moviesErr.message);
        MOVIE_LIST_COLUMNS = MOVIE_BASE_COLUMNS;
        ({ data: moviesData, error: moviesErr } = await fetchFirstPage());
    }
    if (!moviesErr && Array.isArray(moviesData) && moviesData.length > 0) {
        movies = moviesData;
        hasMoreMovies = moviesData.length === 100; // 100-аас цөөн ирвэл дараагийн хуудас байхгүй
        moviesPage = 0;
    }

    // Зөвхөн нэвтэрсэн хэрэглэгчийн өөрийн мэдээллийг татах
    if (currentUser) {
        const { data: fresh, error: freshErr } = await supabaseClient
            .from('profile').select('*').eq('id', currentUser.id).single();
        if (!freshErr && fresh) {
            currentUser = fresh;
            sessionStorage.setItem('nova_current_user', JSON.stringify(currentUser));
        }
    }

    await Promise.all([loadPendingRequests(), loadBanners()]);

    // ЗАСАЛ 4: renderAllMoviesPage() энд дуудахгүй — showPage('allMoviesPage') дуудахад л render хийнэ
    // Давхар render гарахаас сэргийлнэ
    renderHomeMovies();
    updateRequestBadge();
}

// ===== НЭМЭЛТ КИНО АЧААЛЛАХ (Load More) =====
let moviesPage = 0;
let hasMoreMovies = true; // Server-т цаашид кино байгаа эсэх

async function loadMoreMovies() {
    if (!hasMoreMovies) return;
    moviesPage++;
    const { data, error } = await supabaseClient
        .from('movies')
        .select(MOVIE_LIST_COLUMNS)
        .order('id', { ascending: false })
        .range(moviesPage * 100, moviesPage * 100 + 99);
    if (!error && Array.isArray(data)) {
        if (data.length > 0) movies = [...movies, ...data];
        // 100-аас цөөн ирвэл дараагийн хуудас байхгүй
        if (data.length < 100) hasMoreMovies = false;
        renderAllMoviesPage();
        renderHomeMovies();
    }
}