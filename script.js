// ===== SUPABASE ТОХИРГОО =====
const SUPABASE_URL = 'https://mnglegavqvpysofyezwm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uZ2xlZ2F2cXZweXNvZnllendtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NzA3NjcsImV4cCI6MjA5NzU0Njc2N30.X64AGOH8i-d_CKiC3SHYaSMNdMqvgxiYzMcu-YB8iks';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cloudflare R2 тохиргоо (public bucket URL)
const R2_PUBLIC_URL = 'https://YOUR_R2_BUCKET.r2.dev';

// EmailJS тохиргоо — хэрэгтэй бол https://emailjs.com дээр тохируулна уу
const EMAILJS_SERVICE_ID = 'YOUR_EMAILJS_SERVICE_ID';
const EMAILJS_TEMPLATE_ID = 'YOUR_EMAILJS_TEMPLATE_ID';
const EMAILJS_PUBLIC_KEY = 'YOUR_EMAILJS_PUBLIC_KEY';

// ===== ДОТООД ӨГӨГДЛИЙН ХАДГАЛАЛТ =====
let movies = JSON.parse(localStorage.getItem('nova_movies')) || [
    {
        id: 1, title: 'Solo Leveling',
        desc: 'Дэлхийн хамгийн сул ангууч хэрхэн хүчирхэгжсэн бэ...',
        price: 0, code: 'SL-01', category: 'web',
        status: 'Үргэлжилж байгаа', views: 1540,
        cover: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400',
        episodes: [
            { num: 1, title: '1-р анги', file: 'https://www.w3schools.com/html/mov_bbb.mp4', thumb: '' },
            { num: 2, title: '2-р анги', file: 'https://www.w3schools.com/html/movie.mp4', thumb: '' }
        ],
        isTrending: true, isNew: true
    },
    {
        id: 2, title: 'Crash Landing on You',
        desc: 'Өмнөд Солонгосын баян өв залгамжлагч бүсгүй шүхрээр нисэж яваад Хойд Солонгост очиход...',
        price: 2500, code: 'CL-99', category: 'drama',
        status: 'Дууссан', views: 890,
        cover: 'https://images.unsplash.com/photo-1533488765986-dfa2a9939acd?w=400',
        episodes: [
            { num: 1, title: '1-р анги', file: 'https://www.w3schools.com/html/mov_bbb.mp4', thumb: '' }
        ],
        isTrending: true, isNew: false
    }
];

let users = [];
let requests = JSON.parse(localStorage.getItem('nova_requests')) || [];
let currentUser = JSON.parse(sessionStorage.getItem('nova_current_user')) || null;
let currentSelectedMovieId = null;
let tempSelectedAvatarUrl = '';
let currentActiveCategory = 'all';
let tempSelectedVideoFile = '';
let tempSelectedCoverFile = '';
let tempSelectedEpThumb = '';
let adminSelectedSeriesId = null;
let adminEditingMovieId = null;
let adminActiveTab = 'moviesTab';

// FIX #6: Confirm modal state
let confirmCallback = null;

// ===== APP ЭХЛҮҮЛЭХ =====
window.onload = async function () {
    if (typeof emailjs !== 'undefined') {
        emailjs.init(EMAILJS_PUBLIC_KEY);
    }

    // Sidebar overlay нэмэх
    let overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.id = 'sidebarOverlay';
    overlay.onclick = closeSidebar;
    document.body.appendChild(overlay);

    // FIX #4: Supabase Auth session шалгах (race condition засах)
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

    // Password recovery email линкийг барих
    supabaseClient.auth.onAuthStateChange((event, _session) => {
        if (event === 'PASSWORD_RECOVERY') {
            ['forgotStep1', 'forgotStep2'].forEach(id => {
                let el = document.getElementById(id);
                if (el) el.classList.add('hidden');
            });
            let step3 = document.getElementById('forgotStep3');
            if (step3) step3.classList.remove('hidden');
            openModal('forgotModal');
        }
    });

    // FIX #3: await — өгөгдөл дуусахыг хүлээж нэвтрэх боломж гарч ирнэ
    await loadInitialDataFromSupabase();
    checkAuthUI();
    updateRequestBadge();
    showPage('homePage');
};

// ===== CAROUSEL =====
let carouselIndex = 0;
let carouselAutoTimer = null;

function renderCarousel() {
    let track = document.getElementById('carouselTrack');
    let dotsEl = document.getElementById('carouselDots');
    if (!track || !dotsEl) return;

    let featured = movies.filter(m => m.isTrending || m.isNew).slice(0, 6);
    if (featured.length === 0) {
        document.getElementById('homeCarousel').style.display = 'none';
        return;
    }
    document.getElementById('homeCarousel').style.display = 'block';

    track.innerHTML = featured.map((m) => {
        let cover = m.cover || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800';
        let badge = m.price === 0
            ? `<span class="carousel-badge" style="background:#10b981;">Үнэгүй</span>`
            : `<span class="carousel-badge" style="background:var(--vip-color);color:#000;">${m.price.toLocaleString()} ₮</span>`;
        return `
            <div class="carousel-slide" onclick="showMovieProfile(${m.id})">
                <img src="${cover}" alt="${m.title}" class="carousel-img">
                <div class="carousel-overlay">
                    <div class="carousel-content">
                        ${badge}
                        <h2 class="carousel-title">${m.title}</h2>
                        <p class="carousel-desc">${(m.desc || '').substring(0, 100)}${m.desc && m.desc.length > 100 ? '...' : ''}</p>
                        <button class="btn-main" style="margin-top:10px;" onclick="event.stopPropagation();showMovieProfile(${m.id})">
                            <i class="fas fa-play"></i> Үзэх
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    dotsEl.innerHTML = featured.map((_, i) =>
        `<span class="carousel-dot ${i === 0 ? 'active' : ''}" onclick="carouselGoTo(${i})"></span>`
    ).join('');

    carouselIndex = 0;
    updateCarouselPosition();
    startCarouselAuto(featured.length);
}

function updateCarouselPosition() {
    let track = document.getElementById('carouselTrack');
    if (track) track.style.transform = `translateX(-${carouselIndex * 100}%)`;
    document.querySelectorAll('.carousel-dot').forEach((d, i) => {
        d.classList.toggle('active', i === carouselIndex);
    });
}

function carouselMove(dir) {
    let slides = document.querySelectorAll('.carousel-slide');
    if (!slides.length) return;
    carouselIndex = (carouselIndex + dir + slides.length) % slides.length;
    updateCarouselPosition();
}

function carouselGoTo(idx) {
    carouselIndex = idx;
    updateCarouselPosition();
}

function startCarouselAuto(len) {
    if (carouselAutoTimer) clearInterval(carouselAutoTimer);
    carouselAutoTimer = setInterval(() => {
        carouselIndex = (carouselIndex + 1) % len;
        updateCarouselPosition();
    }, 4500);
}

// ===== САНАЛ БОЛГОХ КИНО =====
function renderRecommendedMovies(currentId) {
    let container = document.getElementById('recommendedMoviesList');
    if (!container) return;
    let recs = movies.filter(m => m.id !== currentId).slice(0, 8);
    if (recs.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">Санал болгох кино байхгүй.</p>';
        return;
    }
    container.innerHTML = recs.map(m => {
        let cover = m.cover || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=200';
        let price = m.price === 0
            ? '<span style="color:#10b981;font-size:11px;">Үнэгүй</span>'
            : `<span style="color:var(--vip-color);font-size:11px;">${m.price.toLocaleString()} ₮</span>`;
        return `
            <div class="rec-movie-item" onclick="showMovieProfile(${m.id})">
                <img src="${cover}" alt="${m.title}" class="rec-movie-thumb">
                <div class="rec-movie-info">
                    <div class="rec-movie-title">${m.title}</div>
                    <div>${price}</div>
                    <div style="font-size:10px;color:var(--text-muted);">${m.category === 'drama' ? 'Цуврал' : 'Вэбтун'}</div>
                </div>
            </div>
        `;
    }).join('');
}

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
        movies.map(m => `<option value="${m.id}">${m.title} (${m.code})</option>`).join('');
}

// FIX #3: submitModEpisodeRequest — Supabase sync нэмсэн
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
        id: Date.now(), type: 'EPISODE_ADD',
        movieId, movieTitle: m.title, movieCode: m.code,
        epNum, epTitle: epTitle || `${epNum}-р анги`, videoUrl,
        senderName: currentUser.name, senderId: currentUser.id,
        status: 'pending', createdAt: new Date().toISOString()
    };
    requests.push(newRequest);
    saveData();
    updateRequestBadge();

    const { error } = await supabaseClient.from('requests').insert({ ...newRequest });
    if (error) console.error('Supabase request insert алдаа:', error);

    document.getElementById('modEpNumber').value = '';
    document.getElementById('modEpTitle').value = '';
    document.getElementById('modEpVideoUrl').value = '';
    showToast('Анги нэмэх хүсэлт амжилттай илгээгдлээ!');
}

function saveData() {
    if (currentUser) {
        let idx = users.findIndex(u => u.id === currentUser.id);
        if (idx !== -1) users[idx] = currentUser;
    }
    localStorage.setItem('nova_movies', JSON.stringify(movies));
    localStorage.setItem('nova_users', JSON.stringify(users));
    localStorage.setItem('nova_requests', JSON.stringify(requests));
    if (currentUser) sessionStorage.setItem('nova_current_user', JSON.stringify(currentUser));
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
        adminPage: 'nav-admin', modPage: 'nav-modPanel'
    };
    let navEl = document.getElementById(navMap[pageId]);
    if (navEl) navEl.classList.add('active');

    if (pageId === 'allMoviesPage') renderAllMoviesPage();
    if (pageId === 'profilePage') renderUserProfile();
    if (pageId === 'adminPage') initAdminPanel();

    if (window.innerWidth <= 768) closeSidebar();
    window.scrollTo(0, 0);
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

// ===== МОДАЛ НЭЭХ/ХААХ =====
function openModal(modalId) {
    let modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
    }
}

function closeModal(modalId) {
    let modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }
}

function switchForm(formId) {
    ['loginForm', 'registerForm'].forEach(f => {
        let el = document.getElementById(f);
        if (el) el.classList.add('hidden');
    });
    let target = document.getElementById(formId);
    if (target) target.classList.remove('hidden');
}

// ===== FIX #6: CUSTOM CONFIRM MODAL (confirm() диалогийг орлуулах) =====
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

// ===== FIX #4: НЭВТРЭХ — Supabase Auth signInWithPassword =====
async function loginLogic() {
    let email = document.getElementById('loginEmail').value.trim();
    let pass = document.getElementById('loginPass').value;
    if (!email || !pass) return showToast('Имэйл болон нууц үгээ оруулна уу!', 'error');

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password: pass
    });

    if (error) return showToast('Имэйл эсвэл нууц үг буруу байна!', 'error');

    // Профайл татах
    const { data: profile, error: profileErr } = await supabaseClient
        .from('profile')
        .select('*')
        .eq('id', data.user.id)
        .single();

    if (profileErr || !profile) return showToast('Профайл олдсонгүй!', 'error');

    currentUser = profile;
    sessionStorage.setItem('nova_current_user', JSON.stringify(currentUser));
    closeModal('loginModal');
    checkAuthUI();
    showPage('homePage');
    showToast(`Тавтай морил, ${currentUser.name}! 👋`);
}

// ===== FIX #2 & #4: БҮРТГҮҮЛЭХ — Supabase Auth + id UUID засах =====
async function registerLogic() {
    let name = document.getElementById('regName').value.trim();
    let phone = document.getElementById('regPhone').value.trim();
    let email = document.getElementById('regEmail').value.trim();
    let pass = document.getElementById('regPass').value;

    if (!name || !phone || !email || !pass)
        return showToast('Бүх талбарыг бөглөнө үү!', 'error');

    if (pass.length < 6)
        return showToast('Нууц үг дор хаяж 6 тэмдэгт байх ёстой!', 'error');

    // Supabase Auth-р бүртгэх — нууц үгийг Supabase хэш хийнэ
    const { data, error } = await supabaseClient.auth.signUp({ email, password: pass });

    if (error) return showToast(error.message, 'error');

    // FIX #2: id-г Supabase Auth-с авна (UUID) — Date.now() биш!
    let newUser = {
        id: data.user.id,
        name,
        phone,
        email,
        role: 'user',
        vipExpires: null,
        rentedMovies: [],
        history: [],
        avatar: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
    };

    // FIX #3: Supabase profile table-д хадгалах
    const { error: profileError } = await supabaseClient.from('profile').insert(newUser);
    if (profileError) {
        console.error('Supabase profile insert алдаа:', profileError);
        return showToast('Профайл хадгалахад алдаа гарлаа: ' + profileError.message, 'error');
    }

    users.push(newUser);
    currentUser = newUser;
    sessionStorage.setItem('nova_current_user', JSON.stringify(currentUser));
    saveData();

    closeModal('loginModal');
    checkAuthUI();
    showPage('homePage');
    showToast('Бүртгэл амжилттай үүслээ! 🎉');
}

// ===== FIX #4: ГАРАХ — Supabase Auth signOut =====
async function logout() {
    await supabaseClient.auth.signOut();
    currentUser = null;
    sessionStorage.removeItem('nova_current_user');
    checkAuthUI();
    showPage('homePage');
}

// ===== ТОСТ МЭДЭГДЭЛ =====
function showToast(message, type = 'success') {
    let existing = document.getElementById('toastBox');
    if (existing) existing.remove();

    let toast = document.createElement('div');
    toast.id = 'toastBox';
    toast.style.cssText = `
        position:fixed;bottom:30px;right:20px;z-index:9999;
        background:${type === 'error' ? '#ef4444' : '#10b981'};
        color:white;padding:14px 20px;border-radius:10px;
        font-size:14px;font-weight:600;max-width:320px;
        box-shadow:0 4px 20px rgba(0,0,0,0.3);
        animation:slideIn 0.3s ease;
    `;
    toast.innerHTML = `<i class="fas fa-${type === 'error' ? 'times-circle' : 'check-circle'}"></i> ${message}`;
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
        : `<div class="badge-vip-card" style="background:#10b981;">Үнэгүй</div>`;
    let cover = m.cover || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400';
    let epCount = (m.episodes && m.episodes.length > 0)
        ? `<span style="font-size:11px;color:var(--text-muted);margin-left:5px;"><i class="fas fa-film" style="font-size:10px;"></i> ${m.episodes.length} анги</span>`
        : '';
    return `
        <div class="movie-card" onclick="showMovieProfile(${m.id})">
            ${badge}
            <img class="card-cover" src="${cover}" alt="${m.title}" loading="lazy">
            <div class="card-info">
                <div class="card-title">${m.title}</div>
                <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-top:4px;">
                    <span class="badge">${m.category === 'drama' ? 'Цуврал' : 'Вэбтун'}</span>
                    ${epCount}
                </div>
            </div>
        </div>
    `;
}

function renderHomeMovies() {
    let trendingGrid = document.getElementById('grid-trending');
    let newGrid = document.getElementById('grid-new');

    if (trendingGrid) {
        let trending = [...movies]
            .filter(m => m.isTrending)
            .sort((a, b) => (b.views || 0) - (a.views || 0))
            .slice(0, 10);
        trendingGrid.innerHTML = trending.length > 0
            ? trending.map(createMovieCard).join('')
            : '<p style="color:var(--text-muted);">Трэнд контент байхгүй байна.</p>';
    }

    if (newGrid) {
        let newest = [...movies]
            .filter(m => m.isNew)
            .sort((a, b) => (b.id || 0) - (a.id || 0))
            .slice(0, 10);
        newGrid.innerHTML = newest.length > 0
            ? newest.map(createMovieCard).join('')
            : '<p style="color:var(--text-muted);">Шинэ контент байхгүй байна.</p>';
    }

    renderCarousel();
}

function renderAllMoviesPage() {
    let grid = document.getElementById('grid-all-movies');
    if (!grid) return;
    let filtered = currentActiveCategory === 'all'
        ? movies
        : movies.filter(m => m.category === currentActiveCategory);
    grid.innerHTML = filtered.length > 0
        ? filtered.map(createMovieCard).join('')
        : '<p style="color:var(--text-muted);">Энэ ангилалд одоогоор контент байхгүй байна.</p>';
}

function filterCategory(cat, element) {
    currentActiveCategory = cat;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    if (element) element.classList.add('active');
    renderAllMoviesPage();
}

function searchMoviesHome() {
    let val = document.getElementById('mainMovieSearchInput').value.toLowerCase();
    let tGrid = document.getElementById('grid-trending');
    let nGrid = document.getElementById('grid-new');
    let filtered = movies.filter(m => m.title.toLowerCase().includes(val));
    if (tGrid) tGrid.innerHTML = filtered.filter(m => m.isTrending).map(createMovieCard).join('');
    if (nGrid) nGrid.innerHTML = filtered.filter(m => m.isNew).map(createMovieCard).join('');
}

// ===== КИНО ДЭЛГЭРЭНГҮЙ =====
function showMovieProfile(id) {
    let m = movies.find(mv => mv.id === id);
    if (!m) return;
    currentSelectedMovieId = id;
    m.views = (m.views || 0) + 1;

    if (currentUser) {
        if (!currentUser.history) currentUser.history = [];
        currentUser.history = currentUser.history.filter(hid => hid !== id);
        currentUser.history.unshift(id);
        if (currentUser.history.length > 8) currentUser.history = currentUser.history.slice(0, 8);
    }
    saveData();

    document.getElementById('mProfType').innerText = m.category === 'drama' ? 'ЦУВРАЛ КИНО' : 'ВЭБТУН / КОМИК';
    document.getElementById('mProfTitle').innerText = m.title;
    document.getElementById('mProfDesc').innerText = m.desc;
    document.getElementById('mProfStatus').innerText = m.status;
    document.getElementById('mProfViews').innerText = m.views.toLocaleString();
    document.getElementById('mProfPrice').innerText = m.price === 0 ? 'Үнэгүй' : `${m.price.toLocaleString()} ₮`;

    let cover = m.cover || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500';
    document.getElementById('mProfCoverContainer').innerHTML = `<img src="${cover}" alt="cover">`;

    closeVideoPlayer();
    renderMovieActionButtons(m);
    showPage('movieProfilePage');
    renderRecommendedMovies(id);
}

function isVipActive(user) {
    if (!user || !user.vipExpires) return false;
    return user.vipExpires > Date.now();
}

function renderMovieActionButtons(m) {
    let container = document.getElementById('movieActionButtonsContainer');
    let epBlock = document.getElementById('episodesBlockContainer');
    container.innerHTML = '';

    if (m.price === 0) {
        container.innerHTML = `<span style="color:#10b981;font-weight:bold;"><i class="fas fa-unlock"></i> Үнэгүй үзэх боломжтой</span>`;
        if (epBlock) epBlock.classList.remove('hidden');
        renderEpisodesList(m.episodes);
        return;
    }

    if (!currentUser) {
        container.innerHTML = `<button class="btn-main" onclick="openModal('loginModal')"><i class="fas fa-sign-in-alt"></i> Нэвтэрч үзэх</button>`;
        if (epBlock) epBlock.classList.add('hidden');
        return;
    }

    let hasVip = isVipActive(currentUser);
    let hasRented = currentUser.rentedMovies && currentUser.rentedMovies.includes(m.code);

    if (hasVip || hasRented) {
        container.innerHTML = `<span style="color:var(--vip-color);font-weight:bold;"><i class="fas fa-check-circle"></i> Үзэх эрх нээлттэй ${hasVip ? '(VIP)' : '(Түрээслэсэн)'}</span>`;
        if (epBlock) epBlock.classList.remove('hidden');
        renderEpisodesList(m.episodes);
    } else {
        container.innerHTML = `
            <button class="btn-vip" onclick="showPage('vipPage')"><i class="fas fa-crown"></i> VIP авах</button>
            <button class="btn-main" onclick="rentMovieDirect('${m.code}', ${m.price})"><i class="fas fa-key"></i> Түрээслэх (${m.price.toLocaleString()} ₮)</button>
        `;
        if (epBlock) epBlock.classList.add('hidden');
    }
}

function renderEpisodesList(episodes) {
    let grid = document.getElementById('mProfEpisodesGrid');
    if (!grid) return;
    if (!episodes || episodes.length === 0) {
        grid.innerHTML = `<p style="color:var(--text-muted);font-size:12px;">Анги одоогоор оруулаагүй байна.</p>`;
        return;
    }
    let sorted = [...episodes].sort((a, b) => a.num - b.num);
    grid.innerHTML = sorted.map(ep => `
        <button class="ep-btn" id="epBtn-${ep.num}" onclick="playEpisode(${ep.num}, '${ep.file}', '${ep.title || ep.num + '-р анги'}')">
            <i class="fas fa-play" style="font-size:10px;"></i><br>
            Анги ${ep.num}
            ${ep.title ? `<br><span style="font-size:10px;font-weight:400;color:var(--text-muted);">${ep.title}</span>` : ''}
        </button>
    `).join('');
}

// ===== ВИДЕО ТОГЛУУЛАГЧ =====
function playEpisode(num, file, title) {
    let videoPlayerBox = document.getElementById('videoPlayerBox');
    let myVideo = document.getElementById('myVideo');
    let nowPlaying = document.getElementById('videoNowPlayingTitle');

    if (!file || file === 'undefined' || file === '') {
        showToast('Видео файл байхгүй байна.', 'error');
        return;
    }

    if (videoPlayerBox && myVideo) {
        videoPlayerBox.classList.remove('hidden');
        myVideo.src = file;
        myVideo.load();
        myVideo.play().catch(e => {
            console.log('Автоматаар тоглуулж чадсангүй:', e);
        });

        if (nowPlaying) nowPlaying.innerHTML = `<i class="fas fa-play-circle"></i> Анги ${num} ${title ? '- ' + title : ''} тоглуулж байна...`;

        document.querySelectorAll('.ep-btn').forEach(btn => btn.classList.remove('active-ep'));
        let activeBtn = document.getElementById(`epBtn-${num}`);
        if (activeBtn) activeBtn.classList.add('active-ep');

        setTimeout(() => {
            videoPlayerBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
}

function closeVideoPlayer() {
    let videoPlayerBox = document.getElementById('videoPlayerBox');
    let myVideo = document.getElementById('myVideo');
    if (videoPlayerBox) videoPlayerBox.classList.add('hidden');
    if (myVideo) {
        myVideo.pause();
        myVideo.src = '';
    }
    document.querySelectorAll('.ep-btn').forEach(btn => btn.classList.remove('active-ep'));
}

function goBackToContent() {
    closeVideoPlayer();
    if (currentActiveCategory !== 'all') showPage('allMoviesPage');
    else showPage('homePage');
}

// ===== VIP БА ТҮРЭЭС ТӨЛБӨР =====
let activePaymentType = null;
let pendingCode = '';
let pendingAmount = 0;

function buyVipPackageAction(name, price, code) {
    if (!currentUser) return openModal('loginModal');
    activePaymentType = 'VIP';
    pendingCode = code;
    pendingAmount = price;
    document.getElementById('payAmount').innerText = `${price.toLocaleString()} ₮`;
    document.getElementById('payDetail').innerText = `${code}-${currentUser.phone}`;
    openModal('paymentModal');
}

function rentMovieDirect(movieCode, price) {
    if (!currentUser) return openModal('loginModal');
    activePaymentType = 'RENT';
    pendingCode = movieCode;
    pendingAmount = price;
    document.getElementById('payAmount').innerText = `${price.toLocaleString()} ₮`;
    document.getElementById('payDetail').innerText = `${movieCode}-${currentUser.phone}`;
    openModal('paymentModal');
}

function copyText(elementId) {
    let el = document.getElementById(elementId);
    if (!el) return;
    let text = el.innerText.trim();
    navigator.clipboard.writeText(text).then(() => {
        showToast('Амжилттай хуулагдлаа!');
    }).catch(() => {
        showToast('Хуулж чадсангүй.', 'error');
    });
}

// FIX #3: confirmPaymentSubmit — Supabase requests sync
async function confirmPaymentSubmit() {
    let newRequest = {
        id: Date.now(), type: 'PAYMENT',
        paymentType: activePaymentType, code: pendingCode,
        amount: pendingAmount,
        userId: currentUser.id,       // FIX #2: id одоо UUID байна
        userEmail: currentUser.email,
        userName: currentUser.name, userPhone: currentUser.phone,
        status: 'pending', createdAt: new Date().toISOString()
    };
    requests.push(newRequest);
    saveData();

    const { error } = await supabaseClient.from('requests').insert({ ...newRequest });
    if (error) console.error('Supabase request insert алдаа:', error);

    closeModal('paymentModal');
    updateRequestBadge();
    showToast('Төлбөрийн хүсэлт илгээгдлээ. Админ шалгаж эрхийг нээнэ.');
}

// ===== ПРОФАЙЛ =====
function renderUserProfile() {
    if (!currentUser) return;
    document.getElementById('profileNameField').innerText = currentUser.name;
    document.getElementById('profileEmail').innerText = currentUser.email;
    document.getElementById('profilePhoneField').innerText = currentUser.phone || 'Заагаагүй';
    document.getElementById('profileMainImg').src = currentUser.avatar || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';

    let roleText = '👤 Хэрэглэгч';
    if (currentUser.role === 'admin') roleText = '⚙️ Админ';
    if (currentUser.role === 'moderator') roleText = '✒️ Модератор';
    document.getElementById('profileRoleBadge').innerText = roleText;

    if (isVipActive(currentUser)) {
        document.getElementById('profileVipStatus').innerText = '👑 VIP Идэвхтэй';
        document.getElementById('profileVipTimeValue').innerText = new Date(currentUser.vipExpires).toLocaleDateString('mn-MN');
    } else {
        document.getElementById('profileVipStatus').innerText = 'Ердийн хэрэглэгч';
        document.getElementById('profileVipTimeValue').innerText = 'Хугацаа дууссан эсвэл аваагүй';
    }

    let rentedGrid = document.getElementById('profileRentedGrid');
    let renteds = movies.filter(m => currentUser.rentedMovies && currentUser.rentedMovies.includes(m.code));
    if (rentedGrid) rentedGrid.innerHTML = renteds.length > 0
        ? renteds.map(createMovieCard).join('')
        : '<p style="color:var(--text-muted);font-size:12px;padding:10px;">Түрээсэлсэн кино байхгүй.</p>';

    let historyGrid = document.getElementById('profileHistoryGrid');
    let historyList = (currentUser.history || []).map(hid => movies.find(m => m.id === hid)).filter(Boolean);
    if (historyGrid) historyGrid.innerHTML = historyList.length > 0
        ? historyList.map(createMovieCard).join('')
        : '<p style="color:var(--text-muted);font-size:12px;padding:10px;">Үзсэн түүх байхгүй.</p>';
}

function openProfileEditBox() {
    document.getElementById('editProfileName').value = currentUser.name;
    document.getElementById('editProfilePhone').value = currentUser.phone || '';
    tempSelectedAvatarUrl = currentUser.avatar || '';
    let statusEl = document.getElementById('editAvatarStatus');
    if (statusEl) statusEl.innerText = 'Сонгоогүй байна.';
    openModal('profileEditModal');
}

function previewUserAvatarFile(event) {
    let file = event.target.files[0];
    if (file) {
        let reader = new FileReader();
        reader.onload = function (e) {
            tempSelectedAvatarUrl = e.target.result;
            let statusEl = document.getElementById('editAvatarStatus');
            if (statusEl) statusEl.innerText = `✅ Сонгогдлоо: ${file.name}`;
        };
        reader.readAsDataURL(file);
    }
}

// FIX #3: saveUserProfileChanges — Supabase profile sync
async function saveUserProfileChanges() {
    let newName = document.getElementById('editProfileName').value.trim();
    let newPhone = document.getElementById('editProfilePhone').value.trim();
    if (!newName || !newPhone) return showToast('Талбаруудыг бүрэн бөглөнө үү!', 'error');
    currentUser.name = newName;
    currentUser.phone = newPhone;
    if (tempSelectedAvatarUrl) currentUser.avatar = tempSelectedAvatarUrl;
    saveData();

    const { error } = await supabaseClient
        .from('profile')
        .update({ name: currentUser.name, phone: currentUser.phone, avatar: currentUser.avatar })
        .eq('id', currentUser.id);
    if (error) console.error('Supabase profile update алдаа:', error);

    closeModal('profileEditModal');
    checkAuthUI();
    renderUserProfile();
    showToast('Мэдээлэл амжилттай шинэчлэгдлээ!');
}

// ===== НУУЦ ҮГ ХАРУУЛАХ/НУУХ =====
function togglePasswordVisibility(inputId, iconId) {
    let input = document.getElementById(inputId);
    let icon = document.getElementById(iconId);
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

// ===== FIX #4: НУУЦ ҮГ СЭРГЭЭХ — Supabase Auth resetPasswordForEmail =====
function openForgotModal() {
    closeModal('loginModal');
    ['forgotStep1', 'forgotStep2', 'forgotStep3'].forEach(id => {
        let el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    let step1 = document.getElementById('forgotStep1');
    if (step1) step1.classList.remove('hidden');

    let emailEl = document.getElementById('forgotEmail');
    let phoneEl = document.getElementById('forgotPhone');
    if (emailEl) emailEl.value = '';
    if (phoneEl) phoneEl.value = '';
    openModal('forgotModal');
}

async function recoverPasswordLogic() {
    let email = document.getElementById('forgotEmail').value.trim();
    let phone = document.getElementById('forgotPhone').value.trim();
    if (!email || !phone) return showToast('Имэйл болон утасны дугаараа оруулна уу!', 'error');

    // Хэрэглэгч байгаа эсэхийг шалгах
    let user = users.find(u => u.email === email && u.phone === phone);
    if (!user) {
        showToast('Утасны дугаар эсвэл имэйл тохирохгүй байна!', 'error');
        return;
    }

    // Supabase Auth-р нууц үг сэргээх линк илгээх
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.href.split('#')[0]
    });

    if (error) {
        showToast('Имэйл илгээхэд алдаа гарлаа: ' + error.message, 'error');
        return;
    }

    document.getElementById('forgotStep1').classList.add('hidden');
    document.getElementById('forgotStep2').classList.remove('hidden');
    let otpEmailEl = document.getElementById('otpTargetEmail');
    if (otpEmailEl) otpEmailEl.innerText = email;
    showToast('Нууц үг сэргээх линк таны имэйл рүү илгээгдлээ!');
}

// FIX #4: Supabase Auth updateUser — нууц үг шинэчлэх
async function resetPasswordLogic() {
    let newPass = document.getElementById('newPassInput').value;
    if (!newPass || newPass.length < 6) return showToast('Нууц үг дор хаяж 6 тэмдэгт байх ёстой!', 'error');

    const { error } = await supabaseClient.auth.updateUser({ password: newPass });
    if (error) {
        showToast('Нууц үг солиход алдаа гарлаа: ' + error.message, 'error');
        return;
    }

    showToast('Нууц үг амжилттай солигдлоо! Шинэ нууц үгээрээ нэвтэрнэ үү.');
    closeModal('forgotModal');
    setTimeout(() => openModal('loginModal'), 500);
}

// ===== FIX #3: submitModRequest — Supabase sync =====
async function submitModRequest() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'moderator')) {
        return showToast('Зөвхөн админ эсвэл модератор хүсэлт гаргах боломжтой!', 'error');
    }
    let title = document.getElementById('modReqTitle').value.trim();
    let desc = document.getElementById('modReqDesc').value.trim();
    let price = parseInt(document.getElementById('modReqPrice').value) || 0;
    let code = document.getElementById('modReqCode').value.trim();
    let category = document.getElementById('modReqCategory').value;
    let status = document.getElementById('modReqStatus').value;

    if (!title || !code) return showToast('Нэр болон код заавал хэрэгтэй!', 'error');

    let newRequest = {
        id: Date.now(), type: 'MOVIE_ADD', title, desc, price, code,
        category, status, senderName: currentUser.name, senderId: currentUser.id,
        createdAt: new Date().toISOString()
    };
    requests.push(newRequest);
    saveData();
    updateRequestBadge();

    const { error } = await supabaseClient.from('requests').insert({ ...newRequest });
    if (error) console.error('Supabase request insert алдаа:', error);

    document.getElementById('modReqTitle').value = '';
    document.getElementById('modReqDesc').value = '';
    document.getElementById('modReqCode').value = '';
    showToast('Кино нэмэх хүсэлтийг админд амжилттай илгээлээ!');
}

function updateRequestBadge() {
    let el = document.getElementById('reqBadgeCount');
    if (el) el.innerText = requests.filter(r => r.status === 'pending').length;
}

// ===== ADMIN =====
function switchAdminTab(tabId) {
    adminActiveTab = tabId;
    document.querySelectorAll('.admin-tabs-nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));

    let tabBtnMap = { moviesTab: 'btn-tab-movies', requestsTab: 'btn-tab-requests', usersTab: 'btn-tab-users' };
    let btn = document.getElementById(tabBtnMap[tabId]);
    if (btn) btn.classList.add('active');
    let tab = document.getElementById(tabId);
    if (tab) tab.classList.remove('hidden');
    initAdminPanel();
}

function initAdminPanel() {
    if (adminActiveTab === 'moviesTab') renderAdminMovieList();
    else if (adminActiveTab === 'usersTab') renderAdminUsersTable();
    else if (adminActiveTab === 'requestsTab') renderAdminRequests();
    updateRequestBadge();
}

function handleCoverFileSelect(event) {
    let file = event.target.files[0];
    if (file) {
        let reader = new FileReader();
        reader.onload = function (e) {
            tempSelectedCoverFile = e.target.result;
            let preview = document.getElementById('coverPreviewImg');
            let previewBox = document.getElementById('coverPreviewBox');
            if (preview) preview.src = e.target.result;
            if (previewBox) previewBox.style.display = 'block';
        };
        reader.readAsDataURL(file);
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
                let preview = document.getElementById('coverPreviewImg');
                let previewBox = document.getElementById('coverPreviewBox');
                if (preview && this.value) {
                    preview.src = this.value;
                    if (previewBox) previewBox.style.display = 'block';
                }
            };
        }
    }
}

function handleVideoFileSelect(event) {
    let file = event.target.files[0];
    if (file) {
        tempSelectedVideoFile = URL.createObjectURL(file);
        let statusText = document.getElementById('admVideoStatusText');
        if (statusText) statusText.innerText = `✅ Сонгогдсон: ${file.name}`;
    }
}

function toggleVideoUrlInput() {
    let urlInput = document.getElementById('admVideoUrl');
    if (urlInput) {
        urlInput.style.display = urlInput.style.display === 'none' ? 'block' : 'none';
        if (urlInput.style.display === 'block') {
            urlInput.focus();
            urlInput.oninput = function () {
                tempSelectedVideoFile = this.value;
                let statusText = document.getElementById('admVideoStatusText');
                if (statusText) statusText.innerText = `✅ URL оруулсан: ${this.value.substring(0, 40)}...`;
            };
        }
    }
}

function handleEpThumbSelect(event) {
    let file = event.target.files[0];
    if (file) {
        let reader = new FileReader();
        reader.onload = function (e) {
            tempSelectedEpThumb = e.target.result;
            let statusEl = document.getElementById('admThumbStatusText');
            if (statusEl) statusEl.innerText = `✅ Thumbnail: ${file.name}`;
        };
        reader.readAsDataURL(file);
    }
}

// FIX #3: adminAddEpisodeToMovie — Supabase movies sync
async function adminAddEpisodeToMovie() {
    if (!adminSelectedSeriesId) return showToast('Эхлээд жагсаалтаас кино сонгоно уу!', 'error');
    let num = parseInt(document.getElementById('admNewEpNumber').value);
    let epTitle = document.getElementById('admNewEpTitle')?.value.trim() || `${num}-р анги`;

    if (!num) return showToast('Ангийн дугаар заавал оруулна уу!', 'error');
    if (!tempSelectedVideoFile) return showToast('Видео файл эсвэл URL оруулна уу!', 'error');

    let m = movies.find(mv => mv.id === adminSelectedSeriesId);
    if (!m.episodes) m.episodes = [];
    if (m.episodes.some(e => e.num === num)) return showToast('Энэ ангийн дугаар аль хэдийн байна!', 'error');

    m.episodes.push({ num, title: epTitle, file: tempSelectedVideoFile, thumb: tempSelectedEpThumb });
    m.episodes.sort((a, b) => a.num - b.num);
    saveData();

    // FIX #3: Supabase episodes update
    const { error } = await supabaseClient
        .from('movies')
        .update({ episodes: m.episodes })
        .eq('id', adminSelectedSeriesId);
    if (error) console.error('Supabase episodes update алдаа:', error);

    document.getElementById('admNewEpNumber').value = '';
    if (document.getElementById('admNewEpTitle')) document.getElementById('admNewEpTitle').value = '';
    document.getElementById('admVideoFileInput').value = '';
    document.getElementById('admVideoStatusText').innerText = 'Файл сонгоогүй байна.';
    if (document.getElementById('admEpThumbInput')) document.getElementById('admEpThumbInput').value = '';
    if (document.getElementById('admThumbStatusText')) document.getElementById('admThumbStatusText').innerText = 'Thumbnail сонгоогүй.';
    tempSelectedVideoFile = '';
    tempSelectedEpThumb = '';

    renderAdminMovieList();
    renderHomeMovies();
    showToast(`${m.title} кинонд Анги ${num} нэмэгдлээ!`);
}

// FIX #3: adminSaveMovie — Supabase movies sync
async function adminSaveMovie() {
    let title = document.getElementById('admTitle').value.trim();
    let desc = document.getElementById('admDesc').value.trim();
    let price = parseInt(document.getElementById('admPrice').value) || 0;
    let code = document.getElementById('admManualCode').value.trim();
    let category = document.getElementById('admCategory').value;
    let status = document.getElementById('admStatus').value;
    let cover = tempSelectedCoverFile || document.getElementById('admCoverUrl')?.value || '';

    if (!title || !code) return showToast('Нэр болон код заавал хэрэгтэй!', 'error');

    if (adminEditingMovieId) {
        // Засах горим
        let m = movies.find(mv => mv.id === adminEditingMovieId);
        if (m) {
            m.title = title; m.desc = desc; m.price = price;
            m.code = code; m.category = category; m.status = status;
            if (cover) m.cover = cover;

            const { error } = await supabaseClient
                .from('movies')
                .update({ title: m.title, desc: m.desc, price: m.price,
                          code: m.code, category: m.category, status: m.status, cover: m.cover })
                .eq('id', adminEditingMovieId);
            if (error) console.error('Supabase movie update алдаа:', error);

            showToast('Киноны мэдээлэл амжилттай шинэчлэгдлээ!');
        }
        adminEditingMovieId = null;
        let btn = document.getElementById('btnAdminMovieSubmit');
        if (btn) { btn.innerText = 'Шууд нийтлэх'; btn.style.background = '#10b981'; }
    } else {
        // Шинэ кино — Supabase-д оруулж id авах
        let newMovie = {
            title, desc, price, code, category, status,
            cover: cover || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400',
            views: 0, episodes: [], isTrending: false, isNew: true
        };

        const { data: inserted, error } = await supabaseClient
            .from('movies')
            .insert(newMovie)
            .select()
            .single();

        if (!error && inserted) {
            newMovie.id = inserted.id;
        } else {
            newMovie.id = Date.now(); // Fallback
            if (error) console.error('Supabase movie insert алдаа:', error);
        }

        movies.push(newMovie);
        showToast('Шинэ кино амжилттай нэмэгдлээ!');
    }

    saveData();
    ['admTitle', 'admDesc', 'admManualCode'].forEach(id => {
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
    document.getElementById('admTitle').value = m.title;
    document.getElementById('admDesc').value = m.desc;
    document.getElementById('admPrice').value = m.price;
    document.getElementById('admManualCode').value = m.code;
    document.getElementById('admCategory').value = m.category;
    document.getElementById('admStatus').value = m.status;

    if (m.cover) {
        tempSelectedCoverFile = m.cover;
        let preview = document.getElementById('coverPreviewImg');
        let previewBox = document.getElementById('coverPreviewBox');
        if (preview) preview.src = m.cover;
        if (previewBox) previewBox.style.display = 'block';
    }

    let btn = document.getElementById('btnAdminMovieSubmit');
    if (btn) { btn.innerText = 'Өөрчлөлтийг хадгалах'; btn.style.background = '#3b82f6'; }

    switchAdminTab('moviesTab');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`Засах горим: ${m.title}`);
}

function adminSelectMovieForEpisodes(id) {
    let m = movies.find(mv => mv.id === id);
    if (!m) return;
    adminSelectedSeriesId = id;
    let display = document.getElementById('admSelectedSeriesDisplay');
    if (display) display.innerHTML = `✅ Сонгогдсон: <strong>${m.title}</strong> (${m.code}) - ${m.episodes ? m.episodes.length : 0} анги`;
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
            ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #334155;">
                <div style="font-size:11px;color:var(--text-muted);margin-bottom:5px;">Ангиуд:</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;">
                    ${m.episodes.map(ep => `
                        <div style="display:flex;align-items:center;gap:3px;background:#1e3a8a;padding:3px 6px;border-radius:4px;">
                            <span style="font-size:11px;color:#93c5fd;">${ep.num}-р анги</span>
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
                    ${m.cover ? `<img src="${m.cover}" style="width:40px;height:55px;object-fit:cover;border-radius:4px;">` : '<div style="width:40px;height:55px;background:#334155;border-radius:4px;"></div>'}
                    <div>
                        <strong style="font-size:13px;">${m.title}</strong>
                        <div style="font-size:11px;color:var(--text-muted);">${m.code} · ${m.episodes ? m.episodes.length : 0} анги · ${m.price === 0 ? 'Үнэгүй' : m.price.toLocaleString() + ' ₮'}</div>
                    </div>
                </div>
                <div style="display:flex;gap:5px;flex-wrap:wrap;">
                    <button onclick="adminSelectMovieForEpisodes(${m.id})" style="background:#8b5cf6;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">Анги+</button>
                    <button onclick="adminPrepareEditMovie(${m.id})" style="background:#f59e0b;color:#000;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;">Засах</button>
                    <button onclick="adminDeleteMovie(${m.id})" style="background:#ef4444;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">Устгах</button>
                </div>
            </div>
            ${epList}
        </div>
        `;
    }).join('');
}

// FIX #3 & #6: adminDeleteMovie — Supabase sync + confirm modal
function adminDeleteMovie(id) {
    let m = movies.find(mv => mv.id === id);
    if (!m) return;
    showConfirm(
        `"${m.title}" киног устгахдаа итгэлтэй байна уу? Ангиуд ч хамт устагдана.`,
        async () => {
            movies = movies.filter(mv => mv.id !== id);
            if (adminSelectedSeriesId === id) {
                adminSelectedSeriesId = null;
                let display = document.getElementById('admSelectedSeriesDisplay');
                if (display) display.innerText = 'Кино сонгогдоогүй байна.';
            }
            saveData();

            const { error } = await supabaseClient.from('movies').delete().eq('id', id);
            if (error) console.error('Supabase movie delete алдаа:', error);

            renderAdminMovieList();
            renderHomeMovies();
            showToast('Кино устгагдлаа.');
        },
        'Кино устгах',
        'Тийм, устгах'
    );
}

// ===== ХЭРЭГЛЭГЧДИЙН ХҮСНЭГТ =====
function renderAdminUsersTable() {
    let tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;
    tbody.innerHTML = users.map((u, idx) => {
        let vipText = u.vipExpires && u.vipExpires > Date.now()
            ? `<span style="color:#10b981;">Идэвхтэй (${new Date(u.vipExpires).toLocaleDateString('mn-MN')})</span>`
            : '<span style="color:var(--text-muted);">Ердийн</span>';

        let actionButtons = u.role !== 'admin' ? `
            <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;">
                ${u.role === 'moderator'
                    ? `<button onclick="changeUserRole('${u.email}','user')" style="background:#d97706;color:#fff;padding:4px 8px;font-size:11px;border:none;border-radius:4px;cursor:pointer;">Mod цуцлах</button>`
                    : `<button onclick="changeUserRole('${u.email}','moderator')" style="background:#3b82f6;color:#fff;padding:4px 8px;font-size:11px;border:none;border-radius:4px;cursor:pointer;">Mod болгох</button>`
                }
                <input type="number" id="vipDays-${idx}" placeholder="Хоног"
                    style="width:60px;padding:4px;font-size:11px;background:#0f172a;border:1px solid #334155;color:#fff;border-radius:4px;">
                <button onclick="adminGiveVipDays('${u.email}',${idx})" style="background:#10b981;color:#fff;padding:4px 8px;font-size:11px;border:none;border-radius:4px;cursor:pointer;">VIP өгөх</button>
                <button onclick="adminApprovePayment('${u.email}')" style="background:#8b5cf6;color:#fff;padding:4px 8px;font-size:11px;border:none;border-radius:4px;cursor:pointer;">Түрээс нээх</button>
            </div>
        ` : `<span style="color:var(--vip-color);font-weight:600;">Үндсэн Админ</span>`;

        return `
            <tr>
                <td><img src="${u.avatar || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'}"
                    style="width:28px;height:28px;border-radius:50%;margin-right:8px;vertical-align:middle;">${u.name}</td>
                <td>${u.email}</td>
                <td>${u.phone || '-'}</td>
                <td><span class="badge" style="background:#475569;color:#fff;">${(u.role || 'user').toUpperCase()}</span></td>
                <td>${vipText}</td>
                <td>${actionButtons}</td>
            </tr>
        `;
    }).join('');
}

async function adminGiveVipDays(userEmail, idx) {
    let dayInput = document.getElementById(`vipDays-${idx}`);
    let days = parseInt(dayInput.value);
    if (!days || days <= 0) return showToast('Зөв хоногийн тоо оруулна уу!', 'error');
    let u = users.find(us => us.email === userEmail);
    if (u) {
        let current = u.vipExpires && u.vipExpires > Date.now() ? u.vipExpires : Date.now();
        u.vipExpires = current + days * 24 * 60 * 60 * 1000;
        saveData();

        const { error } = await supabaseClient
            .from('profile')
            .update({ vipExpires: u.vipExpires })
            .eq('email', userEmail);
        if (error) console.error('Supabase VIP update алдаа:', error);

        renderAdminUsersTable();
        dayInput.value = '';
        showToast(`${u.name} хэрэглэгчид ${days} хоногийн VIP нэмлээ!`);
    }
}

// FIX #3: adminApprovePayment — Supabase profile + requests sync
async function adminApprovePayment(userEmail) {
    let u = users.find(us => us.email === userEmail);
    if (!u) return;
    let pendingPayments = requests.filter(r => r.userEmail === userEmail && r.type === 'PAYMENT' && r.status === 'pending');
    if (pendingPayments.length === 0)
        return showToast('Энэ хэрэглэгчид хүлээгдэж байгаа төлбөрийн хүсэлт байхгүй байна.', 'error');

    pendingPayments.forEach(r => {
        if (r.paymentType === 'VIP') {
            let vipDays = r.code === 'VIP-1M' ? 30 : r.code === 'VIP-3M' ? 90 : r.code === 'VIP-YEAR' ? 365 : 3650;
            let current = u.vipExpires && u.vipExpires > Date.now() ? u.vipExpires : Date.now();
            u.vipExpires = current + vipDays * 24 * 60 * 60 * 1000;
        } else if (r.paymentType === 'RENT') {
            if (!u.rentedMovies) u.rentedMovies = [];
            if (!u.rentedMovies.includes(r.code)) u.rentedMovies.push(r.code);
        }
        r.status = 'approved';
    });
    saveData();

    const { error: profileErr } = await supabaseClient
        .from('profile')
        .update({ vipExpires: u.vipExpires, rentedMovies: u.rentedMovies })
        .eq('id', u.id);
    if (profileErr) console.error('Supabase profile update алдаа:', profileErr);

    const reqIds = pendingPayments.map(r => r.id);
    const { error: reqErr } = await supabaseClient
        .from('requests')
        .update({ status: 'approved' })
        .in('id', reqIds);
    if (reqErr) console.error('Supabase requests update алдаа:', reqErr);

    renderAdminUsersTable();
    showToast(`${u.name} хэрэглэгчийн ${pendingPayments.length} хүсэлт баталгаажлаа!`);
}

async function changeUserRole(userEmail, newRole) {
    let u = users.find(us => us.email === userEmail);
    if (u) {
        u.role = newRole;
        saveData();

        const { error } = await supabaseClient
            .from('profile')
            .update({ role: newRole })
            .eq('email', userEmail);
        if (error) console.error('Supabase role update алдаа:', error);

        renderAdminUsersTable();
        checkAuthUI();
        showToast(`${u.name} → ${newRole === 'moderator' ? 'Модератор болголлоо ✅' : 'Энгийн хэрэглэгч болголлоо'}`);
    }
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
                        <span class="badge" style="background:#1e3a8a;color:#fff;">${r.paymentType || 'PAYMENT'}</span>
                    </div>
                    <p>Хэрэглэгч: <strong>${r.userName}</strong> (Утас: ${r.userPhone})</p>
                    <p>Код: <strong>${r.code}</strong> · Дүн: <strong style="color:#10b981;">${r.amount?.toLocaleString()} ₮</strong></p>
                    <p style="font-size:11px;color:var(--text-muted);">${new Date(r.createdAt).toLocaleString('mn-MN')}</p>
                    <div style="display:flex;gap:10px;margin-top:10px;">
                        <button onclick="approveRequest(${r.id})" style="background:#10b981;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-weight:bold;">✅ Баталгаажуулах</button>
                        <button onclick="rejectRequest(${r.id})" style="background:#ef4444;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;">❌ Татгалзах</button>
                    </div>
                </div>
            `;
        } else if (r.type === 'MOVIE_ADD') {
            return `
                <div class="request-card" style="border-left:4px solid var(--primary);">
                    <div class="request-header">
                        <strong>🎬 КИНО НЭМЭХ ХҮСЭЛТ</strong>
                        <span class="badge">${r.category === 'drama' ? 'Цуврал' : 'Вэбтун'}</span>
                    </div>
                    <h4>${r.title} (${r.code})</h4>
                    <p style="color:var(--text-muted);font-size:13px;">${r.desc}</p>
                    <p>Үнэ: <strong>${r.price === 0 ? 'Үнэгүй' : r.price.toLocaleString() + ' ₮'}</strong> · Илгээсэн: <strong>${r.senderName}</strong></p>
                    <div style="display:flex;gap:10px;margin-top:10px;">
                        <button onclick="approveMovieRequest(${r.id})" style="background:#10b981;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-weight:bold;">✅ Нийтлэх</button>
                        <button onclick="rejectRequest(${r.id})" style="background:#ef4444;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;">❌ Татгалзах</button>
                    </div>
                </div>
            `;
        } else if (r.type === 'EPISODE_ADD') {
            return `
                <div class="request-card" style="border-left:4px solid #8b5cf6;">
                    <div class="request-header">
                        <strong>📺 АНГИ НЭМЭХ ХҮСЭЛТ</strong>
                        <span class="badge" style="background:#8b5cf6;color:#fff;">Анги ${r.epNum}</span>
                    </div>
                    <h4>${r.movieTitle} · <span style="color:var(--text-muted);font-size:13px;">${r.epTitle}</span></h4>
                    <p style="font-size:12px;color:var(--text-muted);">Видео: <a href="${r.videoUrl}" target="_blank" style="color:var(--primary);">${r.videoUrl.substring(0, 50)}...</a></p>
                    <p style="font-size:12px;">Илгээсэн: <strong>${r.senderName}</strong> · ${new Date(r.createdAt).toLocaleString('mn-MN')}</p>
                    <div style="display:flex;gap:10px;margin-top:10px;">
                        <button onclick="approveEpisodeRequest(${r.id})" style="background:#10b981;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-weight:bold;">✅ Нэмэх</button>
                        <button onclick="rejectRequest(${r.id})" style="background:#ef4444;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;">❌ Татгалзах</button>
                    </div>
                </div>
            `;
        }
        return '';
    }).join('');
}

// FIX #3: approveRequest — Supabase profile + requests sync
async function approveRequest(reqId) {
    let r = requests.find(req => req.id === reqId);
    if (!r) return;
    let u = users.find(us => us.id === r.userId);
    if (u) {
        if (r.paymentType === 'VIP') {
            let days = r.code === 'VIP-1M' ? 30 : r.code === 'VIP-3M' ? 90 : r.code === 'VIP-YEAR' ? 365 : 3650;
            let current = u.vipExpires && u.vipExpires > Date.now() ? u.vipExpires : Date.now();
            u.vipExpires = current + days * 24 * 60 * 60 * 1000;

            const { error } = await supabaseClient
                .from('profile').update({ vipExpires: u.vipExpires }).eq('id', u.id);
            if (error) console.error('Supabase VIP update алдаа:', error);
        } else if (r.paymentType === 'RENT') {
            if (!u.rentedMovies) u.rentedMovies = [];
            if (!u.rentedMovies.includes(r.code)) u.rentedMovies.push(r.code);

            const { error } = await supabaseClient
                .from('profile').update({ rentedMovies: u.rentedMovies }).eq('id', u.id);
            if (error) console.error('Supabase rentedMovies update алдаа:', error);
        }
    }
    r.status = 'approved';
    saveData();

    const { error } = await supabaseClient
        .from('requests').update({ status: 'approved' }).eq('id', reqId);
    if (error) console.error('Supabase request update алдаа:', error);

    renderAdminRequests();
    updateRequestBadge();
    showToast('Хүсэлт баталгаажлаа!');
}

// FIX #3: approveMovieRequest — Supabase movies + requests sync
async function approveMovieRequest(reqId) {
    let r = requests.find(req => req.id === reqId);
    if (!r) return;
    let newMovie = {
        title: r.title, desc: r.desc, price: r.price,
        code: r.code, category: r.category, status: r.status,
        cover: r.cover || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400',
        views: 0, episodes: [], isTrending: false, isNew: true
    };

    const { data: inserted, error: movieErr } = await supabaseClient
        .from('movies').insert(newMovie).select().single();

    if (!movieErr && inserted) {
        newMovie.id = inserted.id;
    } else {
        newMovie.id = Date.now();
        if (movieErr) console.error('Supabase movie insert алдаа:', movieErr);
    }

    movies.push(newMovie);
    r.status = 'approved';
    saveData();

    const { error: reqErr } = await supabaseClient
        .from('requests').update({ status: 'approved' }).eq('id', reqId);
    if (reqErr) console.error('Supabase request update алдаа:', reqErr);

    renderAdminRequests();
    renderHomeMovies();
    updateRequestBadge();
    showToast('Кино нийтлэгдлээ!');
}

// FIX #3: approveEpisodeRequest — Supabase movies + requests sync
async function approveEpisodeRequest(reqId) {
    let r = requests.find(req => req.id === reqId);
    if (!r) return;
    let m = movies.find(mv => mv.id === r.movieId);
    if (!m) return showToast('Кино олдсонгүй!', 'error');
    if (!m.episodes) m.episodes = [];
    if (m.episodes.some(e => e.num === r.epNum)) return showToast('Энэ ангийн дугаар аль хэдийн байна!', 'error');
    m.episodes.push({ num: r.epNum, title: r.epTitle, file: r.videoUrl, thumb: '' });
    m.episodes.sort((a, b) => a.num - b.num);
    r.status = 'approved';
    saveData();

    const { error: movieErr } = await supabaseClient
        .from('movies').update({ episodes: m.episodes }).eq('id', r.movieId);
    if (movieErr) console.error('Supabase movie update алдаа:', movieErr);

    const { error: reqErr } = await supabaseClient
        .from('requests').update({ status: 'approved' }).eq('id', reqId);
    if (reqErr) console.error('Supabase request update алдаа:', reqErr);

    renderAdminRequests();
    renderHomeMovies();
    updateRequestBadge();
    showToast(`${m.title} кинонд Анги ${r.epNum} нэмэгдлээ!`);
}

// FIX #3 & #6: adminDeleteEpisode — Supabase sync + confirm modal
function adminDeleteEpisode(movieId, epNum) {
    showConfirm(
        `Анги ${epNum}-г устгахдаа итгэлтэй байна уу?`,
        async () => {
            let m = movies.find(mv => mv.id === movieId);
            if (!m) return;
            m.episodes = m.episodes.filter(e => e.num !== epNum);
            saveData();

            const { error } = await supabaseClient
                .from('movies').update({ episodes: m.episodes }).eq('id', movieId);
            if (error) console.error('Supabase episode delete алдаа:', error);

            renderAdminMovieList();
            showToast(`Анги ${epNum} устгагдлаа.`);
        },
        'Анги устгах',
        'Тийм, устгах'
    );
}

// FIX #3: rejectRequest — Supabase requests sync
async function rejectRequest(reqId) {
    let r = requests.find(req => req.id === reqId);
    if (r) {
        r.status = 'rejected';
        saveData();

        const { error } = await supabaseClient
            .from('requests').update({ status: 'rejected' }).eq('id', reqId);
        if (error) console.error('Supabase request reject алдаа:', error);

        renderAdminRequests();
        updateRequestBadge();
        showToast('Хүсэлт татгалзагдлаа.', 'error');
    }
}

// ===== SUPABASE ӨГӨГДӨЛ АЧААЛЛАХ =====
async function loadInitialDataFromSupabase() {
    // movies
    const { data: moviesData, error: moviesErr } = await supabaseClient
        .from('movies')
        .select('*')
        .order('id', { ascending: false });
    if (!moviesErr && Array.isArray(moviesData) && moviesData.length > 0) {
        movies = moviesData;
    }

    // profile (хэрэглэгчид)
    const { data: usersData, error: usersErr } = await supabaseClient
        .from('profile')
        .select('*');
    if (!usersErr && Array.isArray(usersData)) {
        users = usersData;
        // currentUser-ийг шинэчлэх (хэрэв нэвтэрсэн байвал)
        if (currentUser) {
            let freshUser = usersData.find(u => u.id === currentUser.id);
            if (freshUser) {
                currentUser = freshUser;
                sessionStorage.setItem('nova_current_user', JSON.stringify(currentUser));
            }
        }
    }

    // requests
    const { data: reqData, error: reqErr } = await supabaseClient
        .from('requests')
        .select('*');
    if (!reqErr && Array.isArray(reqData)) {
        requests = reqData;
    }

    renderHomeMovies();
    renderAllMoviesPage();
    updateRequestBadge();
}