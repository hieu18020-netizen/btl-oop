const API_URL = window.APP_CONFIG ? window.APP_CONFIG.API_URL : "https://maintenance-roman-silly-morning.trycloudflare.com/api";

// Danh mục huy hiệu (phần hiển thị). Việc ai đã đạt huy hiệu nào do BACKEND tính từ dữ liệu thật
// (hàm compute_badges trong backend.py) và trả về dưới dạng danh sách mã `badges`.
const BADGE_CATALOG = [
  {code:"rookie",       icon:"🎮", label:"Tân binh",           desc:"Chơi ván đầu tiên",                 rarity:"Thường"},
  {code:"tetris_500",   icon:"🧱", label:"Thợ xếp hình",       desc:"Đạt 500 điểm Tetris",               rarity:"Thường"},
  {code:"snake_300",    icon:"🐍", label:"Thợ săn rắn",        desc:"Đạt 300 điểm Rắn săn mồi",          rarity:"Thường"},
  {code:"chess_win",    icon:"♟️", label:"Nước cờ đầu",        desc:"Thắng 1 ván cờ vua",                rarity:"Thường"},
  {code:"friends_3",    icon:"🤝", label:"Hòa đồng",           desc:"Có 3 người bạn",                    rarity:"Hiếm"},
  {code:"chibi_3",      icon:"🐣", label:"Nhà sưu tầm",        desc:"Sở hữu 3 chibi",                    rarity:"Hiếm"},
  {code:"diamond",      icon:"💎", label:"Kim cương",          desc:"Đạt rank Kim Cương",                rarity:"Siêu hiếm"},
  {code:"top3",         icon:"👑", label:"Tinh hoa",           desc:"Lọt top 3 bảng xếp hạng",           rarity:"Siêu hiếm"},
  {code:"quest_master", icon:"🏆", label:"Nhà thám hiểm",      desc:"Hoàn thành tất cả nhiệm vụ",        rarity:"Huyền thoại"},
];

// Gắn cờ earned cho từng huy hiệu theo danh sách mã server trả về.
function badgesFor(codes){
  const got = new Set(codes || []);
  return BADGE_CATALOG.map(b => ({ ...b, earned: got.has(b.code) }));
}

function badgeCardHtml(a){
  return `
    <div class="achievement${a.earned ? "" : " locked"}">
      ${a.earned ? "" : `<span class="achv-lock" aria-hidden="true">🔒</span>`}
      <div class="icon">${a.icon}</div>
      <strong>${a.label}</strong>
      <p>${a.desc}</p>
      <span class="rarity" style="color:${rarityColor[a.rarity]}">${a.rarity}</span>
    </div>`;
}

let dbLeaderboard = [];

// ===== Hệ thống Rank theo điểm =====
// Mỗi 200 điểm = 1 bậc. 7 đại bậc đầu (Sắt, Đồng, Bạc, Vàng, Bạch Kim, Ngọc Lục Bảo, Kim Cương)
// có 4 tiểu bậc IV → I. Sau đó là Cao Thủ, Đại Cao Thủ rồi Thách Đấu (không chia tiểu bậc).
// Icon ảnh lấy trong thư mục ranks/<key>.png — tự thêm ảnh của bạn vào đó với đúng tên key bên dưới.
const RANK_STEP = 200;
const RANK_ICON_DIR = "ranks";
const RANK_TIERS = [
  { key: "iron",     name: "Sắt",             color: "#8c8c8c" },
  { key: "bronze",   name: "Đồng",            color: "#c98a52" },
  { key: "silver",   name: "Bạc",             color: "#c7d0da" },
  { key: "gold",     name: "Vàng",            color: "#e8c97a" },
  { key: "platinum", name: "Bạch Kim",        color: "#5fd0c7" },
  { key: "emerald",  name: "Ngọc Lục Bảo",    color: "#34d399" },
  { key: "diamond",  name: "Kim Cương",       color: "#60a5fa" },
];
const RANK_SUBS = ["IV", "III", "II", "I"];
const MASTER_THRESHOLD      = RANK_TIERS.length * RANK_SUBS.length * RANK_STEP; // 5600
const GRANDMASTER_THRESHOLD = MASTER_THRESHOLD + 2000;                          // 7600
const CHALLENGER_THRESHOLD  = GRANDMASTER_THRESHOLD + 2000;                     // 9600

function rankIconSrc(key) {
  return `${RANK_ICON_DIR}/${key}.png`;
}

function getRankTier(score) {
  score = Math.max(0, Number(score) || 0);

  if (score >= CHALLENGER_THRESHOLD) {
    return { key: "challenger", name: "Thách Đấu", icon: rankIconSrc("challenger"), color: "#ff6b5f" };
  }
  if (score >= GRANDMASTER_THRESHOLD) {
    return { key: "grandmaster", name: "Đại Cao Thủ", icon: rankIconSrc("grandmaster"), color: "#f05252" };
  }
  if (score >= MASTER_THRESHOLD) {
    return { key: "master", name: "Cao Thủ", icon: rankIconSrc("master"), color: "#a78bfa" };
  }

  const idx = Math.floor(score / RANK_STEP);           // bậc thứ mấy (0-based)
  const tierIdx = Math.floor(idx / RANK_SUBS.length);   // đại bậc
  const subIdx = idx % RANK_SUBS.length;                // tiểu bậc
  const tier = RANK_TIERS[tierIdx];
  return { key: tier.key, name: `${tier.name} ${RANK_SUBS[subIdx]}`, icon: rankIconSrc(tier.key), color: tier.color };
}

// Trả về thẻ <img> icon rank, dùng chung ở mọi nơi hiển thị rank (profile, tìm kiếm, bxh, bạn bè...)
function rankIconHtml(tier, size, extraClass) {
  return `<img src="${tier.icon}" alt="${esc(tier.name)}" class="rank-icon${extraClass ? " " + extraClass : ""}" style="width:${size}px;height:${size}px" onerror="this.style.display='none'">`;
}

const rarityColor = {
  "Huyền thoại":"#e8c97a",
  "Sử thi"     :"#a78bfa",
  "Siêu hiếm"  :"#a78bfa",
  "Hiếm"       :"#60a5fa",
  "Thường"     :"rgba(248,247,244,.4)",
};

const strengthColor = ["#e53e3e","#e8914a","#e8c97a","#38a169"];
const strengthLabel = ["Rất yếu","Yếu","Trung bình","Mạnh"];
const suggestions = ["ShadowFox","IronViper","NeonBlade","CrimsonAce","VoidWolf","StormKing"];

let s = {
  view        : "login",
  username    : "",
  loginPass   : "",
  nick        : "",
  avatar      : "",
  token       : "",
  gameSessionToken: "",
  userRank    : "#-",
  userMatches : 0,
  userHighScore: 0,
  userSnakeScore: 0,
  badges: [],           // mã huy hiệu đã đạt (server tính)
  showLogin   : false,
  regPass     : "",
  showReg     : false,
  confirm     : "",
  showConfirm : false,
  remember    : false,
  agree       : false,
  regOk       : false,
  filter      : "all",
  isLoading   : false,
  searchQuery : "",
  selectedGame: "tetris",
  friends        : [],
  friendsIncoming: [],
  friendsOutgoing: [],
  friendsLoaded  : false,
  quests         : [],
  questsLoaded   : false,
  notifications  : [],
  notifUnread    : 0,
  notifOpen      : false,
  notifLoaded    : false,
  notifSeen      : new Set(),   // id thông báo vừa được 'xem' khi mở chuông (vẫn tô sáng trong panel, nhưng không tính vào số trên chuông)
  notifLastId    : null,
  conversations       : [],
  conversationsLoaded : false,
  conversationsError  : false,
  activeChatError     : false,
  activeChatPublicId  : null,
  activeChatMessages  : [],
  activeChatLoading   : false,
  activeChatOldestId  : null,
  activeChatHasMore   : false,
  chatSending         : false,
  chibiFilter         : "all",
  chibiFavorites      : new Set(),
  activeChibiCodes    : new Set(), // các mã chibi đang được chọn để chạy CÙNG LÚC trên màn hình; rỗng = chưa chọn cái nào
  unlockedChibiCodes  : new Set(), // mã các chibi tài khoản đã mở khoá (lấy từ server, bảng user_chibis)
  chibisLoaded        : false,
  gold                : 0,          // số vàng của tài khoản (lấy từ server)
  claimingQuest       : false,      // đang gửi yêu cầu nhận vàng nhiệm vụ (chặn bấm đúp)
  chibiPrices         : {},         // code chibi -> giá bán (vàng), 0 = không bán
  shopBusy            : false,      // đang gửi yêu cầu mua
  shopFilter          : "all",      // bộ lọc cửa hàng: all | affordable | tên độ hiếm
  gameHistory         : [],
  gameHistorySummary  : null,
  gameHistoryLoaded   : false,
  historyFilter       : "all",
};

// Cho ChibiRunner chạy đúng/đủ khung hình theo trạng thái hiện tại của tài khoản.
// Gọi mỗi khi activeChibiCodes thay đổi (đăng nhập, khôi phục phiên, bấm "Sử dụng"/"Đi ngủ đi", đăng xuất).
// Nhiều chibi có thể cùng active -> tất cả cùng chạy song song trên màn hình.
function applyChibiRunnerState(){
  if (!window.ChibiRunner) return;
  const entries = Array.from(s.activeChibiCodes).map(code => {
    const c = CHIBI_GALLERY.find(g => g.code === code);
    return { code, frameCount: (c && c.frameCount) || 10, frameFileName: c && c.frameFileName, config: c && c.runnerConfig };
  });
  window.ChibiRunner.sync(entries);
}

// ===== Ghi nhớ đăng nhập (để F5 / mở lại tab không bị đá về trang login) =====
// - "Ghi nhớ đăng nhập" được tick -> lưu vào localStorage (tồn tại kể cả sau khi đóng trình duyệt)
// - Không tick -> lưu vào sessionStorage (chỉ tồn tại trong tab hiện tại, mất khi đóng tab)
// Backend hiện không có token phiên, nên ta chỉ lưu username + dữ liệu hiển thị (không lưu mật khẩu),
// rồi khi tải lại trang sẽ gọi API để xác thực & làm mới dữ liệu.
const SESSION_KEY = "gz_session";
const RESTORABLE_VIEWS = ["home", "games", "game", "friends", "messages", "chibi", "shop", "quests", "history"]; // các view hợp lệ để khôi phục sau F5

function saveSession(){
  if (!s.username) return;
  const view = RESTORABLE_VIEWS.includes(s.view) ? s.view : "home";
  const payload = JSON.stringify({ username: s.username, nick: s.nick, avatar: s.avatar, token: s.token, view, selectedGame: s.selectedGame, activeChibiCodes: Array.from(s.activeChibiCodes) });
  try {
    if (s.remember) {
      localStorage.setItem(SESSION_KEY, payload);
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, payload);
      localStorage.removeItem(SESSION_KEY);
    }
  } catch (err) {
    console.error("Lỗi lưu phiên đăng nhập:", err);
  }
}

function loadSession(){
  try {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function clearSession(){
  try {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch (err) { /* noop */ }
}

function logout(){
  clearSession();
  s.username = "";
  s.nick = "";
  s.avatar = "";
  s.loginPass = "";
  s.token = "";
  s.userRank = "#-";
  s.userMatches = 0;
  s.userHighScore = 0;
  s.userSnakeScore = 0;
  s.badges = [];
  dbLeaderboard = [];
  s.friends = [];
  s.friendsIncoming = [];
  s.friendsOutgoing = [];
  s.friendsLoaded = false;
  s.quests = [];
  s.questsLoaded = false;
  s.conversations = [];
  s.conversationsLoaded = false;
  s.activeChatPublicId = null;
  s.activeChatMessages = [];
  s.activeChibiCodes = new Set();
  s.unlockedChibiCodes = new Set();
  s.chibisLoaded = false;
  s.gold = 0;
  s.chibiPrices = {};
  s.gameHistory = [];
  s.gameHistorySummary = null;
  s.gameHistoryLoaded = false;
  applyChibiRunnerState();
  disconnectMessagesWS();
  stopNotifPolling();
  go("login");
}

// Khôi phục phiên đăng nhập khi mở lại trang (F5, mở tab mới...).
// Xác thực lại bằng cách gọi /api/user-stats — nếu tài khoản không còn tồn tại thì tự đăng xuất.
async function restoreSession(){
  const saved = loadSession();
  if (!saved || !saved.username) return false;

  s.username = saved.username;
  s.nick = saved.nick || saved.username;
  s.avatar = saved.avatar || "";
  s.token = saved.token || "";
  s.view = RESTORABLE_VIEWS.includes(saved.view) ? saved.view : "home";
  s.selectedGame = saved.selectedGame || "tetris";
  s.activeChibiCodes = new Set(saved.activeChibiCodes || (saved.activeChibiCode ? [saved.activeChibiCode] : []));
  applyChibiRunnerState(); // chạy lạc quan ngay từ dữ liệu đã lưu, không cần đợi mạng
  render();

  try {
    const res = await fetch(`${API_URL}/user-stats/${encodeURIComponent(s.username)}`);
    if (!res.ok) { logout(); return false; }
    const data = await res.json();
    s.userRank = data.rank;
    s.userMatches = data.total_matches;
    s.userHighScore = data.high_score || 0;
    s.userSnakeScore = data.snake_score || 0;
    s.badges = data.badges || [];
    if (data.avatar) s.avatar = data.avatar;
    s.activeChibiCodes = new Set(data.active_chibi_codes || []);
    applyChibiRunnerState(); // đồng bộ lại theo dữ liệu thật từ server (phòng khi đổi từ máy khác)
    saveSession();
    fetchLeaderboard();
    fetchFriends();
    fetchConversations();
    fetchChibis();
    if (s.view === "quests") fetchQuests();
    if (s.view === "history") fetchGameHistory();
    connectMessagesWS();
    startNotifPolling();
    render();
    return true;
  } catch (err) {
    console.error("Lỗi khôi phục phiên đăng nhập:", err);
    return true; // giữ nguyên giao diện, chỉ là chưa lấy được dữ liệu mới nhất (có thể do mất mạng)
  }
}

// Gọi các API cần đăng nhập (đổi nickname/avatar/điểm), tự gắn token vào header.
// Nếu server trả 401 (token hết hạn / không hợp lệ) thì tự đăng xuất về màn login.
async function authFetch(url, options = {}) {
  const headers = Object.assign({}, options.headers, {
    "Authorization": `Bearer ${s.token}`
  });
  const res = await fetch(url, Object.assign({}, options, { headers }));
  if (res.status === 401) {
    alert("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.");
    logout();
  }
  return res;
}

async function fetchLeaderboard() {
  try {
    const headers = s.token ? { "Authorization": `Bearer ${s.token}` } : {};
    const res = await fetch(`${API_URL}/leaderboard`, { headers });
    if (res.ok) {
      dbLeaderboard = await res.json();
      if (s.view === "home") render();
    }
  } catch (err) {
    console.error("Lỗi lấy dữ liệu xếp hạng:", err);
  }
}

async function fetchUserStats() {
  if (!s.username) return;
  try {
    const res = await fetch(`${API_URL}/user-stats/${encodeURIComponent(s.username)}`);
    if (res.ok) {
      const data = await res.json();
      s.userRank = data.rank;
      s.userMatches = data.total_matches;
      s.userHighScore = data.high_score || 0;
      s.userSnakeScore = data.snake_score || 0;
      s.badges = data.badges || [];
      s.userPublicId = data.public_id || "--------";
      if (data.avatar) s.avatar = data.avatar;
      if (data.active_chibi_codes !== undefined) {
        const incoming = new Set(data.active_chibi_codes || []);
        const same = incoming.size === s.activeChibiCodes.size && Array.from(incoming).every(c => s.activeChibiCodes.has(c));
        if (!same) {
          s.activeChibiCodes = incoming;
          applyChibiRunnerState();
        }
      }
      if (s.view === "home" || s.view === "games" || s.view === "game") render();
    }
  } catch (err) {
    console.error("Lỗi lấy thông tin profile:", err);
  }
}

// ================== BẠN BÈ ==================

async function fetchFriends(){
  if (!s.token) return;
  try {
    const res = await authFetch(`${API_URL}/friends`);
    if (res.ok) {
      const data = await res.json();
      s.friends = data.friends || [];
      s.friendsIncoming = data.incoming || [];
      s.friendsOutgoing = data.outgoing || [];
      s.friendsLoaded = true;
      if (s.view === "friends" || s.view === "home" || s.view === "games") render();
    }
  } catch (err) {
    console.error("Lỗi lấy danh sách bạn bè:", err);
  }
}

async function sendFriendRequest(publicId){
  try {
    const res = await authFetch(`${API_URL}/friends/request/${encodeURIComponent(publicId)}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.detail || "Không thể gửi lời mời kết bạn");
      return;
    }
    fetchFriends();
    openProfile(publicId); // tải lại modal để cập nhật trạng thái nút
  } catch (err) {
    console.error("Lỗi gửi lời mời kết bạn:", err);
    alert("Không kết nối được tới máy chủ Backend!");
  }
}

async function respondFriendRequest(publicId, action, fromModal){
  try {
    const res = await authFetch(`${API_URL}/friends/respond/${encodeURIComponent(publicId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.detail || "Không thể xử lý lời mời kết bạn");
      return;
    }
    await fetchFriends();
    if (fromModal) openProfile(publicId);
    else if (s.view === "friends") render();
  } catch (err) {
    console.error("Lỗi phản hồi lời mời kết bạn:", err);
    alert("Không kết nối được tới máy chủ Backend!");
  }
}

async function removeFriend(publicId, fromModal){
  try {
    const res = await authFetch(`${API_URL}/friends/${encodeURIComponent(publicId)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.detail || "Không thể huỷ kết bạn");
      return;
    }
    await fetchFriends();
    if (fromModal) openProfile(publicId);
    else if (s.view === "friends") render();
  } catch (err) {
    console.error("Lỗi huỷ kết bạn:", err);
    alert("Không kết nối được tới máy chủ Backend!");
  }
}

function friendsView(){
  const emptyRow = (icon, text) => `<div class="nav-search-empty" style="padding:2rem 1rem">
    <span class="nav-search-empty-icon">${icon}</span>${text}
  </div>`;

  const friendRow = (f, actionsHtml) => {
    const tier = getRankTier(f.high_score);
    const name = f.display_name || "Ẩn danh";
    return `<div class="friend-row">
      <button type="button" class="friend-row-main" onclick="openProfile('${esc(f.public_id)}')">
        <div class="nav-search-avatar" style="background:linear-gradient(135deg, ${tier.color}40, ${tier.color}15);border-color:${tier.color}45;color:${tier.color}">${avatarHtml(f.avatar, name.slice(0,2).toUpperCase())}</div>
        <div class="nav-search-item-info">
          <div class="nav-search-item-name">${esc(name)}</div>
          <div class="nav-search-item-id">ID: ${esc(f.public_id || "--------")}</div>
        </div>
      </button>
      <div class="friend-row-tier" style="color:${tier.color}">${rankIconHtml(tier, 18)} ${esc(tier.name)}</div>
      <div class="friend-row-actions">${actionsHtml}</div>
    </div>`;
  };

  const incomingHtml = s.friendsIncoming.length
    ? s.friendsIncoming.map(f => friendRow(f, `
        <button type="button" class="friend-btn friend-btn-accept" onclick="respondFriendRequest('${esc(f.public_id)}','accept')">Chấp nhận</button>
        <button type="button" class="friend-btn friend-btn-decline" onclick="respondFriendRequest('${esc(f.public_id)}','decline')">Từ chối</button>
      `)).join("")
    : emptyRow("📭", "Không có lời mời kết bạn nào");

  const outgoingHtml = s.friendsOutgoing.length
    ? s.friendsOutgoing.map(f => friendRow(f, `
        <button type="button" class="friend-btn friend-btn-cancel" onclick="removeFriend('${esc(f.public_id)}')">Huỷ lời mời</button>
      `)).join("")
    : emptyRow("📨", "Bạn chưa gửi lời mời nào");

  const friendsHtml = s.friends.length
    ? s.friends.map(f => friendRow(f, `
        <button type="button" class="friend-btn friend-btn-chat" onclick="goToChat('${esc(f.public_id)}')">💬 Nhắn tin</button>
        <button type="button" class="friend-btn friend-btn-remove" onclick="removeFriend('${esc(f.public_id)}')">Huỷ kết bạn</button>
      `)).join("")
    : emptyRow("🌌", "Chưa có người bạn nào — thử tìm kiếm ở thanh menu nhé!");

  return `<div class="home fade">
    <div class="gridbg fixed-grid"></div>
    ${navBar()}
    <main class="content">
      <div class="columns friends-columns">
        <section class="section">
          <div class="section-title">Bạn bè</div>
          <h3>Danh sách bạn bè (${s.friends.length})</h3>
          <div class="leaderboard friends-list">${friendsHtml}</div>
        </section>
        <section class="section">
          ${s.friendsIncoming.length ? `<div class="section-title">Lời mời kết bạn</div><h3>Đang chờ bạn phản hồi (${s.friendsIncoming.length})</h3>
          <div class="leaderboard friends-list" style="margin-bottom:1.5rem">${incomingHtml}</div>` : ""}
          <div class="section-title">Đã gửi lời mời</div>
          <h3>Đang chờ phản hồi (${s.friendsOutgoing.length})</h3>
          <div class="leaderboard friends-list">${outgoingHtml}</div>
        </section>
      </div>
    </main>
  </div>`;
}

// ================== NHIỆM VỤ ==================

async function fetchQuests(){
  if (!s.token) return;
  try {
    const res = await authFetch(`${API_URL}/quests`);
    if (res.ok) {
      const data = await res.json();
      s.quests = data.quests || [];
      s.questsLoaded = true;
      if (data.gold !== undefined) s.gold = Number(data.gold) || 0;
      if (s.view === "quests") render();
      fetchNotifications(true); // nhiệm vụ vừa hoàn thành -> thông báo mới + toast
    }
  } catch (err) {
    console.error("Lỗi lấy danh sách nhiệm vụ:", err);
  }
}

async function claimQuest(id){
  if (s.claimingQuest) return;
  s.claimingQuest = true;
  try {
    const res = await authFetch(`${API_URL}/quests/${encodeURIComponent(id)}/claim`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.detail || "Không nhận được vàng");
      fetchQuests();
      return;
    }
    const q = s.quests.find(x => x.id === id);
    if (q) q.claimed = true;
    if (data.gold !== undefined) s.gold = Number(data.gold) || 0;
  } catch (err) {
    console.error("Lỗi nhận vàng nhiệm vụ:", err);
    alert("Không kết nối được tới máy chủ Backend!");
  } finally {
    s.claimingQuest = false;
  }
  if (s.view === "quests") render();
}

function questActionHtml(q){
  const reward = Number(q.reward_gold) || 0;
  if (!q.done) {
    return `<span class="quest-reward">🪙 ${reward}</span><span class="quest-status quest-status-pending">Chưa hoàn thành</span>`;
  }
  if (q.claimed) {
    return `<span class="quest-status quest-claimed">✓ Đã nhận 🪙 ${reward}</span>`;
  }
  return `<button type="button" class="quest-claim-btn" onclick="claimQuest(${Number(q.id)})">Nhận 🪙 ${reward}</button>`;
}

function questsView(){
  const total = s.quests.length;
  const done = s.quests.filter(q => q.done).length;
  const claimable = s.quests.filter(q => q.done && !q.claimed).length;
  const pct = total ? Math.round(done * 100 / total) : 0;

  const rowsHtml = s.quests.map((q, i) => `<div class="quest-row${q.done ? " done" : ""}${q.done && !q.claimed ? " claimable" : ""}">
      <div class="quest-index">${q.done ? "✓" : i + 1}</div>
      <div class="quest-info">
        <div class="quest-title">${esc(q.title)}</div>
        <div class="quest-desc">${esc(q.description)}</div>
      </div>
      <div class="quest-actions">${questActionHtml(q)}</div>
    </div>`).join("");

  const emptyHtml = `<div class="nav-search-empty" style="padding:2rem 1rem">
    <span class="nav-search-empty-icon">${s.questsLoaded ? "📭" : "⏳"}</span>${s.questsLoaded ? "Chưa có nhiệm vụ nào" : "Đang tải nhiệm vụ..."}
  </div>`;

  return `<div class="home fade">
    <div class="gridbg fixed-grid"></div>
    ${navBar()}
    <main class="content">
      <section class="section">
        <div class="section-title">Nhiệm vụ</div>
        <h3>Hoàn thành nhiệm vụ (${done}/${total})</h3>
        <div class="quest-hint">Nhiệm vụ được hệ thống tự ghi nhận khi bạn hoàn thành. Mỗi nhiệm vụ nhận được <b>🪙 10 vàng</b> — bấm <b>Nhận</b> để lấy.${claimable ? ` Bạn có <b>${claimable}</b> phần thưởng chưa nhận!` : ""}</div>
        <div class="quest-progress"><div class="quest-progress-bar" style="width:${pct}%"></div></div>
        <div class="leaderboard quest-list">${rowsHtml || emptyHtml}</div>
      </section>
    </main>
  </div>`;
}

// ================== LỊCH SỬ CHƠI GAME ==================

async function fetchGameHistory(){
  if (!s.token) return;
  try {
    const res = await authFetch(`${API_URL}/game-history?limit=100`);
    if (res.ok) {
      const data = await res.json();
      s.gameHistory = data.history || [];
      s.gameHistorySummary = data.summary || null;
      s.gameHistoryLoaded = true;
      if (s.view === "history") render();
    }
  } catch (err) {
    console.error("Lỗi lấy lịch sử chơi:", err);
  }
}

function setHistoryFilter(f){
  s.historyFilter = f;
  render();
}

function formatPlayDuration(sec){
  const n = Math.max(0, Number(sec) || 0);
  const m = Math.floor(n / 60);
  const r = n % 60;
  return m > 0 ? `${m} phút ${r} giây` : `${r} giây`;
}

function historyRowHtml(h){
  const when = formatChatTime(h.played_at);

  if (h.game_type === "chess") {
    const resText = { win: "Thắng", loss: "Thua", draw: "Hòa" }[h.result] || "—";
    const delta = Number(h.score_delta) || 0;
    const badgeCls = delta > 0 ? "win" : (delta < 0 ? "loss" : "draw");
    const badgeText = delta > 0 ? `+${delta}` : (delta < 0 ? `${delta}` : "Hòa");
    const opp = h.opponent_name ? ` · đấu với ${esc(h.opponent_name)}` : "";
    const room = h.room_code ? ` · phòng ${esc(h.room_code)}` : "";
    return `<div class="quest-row history-row">
      <div class="quest-index history-icon">♟</div>
      <div class="quest-info">
        <div class="quest-title">Cờ vua — ${resText}</div>
        <div class="quest-desc">${when}${opp}${room}</div>
      </div>
      <span class="history-badge ${badgeCls}">${badgeText}</span>
    </div>`;
  }

  const score = Number(h.score) || 0;
  const dur = (h.duration_seconds !== null && h.duration_seconds !== undefined)
    ? ` · ${formatPlayDuration(h.duration_seconds)}` : "";
  const isSnake = h.game_type === "snake";
  return `<div class="quest-row history-row">
    <div class="quest-index history-icon">${isSnake ? "🐍" : "🧱"}</div>
    <div class="quest-info">
      <div class="quest-title">${isSnake ? "Rắn săn mồi" : "Tetris"}</div>
      <div class="quest-desc">${when}${dur}</div>
    </div>
    <span class="history-badge score">${score.toLocaleString("vi-VN")} điểm</span>
  </div>`;
}

function historyView(){
  const filters = [
    { key: "all",    label: "Tất cả" },
    { key: "tetris", label: "🧱 Tetris" },
    { key: "snake",  label: "🐍 Rắn săn mồi" },
    { key: "chess",  label: "♟ Cờ vua" },
  ];
  const list = s.gameHistory.filter(h => s.historyFilter === "all" || h.game_type === s.historyFilter);
  const sm = s.gameHistorySummary;

  const fmt = (v) => (Number(v) || 0).toLocaleString("vi-VN");
  const gameCard = (cls, icon, name, recordLabel, record, games, footer) => `
      <div class="history-game ${cls}">
        <div class="history-game-head"><span class="history-game-icon">${icon}</span><span class="history-game-name">${name}</span></div>
        <div class="history-game-stats">
          <div class="history-game-stat"><div class="history-game-num">${record}</div><div class="history-game-label">${recordLabel}</div></div>
          <div class="history-game-stat"><div class="history-game-num">${games}</div><div class="history-game-label">Số trận đã chơi</div></div>
        </div>${footer ? `<div class="history-game-foot">${footer}</div>` : ""}
      </div>`;

  const statsHtml = sm ? `<div class="history-summary">
      ${gameCard("hg-tetris", "🧱", "Tetris", "Kỷ lục", fmt(sm.tetris_best), fmt(sm.tetris_games))}
      ${gameCard("hg-snake", "🐍", "Rắn săn mồi", "Kỷ lục", fmt(sm.snake_best), fmt(sm.snake_games))}
      ${gameCard("hg-chess", "♟", "Cờ vua", "Số trận thắng", fmt(sm.chess_wins), fmt(sm.chess_games),
        `Thua <b>${fmt(sm.chess_losses)}</b> · Hòa <b>${fmt(sm.chess_draws)}</b>`)}
    </div>` : "";

  const emptyHtml = `<div class="nav-search-empty" style="padding:2rem 1rem">
    <span class="nav-search-empty-icon">${s.gameHistoryLoaded ? "📭" : "⏳"}</span>${s.gameHistoryLoaded ? "Chưa có ván chơi nào" : "Đang tải lịch sử..."}
  </div>`;

  return `<div class="home fade">
    <div class="gridbg fixed-grid"></div>
    ${navBar()}
    <main class="content">
      <section class="section">
        <div class="section-title">Lịch sử</div>
        <h3>Lịch sử chơi game</h3>
        <div class="quest-hint">Hiển thị tối đa 100 ván gần nhất, ván mới nhất ở trên cùng.</div>
        ${statsHtml}
        <div class="chibi-filters">
          ${filters.map(f => `<button type="button" class="chibi-filter-btn${s.historyFilter === f.key ? " active" : ""}" onclick="setHistoryFilter('${f.key}')">${f.label}</button>`).join("")}
        </div>
        <div class="leaderboard quest-list">${list.map(historyRowHtml).join("") || emptyHtml}</div>
      </section>
    </main>
  </div>`;
}

// ================== TIN NHẮN (Messenger) ==================

let messagesSocket = null;
let messagesReconnectTimer = null;

function totalUnreadMessages(){
  return s.conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
}

async function fetchConversations(){
  if (!s.token) return;
  try {
    const res = await authFetch(`${API_URL}/messages/conversations`);
    if (res.ok) {
      s.conversations = await res.json();
      s.conversationsLoaded = true;
      s.conversationsError = false;
      render();
    } else {
      throw new Error("HTTP " + res.status);
    }
  } catch (err) {
    console.error("Lỗi lấy danh sách hội thoại:", err);
    s.conversationsError = (err && err.message) ? err.message : true;
    // Chỉ vẽ lại khi đang ở trang Tin nhắn (render() ở trang khác, vd. đang chơi game, sẽ làm game khởi động lại).
    if (s.view === "messages") render();
  }
}

// Mở kênh realtime để nhận tin nhắn ngay khi có, không cần bấm F5.
// Tự kết nối lại (có độ trễ) nếu bị rớt mạng, miễn là vẫn còn đăng nhập.
function connectMessagesWS(){
  if (!s.token) return;
  if (messagesSocket && (messagesSocket.readyState === WebSocket.OPEN || messagesSocket.readyState === WebSocket.CONNECTING)) return;
  if (messagesReconnectTimer) { clearTimeout(messagesReconnectTimer); messagesReconnectTimer = null; }

  const wsUrl = API_URL.replace(/\/api\/?$/, "").replace(/^http/, "ws") + `/api/ws/messages?token=${encodeURIComponent(s.token)}`;
  try {
    messagesSocket = new WebSocket(wsUrl);
  } catch (err) {
    console.error("Lỗi tạo kết nối tin nhắn realtime:", err);
    return;
  }

  messagesSocket.onmessage = (event) => {
    let payload;
    try { payload = JSON.parse(event.data); } catch (err) { return; }
    if (payload.type !== "new_message") return;

    // Nếu đang mở đúng hội thoại này thì đẩy thẳng vào khung chat cho mượt.
    if (s.view === "messages" && s.activeChatPublicId === payload.public_id) {
      s.activeChatMessages.push({
        id: payload.message_id,
        is_mine: false,
        content: payload.content,
        created_at: payload.created_at
      });
      render();
      scrollChatToBottom();
      // Đang mở sẵn hội thoại này -> coi như đã đọc luôn, đồng bộ lại số chưa đọc với server.
      markConversationRead(payload.public_id);
    }
    fetchConversations(); // cập nhật tin nhắn gần nhất + số chưa đọc trên danh sách/menu
  };

  messagesSocket.onclose = () => {
    messagesSocket = null;
    if (s.token) {
      messagesReconnectTimer = setTimeout(connectMessagesWS, 3000);
    }
  };

  messagesSocket.onerror = () => {
    if (messagesSocket) messagesSocket.close();
  };
}

function disconnectMessagesWS(){
  if (messagesReconnectTimer) { clearTimeout(messagesReconnectTimer); messagesReconnectTimer = null; }
  if (messagesSocket) {
    messagesSocket.onclose = null; // tránh tự kết nối lại khi ta chủ động đóng (ví dụ lúc đăng xuất)
    messagesSocket.close();
    messagesSocket = null;
  }
}

// Gọi lại API lấy lịch sử (kèm tác dụng phụ đánh dấu đã đọc ở backend) để đồng bộ số chưa đọc,
// mà không phá dở nội dung khung chat đang hiển thị.
async function markConversationRead(publicId){
  try {
    const res = await authFetch(`${API_URL}/messages/${encodeURIComponent(publicId)}?limit=1`);
    if (res.ok) fetchConversations();
  } catch (err) { /* noop */ }
}

// Điều hướng nhanh tới khung chat với 1 người bạn (gọi từ trang Bạn bè / modal hồ sơ).
function goToChat(publicId){
  closeProfileModal();
  s.view = "messages";
  render();
  saveSession();
  fetchConversations();
  openChat(publicId);
}

async function openChat(publicId){
  s.activeChatPublicId = publicId;
  s.activeChatMessages = [];
  s.activeChatLoading = true;
  s.activeChatError = false;
  s.activeChatOldestId = null;
  s.activeChatHasMore = false;
  render();

  try {
    const res = await authFetch(`${API_URL}/messages/${encodeURIComponent(publicId)}`);
    if (!res.ok) throw new Error("Không tải được tin nhắn (HTTP " + res.status + ")");
    const data = await res.json();
    s.activeChatMessages = data.messages || [];
    s.activeChatHasMore = !!data.has_more;
    s.activeChatOldestId = s.activeChatMessages.length ? s.activeChatMessages[0].id : null;
  } catch (err) {
    console.error("Lỗi tải lịch sử tin nhắn:", err);
    s.activeChatError = (err && err.message) ? err.message : true;
  } finally {
    s.activeChatLoading = false;
    render();
    scrollChatToBottom();
    fetchConversations(); // để cập nhật lại số chưa đọc (vừa được đánh dấu đã đọc ở backend)
  }
}

async function loadOlderMessages(){
  if (!s.activeChatPublicId || !s.activeChatOldestId) return;
  const container = document.getElementById("chatMessages");
  const prevHeight = container ? container.scrollHeight : 0;
  try {
    const res = await authFetch(`${API_URL}/messages/${encodeURIComponent(s.activeChatPublicId)}?before_id=${s.activeChatOldestId}`);
    if (!res.ok) return;
    const data = await res.json();
    const older = data.messages || [];
    s.activeChatMessages = older.concat(s.activeChatMessages);
    s.activeChatHasMore = !!data.has_more;
    s.activeChatOldestId = older.length ? older[0].id : s.activeChatOldestId;
    render();
    const newContainer = document.getElementById("chatMessages");
    if (newContainer) newContainer.scrollTop = newContainer.scrollHeight - prevHeight;
  } catch (err) {
    console.error("Lỗi tải thêm tin nhắn cũ:", err);
  }
}

function scrollChatToBottom(){
  const container = document.getElementById("chatMessages");
  if (container) container.scrollTop = container.scrollHeight;
}

async function sendChatMessage(e){
  e.preventDefault();
  const input = document.getElementById("chatInput");
  const content = (input ? input.value : "").trim();
  if (!content || !s.activeChatPublicId || s.chatSending) return;

  s.chatSending = true;
  const targetId = s.activeChatPublicId;
  if (input) { input.value = ""; input.disabled = true; }

  try {
    const res = await authFetch(`${API_URL}/messages/${encodeURIComponent(targetId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.detail || "Không thể gửi tin nhắn");
      if (input) input.value = content;
    } else if (s.activeChatPublicId === targetId) {
      s.activeChatMessages.push({
        id: data.message_id,
        is_mine: true,
        content,
        created_at: data.created_at
      });
      render();
      scrollChatToBottom();
    }
    fetchConversations();
  } catch (err) {
    console.error("Lỗi gửi tin nhắn:", err);
    alert("Không kết nối được tới máy chủ Backend!");
    if (input) input.value = content;
  } finally {
    s.chatSending = false;
    const inputAgain = document.getElementById("chatInput");
    if (inputAgain) { inputAgain.disabled = false; inputAgain.focus(); }
  }
}

function formatChatTime(iso){
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return hm;
  return `${d.toLocaleDateString("vi-VN")} ${hm}`;
}

function conversationListHtml(){
  if (!s.conversationsLoaded) {
    if (s.conversationsError) {
      return `<div class="nav-search-empty" style="padding:2rem 1rem">
        <span class="nav-search-empty-icon">⚠️</span>Không tải được danh sách tin nhắn (${esc(typeof s.conversationsError === "string" ? s.conversationsError : "không kết nối được máy chủ")}).
        <div style="margin-top:.8rem"><button type="button" class="friend-btn friend-btn-add" onclick="s.conversationsError=false;render();fetchConversations()">Thử lại</button></div>
      </div>`;
    }
    return `<div class="nav-search-empty" style="padding:2rem 1rem"><span class="nav-search-spin">◌</span> Đang tải hội thoại...</div>`;
  }
  if (s.conversations.length === 0) {
    return `<div class="nav-search-empty" style="padding:2rem 1rem">
      <span class="nav-search-empty-icon">💬</span>Kết bạn để bắt đầu trò chuyện nhé!
    </div>`;
  }
  return s.conversations.map(c => {
    const isActive = s.activeChatPublicId === c.public_id;
    const name = c.display_name || "Ẩn danh";
    const preview = c.last_message
      ? `${c.last_message_is_mine ? "Bạn: " : ""}${esc(c.last_message)}`
      : `<i style="opacity:.6">Chưa có tin nhắn nào</i>`;
    return `<button type="button" class="chat-convo-item${isActive ? " active" : ""}" onclick="openChat('${esc(c.public_id)}')">
      <div class="nav-search-avatar">${avatarHtml(c.avatar, name.slice(0,2).toUpperCase())}</div>
      <div class="chat-convo-info">
        <div class="chat-convo-name">${esc(name)}</div>
        <div class="chat-convo-preview">${preview}</div>
      </div>
      <div class="chat-convo-meta">
        ${c.last_message_at ? `<span class="chat-convo-time">${formatChatTime(c.last_message_at)}</span>` : ""}
        ${c.unread_count ? `<span class="nav-badge chat-convo-badge">${c.unread_count}</span>` : ""}
      </div>
    </button>`;
  }).join("");
}

function closeActiveChat(){
  s.activeChatPublicId = null;
  render();
}

function chatPanelHtml(){
  if (!s.activeChatPublicId) {
    return `<div class="chat-empty-state">
      <span class="nav-search-empty-icon" style="font-size:32px">💬</span>
      <p>Chọn 1 người bạn ở danh sách bên trái để bắt đầu nhắn tin.</p>
    </div>`;
  }

  const convo = s.conversations.find(c => c.public_id === s.activeChatPublicId);
  const name = convo ? (convo.display_name || "Ẩn danh") : "...";
  const avatar = convo ? convo.avatar : "";

  let body;
  if (s.activeChatLoading) {
    body = `<div class="nav-search-empty" style="padding:2rem 1rem"><span class="nav-search-spin">◌</span> Đang tải tin nhắn...</div>`;
  } else if (s.activeChatError) {
    body = `<div class="nav-search-empty" style="padding:2rem 1rem">
        <span class="nav-search-empty-icon">⚠️</span>Không tải được tin nhắn (${esc(typeof s.activeChatError === "string" ? s.activeChatError : "không kết nối được máy chủ")}).
        <div style="margin-top:.8rem"><button type="button" class="friend-btn friend-btn-add" onclick="openChat('${esc(s.activeChatPublicId)}')">Thử lại</button></div>
      </div>`;
  } else {
    const loadMoreBtn = s.activeChatHasMore
      ? `<button type="button" class="chat-load-more" onclick="loadOlderMessages()">Xem tin nhắn cũ hơn</button>`
      : "";
    const bubbles = s.activeChatMessages.length
      ? s.activeChatMessages.map(m => `
        <div class="chat-bubble-row ${m.is_mine ? "mine" : "theirs"}">
          <div class="chat-bubble">${esc(m.content)}</div>
          <span class="chat-bubble-time">${formatChatTime(m.created_at)}</span>
        </div>`).join("")
      : `<div class="nav-search-empty" style="padding:2rem 1rem">
          <span class="nav-search-empty-icon">👋</span>Hãy gửi lời chào đầu tiên!
        </div>`;
    body = loadMoreBtn + bubbles;
  }

  return `
    <div class="chat-header">
      <button type="button" class="chat-back-btn" onclick="closeActiveChat()" title="Quay lại danh sách">←</button>
      <div class="nav-search-avatar">${avatarHtml(avatar, name.slice(0,2).toUpperCase())}</div>
      <button type="button" class="chat-header-name" onclick="openProfile('${esc(s.activeChatPublicId)}')">${esc(name)}</button>
    </div>
    <div class="chat-messages" id="chatMessages">${body}</div>
    <form class="chat-input-row" onsubmit="sendChatMessage(event)">
      <input type="text" id="chatInput" class="chat-input" placeholder="Nhập tin nhắn..." autocomplete="off" maxlength="2000" ${s.chatSending ? "disabled" : ""}>
      <button type="submit" class="chat-send-btn" ${s.chatSending ? "disabled" : ""}>Gửi</button>
    </form>`;
}

function messagesView(){
  return `<div class="home fade">
    <div class="gridbg fixed-grid"></div>
    ${navBar()}
    <main class="content">
      <div class="chat-app${s.activeChatPublicId ? " has-active-chat" : ""}">
        <aside class="chat-sidebar">
          <div class="section-title" style="padding:1.25rem 1.25rem 0">Tin nhắn</div>
          <h3 style="padding:0 1.25rem">Hội thoại</h3>
          <div class="chat-convo-list">${conversationListHtml()}</div>
        </aside>
        <section class="chat-panel">${chatPanelHtml()}</section>
      </div>
    </main>
  </div>`;
}

function logo(center){
  const clickable = center ? '' : ' onclick="go(\'home\')" style="cursor:pointer"';
  return `<div class="logo${center?' center-logo':''}"${clickable}>
    <div class="logo-mark">◆</div>
    <span class="logo-name">GameZone</span>
  </div>`;
}

function socialBtns(){
  return `<div class="social">
    <button type="button">🔵 Google</button>
    <button type="button">▦ Microsoft</button>
  </div>`;
}

function divider(txt){
  return `<div class="divider"><hr><span>${txt}</span><hr></div>`;
}

function pwField(id, placeholder, val, showKey, onInput){
  const type = s[showKey] ? "text" : "password";
  return `<div style="position:relative">
    <input class="input input-pw" id="${id}" type="${type}" placeholder="${placeholder}" value="${esc(val)}"
      oninput="${onInput}">
    <button class="eye" type="button" onmousedown="event.preventDefault()" onclick="toggle('${showKey}', this)">
      ${s[showKey]?"🙈":"👁"}
    </button>
  </div>`;
}

function esc(str){
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/"/g,"&quot;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/'/g,"&#39;");
}

// Hiện thông báo lỗi dạng khung chữ đỏ bên dưới form (ví dụ: sai độ dài tài khoản/mật khẩu).
function showFieldError(boxId, message){
  const box = document.getElementById(boxId);
  if (box) box.innerHTML = message ? `<div class="mismatch">${esc(message)}</div>` : "";
}

// Trả về nội dung bên trong 1 khối .avatar / .avatar-big / .player-avatar:
// nếu có ảnh đại diện thì hiện ảnh, không thì hiện chữ cái viết tắt.
function avatarHtml(avatarData, initials){
  // Chỉ chấp nhận avatar dạng data URL ảnh hợp lệ (data:image/...;base64,...).
  // Mọi giá trị khác (kể cả chuỗi bị chèn mã độc) đều bị bỏ qua, dùng chữ cái đầu thay thế.
  const isSafeImage = typeof avatarData === "string" && /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(avatarData);
  if (isSafeImage) return `<img src="${esc(avatarData)}" alt="avatar">`;
  return esc(initials);
}

function strengthBar(pw){
  if(!pw) return "";
  const score = (pw.length>=8?1:0)+(/[A-Z]/.test(pw)?1:0)+(/[0-9]/.test(pw)?1:0)+(/[^A-Za-z0-9]/.test(pw)?1:0);
  const bars = [0,1,2,3].map(i=>
    `<i style="background:${i<score?strengthColor[score-1]:"rgba(12,15,26,.1)"}"></i>`
  ).join("");
  return `<div class="strength">${bars}</div>
    <div class="strength-text" style="color:${strengthColor[score-1]}">${strengthLabel[score-1]}</div>`;
}

function checkbox(key, label){
  return `<div class="checkrow" onclick="toggle('${key}')">
    <div class="check${s[key]?' on':''}">${s[key]?"✓":""}</div>
    <span style="font-size:13px;color:rgba(12,15,26,.65);line-height:1.5">${label}</span>
  </div>`;
}

function isRegisterFormValid() {
  const usernameOk = s.username && !/\s/.test(s.username);
  const passwordOk = s.regPass && !/\s/.test(s.regPass) && /[A-Za-z]/.test(s.regPass) && /\d/.test(s.regPass);
  const confirmOk = s.confirm && s.confirm === s.regPass;
  return usernameOk && passwordOk && confirmOk && s.agree;
}

function refreshRegisterButton() {
  const btnRegister = document.getElementById("btnRegister");
  if (btnRegister) btnRegister.disabled = !isRegisterFormValid() || s.isLoading;
}

function checkUsernameFormat(val) {
  s.username = val;
  const container = document.getElementById("usernameErrorContainer");
  const error = val && /\s/.test(val) ? "Tên tài khoản không được chứa khoảng trắng" : "";
  if (container) container.innerHTML = error ? `<div class="mismatch">${esc(error)}</div>` : "";
  refreshRegisterButton();
}

function updatePasswordStrength(val) {
  s.regPass = val;
  const container = document.getElementById("strengthContainer");
  if (container) container.innerHTML = strengthBar(val);

  const errorContainer = document.getElementById("passwordErrorContainer");
  let error = "";
  if (val && /\s/.test(val)) error = "Mật khẩu không được chứa khoảng trắng";
  else if (val && !(/[A-Za-z]/.test(val) && /\d/.test(val))) error = "Mật khẩu phải có cả chữ và số";
  if (errorContainer) errorContainer.innerHTML = error ? `<div class="mismatch">${esc(error)}</div>` : "";

  checkPasswordMatch(s.confirm);
}

function checkPasswordMatch(val) {
  s.confirm = val;
  const mismatchContainer = document.getElementById("mismatchContainer");
  const isMismatch = s.confirm && s.confirm !== s.regPass;

  if (mismatchContainer) {
    mismatchContainer.innerHTML = isMismatch ? '<div class="mismatch">Mật khẩu không khớp</div>' : '';
  }
  refreshRegisterButton();
}

function leftPanel(){
  const sq=(c)=>`<i style="background:${c}"></i>`;
  return `<aside class="left">
    <div class="gridbg gridbg-abs"></div>
    <div class="glow-gold glow-abs"></div>
    <div class="ring ring-a"></div>
    <div class="ring ring-b"></div>
    ${logo()}
    <div class="left-cards">
      <div class="gcard gc-tetris">
        <span class="gc-tag">ARCADE</span>
        <div class="gc-art tetris-art">${sq("#22d3ee")}${sq("#a78bfa")}${sq("#fb923c")}${sq("#22d3ee")}</div>
        <b class="gc-name">Tetris</b><small>Xếp khối · phá kỷ lục</small>
      </div>
      <div class="gcard gc-chess">
        <span class="gc-tag">CHIẾN THUẬT</span>
        <div class="gc-art chess-art">♞</div>
        <b class="gc-name">Cờ vua</b><small>Tính toán từng nước đi</small>
      </div>
      <div class="gcard gc-snake">
        <span class="gc-tag">ARCADE</span>
        <div class="gc-art"><svg viewBox="0 0 90 50" width="90" height="50"><path d="M6 40c12-6 14-24 26-24s10 18 22 14 10-12 22-10" fill="none" stroke="#34d399" stroke-width="9" stroke-linecap="round"/><circle cx="76" cy="20" r="2.6" fill="#0c0f1a"/></svg></div>
        <b class="gc-name">Rắn săn mồi</b><small>Thu thập · lớn lên · sống sót</small>
      </div>
      <div class="gcard gc-2048">
        <span class="gc-tag">PUZZLE</span>
        <div class="gc-art tile-art"><i style="background:#c2703a">2</i><i style="background:#e0803a">4</i><i style="background:#8b5cf6">8</i><i style="background:#6d5ae6">16</i></div>
        <b class="gc-name">2048</b><small>Ghép số để chiến thắng</small>
      </div>
    </div>
    <div class="left-main">
      <div class="eyebrow">Bộ sưu tập game của bạn</div>
      <h1>Mỗi lần đăng nhập,<br><span>một ván mới</span></h1>
    </div>
    <div class="user-mini">
      <div class="avatar-sm">KG</div>
      <div>
        <div style="font-size:12px">Kiên Giỏi Lý</div>
        <div style="font-size:11px;color:rgba(248,247,244,.4)">Sinh viên lười vượt dễ</div>
      </div>
    </div>
  </aside>`;
}

function cornerCat(pos){
  return `<div class="corner-pet ${pos}">
    <div class="cat-orange">
      <div class="c-eyes">
        <div class="c-eye"><div class="pupil"></div></div>
        <div class="c-eye"><div class="pupil"></div></div>
      </div>
    </div>
  </div>`;
}

function cornerPets(){
  return `${cornerCat("tl")}${cornerCat("tr")}${cornerCat("bl")}${cornerCat("br")}`;
}

function loginView(){
  return `<div class="auth">
    ${leftPanel()}
    <main class="auth-right">
      ${cornerPets()}
      <div class="form fade">
        ${buddiesHtml()}

        <h2>Đăng nhập</h2>
        <p class="sub">Chưa có tài khoản? <button class="link" onclick="go('register')">Đăng ký miễn phí</button></p>
        <form onsubmit="doLogin(event)">
          <div class="field">
            <label>Tên đăng nhập</label>
            <input class="input" required placeholder="Nhập tên đăng nhập..."
              id="loginUser" value="${esc(s.username)}" oninput="s.username=this.value">
          </div>
          <div class="field">
            <div class="field-row">
              <label style="margin:0">Mật khẩu</label>
              <button class="link" type="button" style="font-size:11px">Quên mật khẩu?</button>
            </div>
            <div style="margin-top:.5rem">
              ${pwField("loginPass","••••••••",s.loginPass,"showLogin","s.loginPass=this.value")}
            </div>
          </div>
          ${checkbox("remember","Ghi nhớ đăng nhập")}
          <div id="loginErrorBox"></div>
          <button class="primary" ${s.isLoading ? "disabled" : ""}>${s.isLoading ? "Đang xử lý..." : "Đăng nhập"}</button>
        </form>
        ${divider("hoặc tiếp tục với")}
        ${socialBtns()}
      </div>
    </main>
  </div>`;
}

function registerView(){
  if(s.regOk){
    return `<div class="auth">
      ${leftPanel()}
      <main class="auth-right">
        ${cornerPets()}
        <div class="form fade" style="text-align:center">
          <div style="width:64px;height:64px;background:#0c0f1a;border-radius:50%;display:grid;place-items:center;margin:0 auto 1.5rem;color:#8b5cf6;font-size:28px;box-shadow:0 0 22px rgba(139,92,246,.4)">✓</div>
          <h2>Đăng ký thành công!</h2>
          <p class="sub">Chào mừng bạn đến với <b>GameZone</b>. Hãy đăng nhập để bắt đầu.</p>
          <button class="primary" onclick="go('login')">Đăng nhập ngay</button>
        </div>
      </main>
    </div>`;
  }

  const usernameError = s.username && /\s/.test(s.username) ? "Tên tài khoản không được chứa khoảng trắng" : "";
  const passwordError = s.regPass && (
    /\s/.test(s.regPass) ? "Mật khẩu không được chứa khoảng trắng" :
    !(/[A-Za-z]/.test(s.regPass) && /\d/.test(s.regPass)) ? "Mật khẩu phải có cả chữ và số" : ""
  );
  const mismatch = s.confirm && s.confirm !== s.regPass;
  const disabled = !s.agree || mismatch || usernameError || passwordError || s.isLoading ? "disabled" : "";

  return `<div class="auth">
    ${leftPanel()}
    <main class="auth-right">
      ${cornerPets()}
      <div class="form fade">
        <h2>Đăng ký</h2>
        <p class="sub">Đã có tài khoản? <button class="link" onclick="go('login')">Đăng nhập</button></p>
        <form onsubmit="doRegister(event)">
          <div class="field">
            <label>Tên đăng nhập</label>
            <input class="input" required placeholder="Tối thiểu 8 ký tự, không khoảng trắng..."
              oninput="checkUsernameFormat(this.value)" value="${esc(s.username)}">
            <div id="usernameErrorContainer">${usernameError ? `<div class="mismatch">${esc(usernameError)}</div>` : ""}</div>
          </div>
          <div class="field">
            <label>Mật khẩu</label>
            ${pwField("regPass","Tối thiểu 8 ký tự, có cả chữ và số...",s.regPass,"showReg","updatePasswordStrength(this.value)")}
            <div id="strengthContainer">${strengthBar(s.regPass)}</div>
            <div id="passwordErrorContainer">${passwordError ? `<div class="mismatch">${esc(passwordError)}</div>` : ""}</div>
          </div>
          <div class="field">
            <label>Xác nhận mật khẩu</label>
            ${pwField("confirmPass","Nhập lại mật khẩu...",s.confirm,"showConfirm","checkPasswordMatch(this.value)")}
            <div id="mismatchContainer">${mismatch ? '<div class="mismatch">Mật khẩu không khớp</div>' : ''}</div>
          </div>
          <div class="checkrow" onclick="toggle('agree')">
            <div class="check${s.agree ? ' on' : ''}">${s.agree ? "✓" : ""}</div>
            <span style="font-size:12px;color:rgba(12,15,26,.6);line-height:1.5">
              Tôi đồng ý với <u>Điều khoản dịch vụ</u> và <u>Chính sách bảo mật</u>
            </span>
          </div>
          <div id="registerErrorBox"></div>
          <button id="btnRegister" class="primary" ${disabled}>${s.isLoading ? "Đang tạo..." : "Tạo tài khoản"}</button>
        </form>
        ${divider("hoặc đăng ký với")}
        ${socialBtns()}
      </div>
    </main>
  </div>`;
}

function nicknameView(){
  const n = s.nick;
  const len = n.trim().length;
  const btnStyle = len
    ? "background:linear-gradient(135deg,#8b5cf6,#22d3ee);color:#fff;cursor:pointer;box-shadow:0 6px 18px rgba(139,92,246,.4)"
    : "background:rgba(139,92,246,.2);color:rgba(139,92,246,.4);cursor:not-allowed";
  return `<div class="nickname">
    <div class="gridbg fixed-grid"></div>
    <div class="nick-card fade">
      ${logo(true)}
      <div class="card">
        <h2>Chọn bí danh<br>của bạn</h2>
        <p>Bí danh sẽ xuất hiện trên bảng xếp hạng và trong trận đấu. Chọn thật ngầu nhé.</p>
        <form onsubmit="doNick(event)">
          <div class="nick-input-wrap">
            <input class="nick-input" id="nickInput" autofocus maxlength="20"
              placeholder="Nhập bí danh..." value="${esc(n)}"
              oninput="s.nick=this.value;document.getElementById('cnt').textContent=this.value.trim().length+'/20'">
            <span class="counter" id="cnt">${len}/20</span>
          </div>
          <button class="btn-enter" style="${btnStyle}" ${len?"":"disabled"}>Vào game ngay →</button>
        </form>
      </div>
    </div>
  </div>`;
}

function homeView(){
  const displayName = s.nick || s.username || "GameThủ";
  const ini = displayName.slice(0, 2).toUpperCase();
  const myTier = getRankTier(s.userHighScore);
  const allBadges = badgesFor(s.badges);
  const list = s.filter === "earned" ? allBadges.filter(a => a.earned) : allBadges;
  
  let lbRows = "";
  if (dbLeaderboard.length === 0) {
    lbRows = `<div style="padding:1.25rem;text-align:center;font-size:12px;color:rgba(248,247,244,.4)">Đang kết nối Bảng xếp hạng...</div>`;
  } else {
    lbRows = dbLeaderboard.map((item) => {
      const isTop = item.rank <= 3;
      const rankBadge = item.rank === 1 ? "👑" : item.rank === 2 ? "🥈" : item.rank === 3 ? "🥉" : item.rank;
      const isMe = !!item.is_me;
      const tier = getRankTier(item.score);
      return `<div class="lb-row${isTop ? " top" : ""}">
        <div class="rank">${rankBadge}</div>
        <button type="button" class="player lb-player-btn" onclick="openProfile('${esc(item.public_id)}')">
          <div class="player-avatar">${avatarHtml(item.avatar, item.username.slice(0,2).toUpperCase())}</div>
          <div>
            <div class="lb-player-name" style="font-size:13px;transition:.2s">${esc(item.username)}${isMe ? " (bạn)" : ""}</div>
            <div style="font-size:10px;color:rgba(248,247,244,.35)">ID: ${esc(item.public_id || "--------")}</div>
          </div>
        </button>
        <div class="score">
          ${Number(item.score).toLocaleString()}
          <div style="font-size:10px;color:${tier.color};display:flex;align-items:center;gap:4px;justify-content:flex-end">${rankIconHtml(tier, 16)} ${tier.name}</div>
        </div>
      </div>`;
    }).join("");
  }

  const achCards = list.map(badgeCardHtml).join("");

  return `<div class="home fade">
    <div class="gridbg fixed-grid"></div>
    ${navBar()}
    <main class="content">
      <section class="profile">
        <div class="avatar-wrap">
          <div class="avatar-big">${avatarHtml(s.avatar, ini)}</div>
          <span class="avatar-flair" title="Đang bùng nổ phong độ">🔥</span>
          <button class="avatar-edit-btn" type="button" onclick="triggerAvatarPicker()" title="Đổi ảnh đại diện">✏️</button>
          <input type="file" id="avatarFileInput" accept="image/*" style="display:none" onchange="onAvatarSelected(this)">
        </div>
        <div class="profile-info">
          <div class="eyebrow">Bí danh</div>
          <h2>${esc(displayName)} <button class="edit-nick-btn" onclick="go('nickname')" title="Sửa bí danh">✏️</button></h2>
          <div style="font-size:11px;color:rgba(248,247,244,.35)">ID: ${esc(s.userPublicId || "--------")}</div>
          <div class="profile-badges">
            <span class="badge badge-score">
              🏆  <b>${Number(s.userHighScore || 0).toLocaleString()} điểm</b>
            </span>
          </div>
          <span style="font-size:11px;color:rgba(248,247,244,.4); display: block; margin-top: 6px;"> · Thành viên từ 2026</span>
        </div>
        <div class="profile-rank-display">
          ${rankIconHtml(myTier, 96, "profile-rank-icon")}
          <span class="profile-rank-name" style="color:${myTier.color}">${esc(myTier.name)}</span>
        </div>
        <div class="profile-stats">
          <div><b>${s.userMatches}</b><small>Số trận đã chơi</small></div>
          <div><b>${s.userRank}</b><small>Xếp hạng hiện tại</small></div>
        </div>
      </section>

      <div class="columns">
        <section class="section">
          <div class="section-head">
            <div>
              <div class="section-title">Thành tích</div>
              <h3>Huy hiệu của bạn</h3>
            </div>
            <div class="filters">
              <button class="${s.filter === "all" ? "active" : ""}" onclick="setFilter('all')">Tất cả</button>
              <button class="${s.filter === "earned" ? "active" : ""}" onclick="setFilter('earned')">Đã đạt</button>
            </div>
          </div>
          <div class="achievements">${achCards}</div>
          <div class="progress">
            <div class="progress-head"><span>Tiến độ hoàn thành</span><b style="color:#8b5cf6">4/6</b></div>
            <div class="bar"><i></i></div>
          </div>
        </section>

        <section class="section">
          <div class="section-title">Bảng xếp hạng</div>
          <h3>Top máy chủ</h3>
          <div class="leaderboard">
            <div class="lb-row lb-head">
              <div>#</div><div>Người chơi</div><div>Điểm</div>
            </div>
            ${lbRows}
            <div class="myrank">
              <span>Hạng của bạn hôm nay</span>
              <b>${s.userRank} · Trực tuyến</b>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>`;
}

// ===== Màn danh sách trò chơi =====
const GAMES = [
  { id:"tetris",      name:"Tetris",        desc:"Xếp hình kinh điển — leo rank, phá kỷ lục điểm cao.", icon:"🟦", tag:"ARCADE",     color:"#00d4ff", playable:true  },
  { id:"chess",       name:"Cờ Vua",        desc:"Cờ vua online 1vs1 qua mạng — tạo phòng và mời bạn bè vào đấu.", icon:"♟️", tag:"CHIẾN THUẬT", color:"#e8c97a", playable:true  },
  { id:"snake",       name:"Rắn săn mồi",   desc:"Điều khiển con rắn, ăn mồi và tránh va chạm.",         icon:"🐍", tag:"ARCADE",     color:"#22c55e", playable:true  },
  { id:"2048",        name:"2048",          desc:"Trượt các ô số, kết hợp để đạt ô 2048.",               icon:"🔢", tag:"PUZZLE",     color:"#f97316", playable:false },
  { id:"flappy",      name:"Flappy Bird",   desc:"Vượt qua ống nước — kiểm tra phản xạ của bạn.",        icon:"🐦", tag:"PHẢN XẠ",    color:"#eab308", playable:false },
  { id:"minesweeper", name:"Dò mìn",        desc:"Lật ô, đánh dấu mìn và sống sót đến cuối.",            icon:"💣", tag:"CHIẾN THUẬT",color:"#ef4444", playable:false },
  { id:"memory",      name:"Lật thẻ",       desc:"Ghi nhớ và ghép cặp thẻ giống nhau nhanh nhất.",       icon:"🎴", tag:"TRÍ NHỚ",    color:"#a855f7", playable:false },
];

function gameCard(g){
  const btn = g.playable
    ? `<button class="game-play-btn" style="background:${g.color};color:#0c0f1a" onclick="go('game','${g.id}')">CHƠI NGAY →</button>`
    : `<button class="game-play-btn locked" disabled>CHƠI NGAY</button>
       <div class="game-soon"><i></i>Sắp ra mắt</div>`;
  return `<div class="game-card${g.playable ? " playable" : ""}">
    <div class="game-card-top">
      <div class="game-icon" style="background:${g.color}22;color:${g.color}">${g.icon}</div>
      <span class="game-tag" style="color:${g.color};background:${g.color}1a;border-color:${g.color}55">${g.tag}</span>
    </div>
    <h3>${g.name}</h3>
    <p>${g.desc}</p>
    ${btn}
  </div>`;
}

// ================== BỘ SƯU TẬP CHIBI ==================
// Hệ nguyên tố — icon + màu dùng cho badge/pill trên thẻ chibi.
const ELEMENT_TYPES = {
  light:   { label:"Ánh sáng",   icon:"✨", color:"#f2c14e" },
  fire:    { label:"Lửa",        icon:"🔥", color:"#f2542d" },
  water:   { label:"Nước",       icon:"💧", color:"#22d3ee" },
  thunder: { label:"Sấm sét",    icon:"⚡", color:"#a78bfa" },
  nature:  { label:"Thiên nhiên",icon:"🌿", color:"#4ade80" },
  dark:    { label:"Bóng tối",   icon:"🌙", color:"#818cf8" },
};

// Thứ tự hiển thị các bậc hiếm trên thanh filter + số sao mặc định mỗi bậc.
const CHIBI_RARITIES = ["Huyền thoại", "Sử thi", "Hiếm", "Thường"];
const CHIBI_RARITY_STARS = { "Huyền thoại":5, "Sử thi":4, "Hiếm":3, "Thường":2 };

// Hiện có 1 chibi thật (code "1"), 2 dòng "???" chỉ là chỗ trống demo layout
// khi chưa mở khoá — xoá đi hoặc thay bằng chibi thật khi có thêm.
// Mỗi chibi khớp với 1 dòng trong bảng chibi_characters (DB): rarity/element/
// desc là dữ liệu hiển thị, có thể để backend trả về sau này thay vì hard-code.
const CHIBI_GALLERY = [
  {
    code: "1", name: "Eruka", desc: "Cô bé mèo con",
    rarity: "Hiếm", element: "light",
    frontImage: "chibi/1/chinhdien.png",
    // Config riêng của chibi 1 — đổi số ở đây không ảnh hưởng chibi khác.
    runnerConfig: {
      speed: 78,        // px/giây
      fps: 11,          // khung hình/giây
      baseFacing: "left",
      // Click vào chibi 1 -> đứng yên & phát khung "ngã", xong tự đứng dậy
      // chạy tiếp. Ảnh lấy từ chibi/1/nga/frame_007.png .. frame_023.png.
      fall: {
        dir: "nga",
        frameFileName: (i) => `frame_${String(i).padStart(3, "0")}.png`,
        start: 7,
        end: 23,
        fps: 15,      // tốc độ phát khung ngã (khung hình/giây)
        holdMs: 250,  // đứng yên ở khung ngã cuối bao lâu (ms) trước khi đứng dậy
        yOffset: 4,  // đẩy ảnh ngã xuống thấp hơn bao nhiêu px cho khớp mặt đất (tăng/giảm số này nếu chưa vừa)
        scale: 1.1,   // ảnh ngã to hơn ảnh chạy bao nhiêu lần (1 = giữ nguyên, chỉnh số này để to/nhỏ hơn)
      },
    },
  },
  {
    code: "2", name: "Yuki", desc: "Cô bé mũ len ấm áp",
    rarity: "Hiếm", element: "nature",
    frontImage: "chibi/2/chinhdien.png",
    frameCount: 34, // chibi này có 13 khung ảnh chạy (chibi 1 có 10), khác chibi_characters.frame_count trong DB
    // Giữ nguyên tên file gốc bạn upload (frame_001.png .. frame_013.png), không đổi tên thành 1.png..13.png
    frameFileName: (i) => `frame_${String(i).padStart(3, "0")}.png`,
    // Config riêng của chibi 2 — đổi số ở đây không ảnh hưởng chibi 1.
    runnerConfig: {
      speed: 78,        // px/giây — chỉnh riêng tốc độ chibi 2 ở đây
      fps: 60,          // khung hình/giây
      baseFacing: "right", // ảnh gốc chibi 2 quay mặt/đi sang phải (ngược chibi 1)
      spriteWidth: 230,    // độ rộng hiển thị (px) — tăng số này để ảnh to ra
      bottomOffset: -7,     // cách đáy màn hình (px) — mặc định 14, để 6 cho thấp xuống 1 tí
    },
  },
  {
    code: "3", name: "???", desc: "",
    rarity: "Thường", element: null,
    frontImage: "",
  },
];

// Chibi mặc định ai cũng có ngay khi đăng ký (khớp chibi_characters.is_default = 1 trong DB): Eruka.
// Các chibi còn lại phải được mở khoá (có dòng trong bảng user_chibis).
const DEFAULT_CHIBI_CODE = "1";

// Trước khi server trả lời thì tạm coi như chỉ có Eruka được mở khoá; sau đó dùng đúng dữ liệu server.
function isChibiUnlocked(code){
  return s.chibisLoaded ? s.unlockedChibiCodes.has(code) : code === DEFAULT_CHIBI_CODE;
}

async function fetchChibis(){
  if (!s.token) return;
  try {
    const res = await authFetch(`${API_URL}/chibis`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      s.chibisError = `Lỗi ${res.status}: ${err.detail || "máy chủ không phản hồi đúng"}`;
      console.error("Lỗi /chibis:", s.chibisError);
      if (s.view === "shop") render();
      return;
    }
    s.chibisError = null;
    const data = await res.json();
    s.unlockedChibiCodes = new Set((data.chibis || []).filter(c => c.unlocked).map(c => c.code));
    s.chibisLoaded = true;
    s.chibiPrices = {};
    (data.chibis || []).forEach(c => { s.chibiPrices[c.code] = Number(c.price) || 0; });
    if (data.gold !== undefined) s.gold = Number(data.gold) || 0;
    // Chibi chưa mở khoá thì không được phép chạy trên màn hình.
    let changed = false;
    for (const code of Array.from(s.activeChibiCodes)) {
      if (!s.unlockedChibiCodes.has(code)) { s.activeChibiCodes.delete(code); changed = true; }
    }
    if (changed) { applyChibiRunnerState(); saveSession(); }
    if (s.view === "chibi" || s.view === "shop") render();
  } catch (err) {
    console.error("Lỗi lấy danh sách chibi:", err);
    s.chibisError = "Không kết nối được máy chủ (kiểm tra API_URL trong config.js)";
    if (s.view === "shop") render();
  }
}

function toggleChibiFavorite(code){
  if (s.chibiFavorites.has(code)) s.chibiFavorites.delete(code);
  else s.chibiFavorites.add(code);
  render();
}

function setChibiFilter(f){
  s.chibiFilter = f;
  render();
}

// Bấm "Sử dụng"/"Đi ngủ đi" trên 1 chibi: BẬT hoặc TẮT riêng chibi đó, không
// đụng tới các chibi khác đang chạy -> có thể có NHIỀU chibi active cùng lúc,
// tất cả cùng chạy song song trên màn hình. Lưu lại ở server để lần đăng nhập
// sau tự chạy lại đúng các chibi này.
async function useChibi(code){
  if (!s.token) { alert("Vui lòng đăng nhập để sử dụng chibi"); return; }
  if (!isChibiUnlocked(code)) { alert("Chibi này chưa được mở khoá"); return; }

  const wasActive = s.activeChibiCodes.has(code);
  const willBeActive = !wasActive;

  // Cập nhật ngay cho mượt, không cần đợi server trả lời
  if (willBeActive) s.activeChibiCodes.add(code);
  else s.activeChibiCodes.delete(code);
  applyChibiRunnerState();
  updateChibiUseBtn(code);

  try {
    const res = await authFetch(`${API_URL}/set-active-chibi`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chibi_code: code, active: willBeActive })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      throw new Error((errData && errData.detail) || "Lưu chibi đang dùng thất bại");
    }
    saveSession();
  } catch (err) {
    console.error("Lỗi khi chọn chibi:", err);
    // Lưu thất bại -> quay lại trạng thái cũ
    if (willBeActive) s.activeChibiCodes.delete(code);
    else s.activeChibiCodes.add(code);
    applyChibiRunnerState();
    updateChibiUseBtn(code);
    alert(err.message || "Không thể lưu lựa chọn chibi, vui lòng thử lại.");
  }
}

// Chỉ cập nhật đúng cái nút "Sử dụng/Đi ngủ đi" của 1 chibi tại chỗ, KHÔNG
// render lại cả app.innerHTML -> tránh việc toàn bộ lưới chibi (và các
// <img> avatar bên trong) bị huỷ/tạo lại mỗi lần bấm, gây giật/nháy như
// tải lại trang. activeChibiCodes chỉ ảnh hưởng đúng nút này trên UI nên
// không cần render() toàn bộ.
function updateChibiUseBtn(code){
  const btn = document.getElementById(`chibi-use-btn-${code}`);
  if (!btn) { render(); return; } // phòng hờ: view khác/chưa có nút -> fallback render đầy đủ
  const isActive = s.activeChibiCodes.has(code);
  btn.classList.toggle("active", isActive);
  btn.textContent = isActive ? "😴 Đi ngủ đi" : "Sử dụng";
}

function filteredChibiList(){
  const { chibiFilter } = s;
  if (chibiFilter === "owned") return CHIBI_GALLERY.filter(c => isChibiUnlocked(c.code));
  if (chibiFilter === "favorite") return CHIBI_GALLERY.filter(c => s.chibiFavorites.has(c.code));
  if (CHIBI_RARITIES.includes(chibiFilter)) return CHIBI_GALLERY.filter(c => c.rarity === chibiFilter);
  return CHIBI_GALLERY;
}

function chibiStars(rarity){
  const filled = CHIBI_RARITY_STARS[rarity] || 0;
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += `<span class="chibi-star${i < filled ? " filled" : ""}">★</span>`;
  }
  return `<div class="chibi-stars">${out}</div>`;
}

function chibiCard(c){
  const color = rarityColor[c.rarity] || "rgba(248,247,244,.4)";
  const elem = c.element ? ELEMENT_TYPES[c.element] : null;
  const tint = elem ? elem.color : "#8b5cf6";
  const fav = s.chibiFavorites.has(c.code);
  const fallback = `chibi/${c.code}/${c.frameFileName ? c.frameFileName(1) : "1.png"}`;
  const imgSrc = c.frontImage || fallback;
  const isActive = s.activeChibiCodes.has(c.code);

  if (!isChibiUnlocked(c.code)) {
    // Chibi đã có ảnh (vd Yuki): vẫn hiện ảnh + tên nhưng làm xám, phủ ổ khoá, không bấm "Sử dụng" được.
    // Chibi chưa có ảnh (vd "???"): chỉ hiện ổ khoá như cũ.
    const hasImage = !!c.frontImage;
    const avatarHtml2 = hasImage
      ? `<div class="chibi-card-avatar">
          <img class="locked-img" src="${esc(imgSrc)}" alt="${esc(c.name)}" onerror="this.onerror=null;this.src='${esc(fallback)}'">
        </div>
        <span class="chibi-lock-badge" aria-hidden="true">🔒</span>`
      : `<div class="chibi-card-avatar locked-avatar">🔒</div>`;
    return `<div class="chibi-card locked" style="--tint:${tint}">
      <div class="chibi-card-top">
        <span class="chibi-badge-rarity" style="color:${color};border-color:${color}66">${c.rarity}</span>
        <span class="chibi-fav-btn" aria-hidden="true">♡</span>
      </div>
      ${chibiStars(c.rarity)}
      <div class="chibi-card-avatar-wrap">
        ${avatarHtml2}
      </div>
      <div class="chibi-card-name${hasImage ? "" : " muted"}">${hasImage ? esc(c.name) : "Chưa mở khoá"}</div>
      <div class="chibi-card-desc">${hasImage ? "🔒 Chưa mở khoá" : "Săn thêm để mở khoá chibi này"}</div>
    </div>`;
  }

  return `<div class="chibi-card" style="--tint:${tint}">
    <div class="chibi-card-top">
      <span class="chibi-badge-rarity" style="color:${color};border-color:${color}66">${c.rarity}</span>
      <button type="button" class="chibi-fav-btn${fav ? " active" : ""}" onclick="toggleChibiFavorite('${c.code}')" aria-label="Yêu thích">${fav ? "♥" : "♡"}</button>
    </div>
    ${chibiStars(c.rarity)}
    <div class="chibi-card-avatar-wrap">
      <div class="chibi-card-avatar">
        <img src="${esc(imgSrc)}" alt="${esc(c.name)}" onerror="this.onerror=null;this.src='${esc(fallback)}'">
      </div>
      ${elem ? `<span class="chibi-elem-badge" style="background:${elem.color}22;color:${elem.color}">${elem.icon}</span>` : ""}
    </div>
    <div class="chibi-card-name">${esc(c.name)}</div>
    <div class="chibi-card-desc">${esc(c.desc)}</div>
    <div class="chibi-card-bottom">
      ${elem ? `<span class="chibi-elem-pill" style="background:${elem.color}1a;color:${elem.color};border-color:${elem.color}44">${elem.icon} ${elem.label}</span>` : "<span></span>"}
      <span class="chibi-detail-link">Xem chi tiết →</span>
    </div>
    <button type="button" id="chibi-use-btn-${esc(c.code)}" class="chibi-use-btn${isActive ? " active" : ""}"
      onclick="useChibi('${c.code}')">
      ${isActive ? "😴 Đi ngủ đi" : "Sử dụng"}
    </button>
  </div>`;
}

// ================== CỬA HÀNG ==================
// Chỉ bán những chibi CHƯA sở hữu và có giá > 0 (giá lấy từ server: chibi_characters.price).
function shopItems(){
  return CHIBI_GALLERY.filter(c => !isChibiUnlocked(c.code) && (s.chibiPrices[c.code] || 0) > 0 && c.frontImage);
}

const SHOP_RARITY_COLOR = { "Huyền thoại":"#f59e0b", "Sử thi":"#a855f7", "Hiếm":"#38bdf8", "Thường":"#9ca3af" };
const SH_ICON_BAG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l1 13H5z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/></svg>`;

function setShopFilter(f){
  s.shopFilter = f;
  render();
}

function shopCard(c){
  const price = s.chibiPrices[c.code] || 0;
  const color = SHOP_RARITY_COLOR[c.rarity] || "rgba(248,247,244,.4)";
  const elem = c.element ? ELEMENT_TYPES[c.element] : null;
  const tint = elem ? elem.color : "#8b5cf6";
  const fallback = `chibi/${c.code}/${c.frameFileName ? c.frameFileName(1) : "1.png"}`;
  const gold = Number(s.gold) || 0;
  const enough = gold >= price;
  const pct = Math.max(0, Math.min(100, Math.round(gold * 100 / price)));
  return `<div class="sh-card" style="--tint:${tint};--rar:${color}">
    <div class="sh-card-top">
      <span class="sh-rar">${c.rarity}</span>
      ${elem ? `<span class="sh-elem" style="color:${elem.color};border-color:${elem.color}55;background:${elem.color}14">${elem.icon} ${elem.label}</span>` : ""}
    </div>
    ${chibiStars(c.rarity)}
    <div class="sh-avatar">
      <img src="${esc(c.frontImage)}" alt="${esc(c.name)}" onerror="this.onerror=null;this.src='${esc(fallback)}'">
    </div>
    <div class="sh-name">${esc(c.name)}</div>
    <div class="sh-desc">${esc(c.desc)}</div>
    <div class="sh-buy">
      <div class="sh-price"><span>GIÁ</span><b>🪙 ${price.toLocaleString("vi-VN")}</b></div>
      <button type="button" class="sh-btn${enough ? "" : " short"}" ${s.shopBusy ? "disabled" : ""}
        onclick="buyChibi('${c.code}')">${enough ? "MUA NGAY <i>→</i>" : `THIẾU ${(price - gold).toLocaleString("vi-VN")} 🪙`}</button>
    </div>
    ${enough ? "" : `<div class="sh-progress" title="Bạn có ${gold} / ${price} vàng"><i style="width:${pct}%"></i></div>`}
  </div>`;
}

function shopView(){
  const items = shopItems();
  const gold = Number(s.gold) || 0;
  const priceOf = c => s.chibiPrices[c.code] || 0;
  const ownedCount = CHIBI_GALLERY.filter(c => isChibiUnlocked(c.code)).length;

  // Bộ lọc: Tất cả / Mua được / từng độ hiếm đang có trong cửa hàng
  const rarities = ["Thường", "Hiếm", "Sử thi", "Huyền thoại"].filter(r => items.some(c => c.rarity === r));
  const filters = [
    { key: "all", label: "Tất cả", n: items.length },
    { key: "affordable", label: "Mua được", n: items.filter(c => priceOf(c) <= gold).length },
    ...rarities.map(r => ({ key: r, label: r, n: items.filter(c => c.rarity === r).length })),
  ];
  const active = filters.some(f => f.key === s.shopFilter) ? s.shopFilter : "all";
  const shown = items.filter(c =>
    active === "all" ? true : active === "affordable" ? priceOf(c) <= gold : c.rarity === active);

  let body;
  if (!s.token) body = `<div class="sh-empty">Vui lòng đăng nhập để mua chibi.</div>`;
  else if (s.chibisError) body = `<div class="sh-empty">⚠️ Không tải được cửa hàng. ${esc(s.chibisError)}</div>`;
  else if (!s.chibisLoaded) body = `<div class="sh-empty">⏳ Đang tải cửa hàng...</div>`;
  else if (!items.length) body = `<div class="sh-empty">🎉 Bạn đã sở hữu tất cả chibi đang bán. Hãy quay lại sau nhé!</div>`;
  else if (!shown.length) body = `<div class="sh-empty">Không có chibi nào phù hợp bộ lọc này.</div>`;
  else body = `<div class="sh-grid">${shown.map(shopCard).join("")}</div>`;

  return `<div class="home fade">
    <div class="gridbg fixed-grid"></div>
    ${navBar()}
    <main class="content sh">
      <header class="sh-head">
        <div class="sh-brand">
          <div class="sh-logo">${SH_ICON_BAG}</div>
          <div>
            <div class="sh-eyebrow">NEON ARCADE</div>
            <h1 class="sh-title">CỬA HÀNG</h1>
          </div>
        </div>
        <div class="sh-gold"><span>SỐ DƯ</span><b>🪙 ${gold.toLocaleString("vi-VN")}</b></div>
      </header>

      <div class="sh-stats">
        <div class="sh-stat gold"><div class="sh-label">SỐ VÀNG CỦA BẠN</div><div class="sh-num">🪙 ${gold.toLocaleString("vi-VN")}</div>
          <a class="sh-link" onclick="go('quests')">Làm nhiệm vụ để nhận thêm vàng →</a></div>
        <div class="sh-stat"><div class="sh-label">ĐANG BÁN</div><div class="sh-num">${String(items.length).padStart(2, "0")}</div>
          <div class="sh-sub">chibi chưa sở hữu</div></div>
        <div class="sh-stat"><div class="sh-label">ĐÃ SỞ HỮU</div><div class="sh-num">${ownedCount}<small> / ${CHIBI_GALLERY.length}</small></div>
          <div class="sh-sub">trong bộ sưu tập</div></div>
      </div>

      <section class="sh-card-wrap">
        <div class="sh-bar-head">
          <div><div class="sh-sec">DANH SÁCH CHIBI</div><div class="sh-sec-sub">${shown.length} sản phẩm được hiển thị</div></div>
          <div class="sh-seg">
            ${filters.map(f => `<button type="button" class="${active === f.key ? "active" : ""}" onclick="setShopFilter('${f.key}')">${f.label}<em>${f.n}</em></button>`).join("")}
          </div>
        </div>
        ${body}
      </section>
    </main>
  </div>`;
}

async function buyChibi(code){
  if (s.shopBusy) return;
  const c = CHIBI_GALLERY.find(g => g.code === code);
  const price = s.chibiPrices[code] || 0;
  if (!c || price <= 0) return;
  if (s.gold < price) { alert(`Chưa đủ vàng: cần ${price} vàng, bạn đang có ${s.gold}.`); return; }
  if (!confirm(`Mua ${c.name} với giá ${price} vàng?`)) return;
  s.shopBusy = true;
  try {
    const res = await authFetch(`${API_URL}/chibis/${encodeURIComponent(code)}/buy`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || "Mua chibi thất bại");
    s.gold = Number(data.gold) || 0;
    s.unlockedChibiCodes.add(code);
    alert(`Đã mua ${c.name}! Vào mục Chibi để sử dụng.`);
  } catch (err) {
    console.error("Lỗi mua chibi:", err);
    alert(err.message || "Không thể mua chibi, vui lòng thử lại.");
    fetchChibis();
  } finally {
    s.shopBusy = false;
    if (s.view === "shop") render();
  }
}

function chibiView(){
  const filters = [
    { key:"all",      label:"Tất cả" },
    { key:"owned",    label:"✅ Đã có" },
    { key:"favorite", label:"♥ Yêu thích" },
    ...CHIBI_RARITIES.map(r => ({ key:r, label:r })),
  ];
  return `<div class="home fade">
    <div class="gridbg fixed-grid"></div>
    ${navBar()}
    <main class="content">
      <div class="section-title">Bộ sưu tập Chibi</div>
      <div class="quest-hint">Đã mở khoá ${CHIBI_GALLERY.filter(c => isChibiUnlocked(c.code)).length}/${CHIBI_GALLERY.length} chibi</div>
      <div class="chibi-filters">
        ${filters.map(f => `<button type="button" class="chibi-filter-btn${s.chibiFilter===f.key ? " active" : ""}" onclick="setChibiFilter('${f.key}')">${f.label}</button>`).join("")}
      </div>
      <div class="chibi-grid">
        ${filteredChibiList().map(chibiCard).join("")}
      </div>
    </main>
  </div>`;
}

function gamesView(){
  const displayName = s.nick || s.username || "GameThủ";
  const ini = displayName.slice(0, 2).toUpperCase();
  const tier = getRankTier(s.userHighScore);
  return `<div class="home fade">
    <div class="gridbg fixed-grid"></div>
    ${navBar()}
    <div class="games-body">
      <main class="content games-main-content">
        <div class="section-title">Danh sách trò chơi</div>
        <div class="games-grid">
          ${GAMES.map(gameCard).join("")}
        </div>
      </main>
      <aside class="game-sidebar" onclick="go('home')" style="cursor:pointer" title="Xem hồ sơ">
        <div class="avatar-big">${avatarHtml(s.avatar, ini)}</div>
        <div class="sidebar-nick">${esc(displayName)}</div>
        <span class="sidebar-rank" style="color:${tier.color};border:1px solid ${tier.color}66;background:${tier.color}1a">🏆 Top ${String(s.userRank).replace('#','')}</span>
      </aside>
    </div>
  </div>`;
}

function gameView(){
  const displayName = s.nick || s.username || "GameThủ";
  const ini = displayName.slice(0, 2).toUpperCase();
  return `<div class="home fade">
    <div class="gridbg fixed-grid"></div>
    ${navBar()}

    <main class="content content-game">
      <div id="gameMount"></div>
    </main>
  </div>`;
}

// Xin server 1 "phiên chơi" mới (kèm mốc thời gian bắt đầu) trước khi vào ván đấu,
// để server có căn cứ kiểm tra điểm nộp lên sau này có hợp lý hay không.
async function startGameSession(){
  try {
    const game = s.selectedGame === "snake" ? "snake" : "tetris";   // phiên chơi gắn với loại game
    const res = await authFetch(`${API_URL}/start-game?game=${game}`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      s.gameSessionToken = data.session_token || "";
    }
  } catch (err) {
    console.error("Lỗi khởi tạo phiên chơi:", err);
  }
}

// Lưu điểm lên server rồi lấy hạng/kỷ lục mới nhất về.
// Trả về {rank, highScore, totalMatches} nếu thành công, hoặc null nếu có lỗi.
// KHÔNG tự chuyển trang ở đây nữa — để tetris.js quyết định hiển thị gì sau khi có kết quả.
async function submitScore(finalScore){
  const gameType = s.selectedGame === "snake" ? "snake" : "tetris";
  if (!s.gameSessionToken) {
    alert("Không xác định được phiên chơi, điểm chưa được lưu. Vui lòng chơi lại ván mới.");
    return null;
  }
  try {
    const res = await authFetch(`${API_URL}/update-score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: finalScore, session_token: s.gameSessionToken, game_type: gameType })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      buddyMood = "sad"; // render() ở khối finally sẽ dựng lại trang, trạng thái buồn được áp lại sau đó
      alert("Lỗi khi lưu điểm: " + (data.detail || "không rõ nguyên nhân"));
      buddiesReact("sad", 1800);
      return null;
    }
  } catch (err) {
    console.error("Lỗi kết nối khi lưu điểm:", err);
    alert("Không kết nối được tới Backend, điểm chưa được lưu!");
    return null;
  }

  try {
    const res = await authFetch(`${API_URL}/user-stats/${encodeURIComponent(s.username)}`);
    if (res.ok) {
      const data = await res.json();
      s.userRank = data.rank;
      s.userMatches = data.total_matches;
      s.userHighScore = data.high_score || 0;
      s.userSnakeScore = data.snake_score || 0;
      s.gameSessionToken = "";
      // Rắn săn mồi hiển thị KỶ LỤC riêng của rắn; Tetris giữ nguyên như cũ.
      const best = gameType === "snake" ? (data.snake_score || 0) : (data.high_score || 0);
      return { rank: data.rank, highScore: best, totalMatches: data.total_matches };
    }
  } catch (err) {
    console.error("Lỗi lấy thông tin xếp hạng:", err);
  }
  return null;
}

let lastView = null; // theo dõi view trước đó để biết đây có phải chuyển màn thật sự không

function render(){
  const app = document.getElementById("app");
  // Đang ở trong màn chơi game (cờ vua/tetris) mà có render() "ngầm" từ các nơi khác
  // (tải hội thoại, thông tin người chơi, tin nhắn realtime...) thì KHÔNG dựng lại:
  // dựng lại sẽ unmount game -> đóng WebSocket -> đối thủ nhận "đã rời phòng".
  if (s.view === "game" && lastView === "game" && document.getElementById("gameMount")) return;
  if (typeof TetrisGame !== "undefined") {
    TetrisGame.unmount();
  }
  if (typeof ChessGame !== "undefined") {
    ChessGame.unmount();
  }
  if (typeof SnakeGame !== "undefined") {
    SnakeGame.unmount();
  }

  // Chỉ phát animation "fade" khi THỰC SỰ chuyển sang view khác.
  // Nếu vẫn đang ở cùng 1 view (ví dụ chỉ bấm checkbox, đổi filter...),
  // tắt animation để tránh cả khối giao diện bị "giật/nhảy" mỗi lần bấm.
  const isNewView = (s.view !== lastView);
  lastView = s.view;
  app.classList.toggle("no-fade", !isNewView);

  if(s.view==="login")        app.innerHTML = loginView();
  else if(s.view==="register") app.innerHTML = registerView();
  else if(s.view==="nickname") app.innerHTML = nicknameView();
  else if(s.view==="games")    app.innerHTML = gamesView();
  else if(s.view==="chibi")    app.innerHTML = chibiView();
  else if(s.view==="shop")     app.innerHTML = shopView();
  else if(s.view==="friends")  app.innerHTML = friendsView();
  else if(s.view==="messages") app.innerHTML = messagesView();
  else if(s.view==="quests")   app.innerHTML = questsView();
  else if(s.view==="history")  app.innerHTML = historyView();
  else if(s.view==="game"){
    app.innerHTML = gameView();
    s.gameSessionToken = ""; // reset, token cũ (nếu có) đã dùng xong hoặc không còn hợp lệ
    startGameSession();
    const mountPoint = document.getElementById("gameMount");
    const gameOpts = {
      onFinish: submitScore,        // lưu điểm + lấy hạng, không tự chuyển trang
      onGoHome: () => go("home")    // chỉ chuyển trang khi người chơi bấm "Về trang chủ" / "Thoát"
    };
    if (mountPoint && s.selectedGame === "chess" && typeof ChessGame !== "undefined") {
      ChessGame.mount(mountPoint, Object.assign({}, gameOpts, {
        apiUrl: API_URL,
        playerName: s.nick || s.username || "Ẩn danh",
        playerAvatar: s.avatar || "",
        playerScore: s.userHighScore || 0,
        authToken: s.token || ""
      }));
    } else if (mountPoint && s.selectedGame === "snake" && typeof SnakeGame !== "undefined") {
      SnakeGame.mount(mountPoint, Object.assign({}, gameOpts, {
        onStart: startGameSession,      // chơi lại -> xin phiên chơi mới (token chỉ dùng được 1 lần)
        highScore: s.userSnakeScore || 0
      }));
    } else if (mountPoint && typeof TetrisGame !== "undefined") {
      TetrisGame.mount(mountPoint, gameOpts);
    }
  }
  else                         app.innerHTML = homeView();
  applyBuddyState();
}

function go(view, gameId){
  if(view==="login") s.regOk = false;
  if(gameId) s.selectedGame = gameId;
  s.view = view;
  s.notifOpen = false;
  if(view === "home") {
    fetchLeaderboard();
    fetchUserStats();
  }
  if(view === "friends") {
    fetchFriends();
  }
  if(view === "messages") {
    fetchConversations();
  }
  if(view === "quests") {
    fetchQuests();
  }
  if(view === "history") {
    fetchGameHistory();
  }
  if(view === "chibi" || view === "shop") {
    fetchChibis();
  }
  render();
  saveSession();
}

function toggle(key, btn){
  // Nhớ ô mật khẩu đang bấm "mắt" để trả focus lại sau khi dựng lại trang.
  const inputId = btn && btn.previousElementSibling && btn.previousElementSibling.id;
  s[key] = !s[key];
  render();
  const el = inputId && document.getElementById(inputId);
  if (el) { el.focus(); const n = el.value.length; try { el.setSelectionRange(n, n); } catch (_) {} }
}

async function doLogin(e){
  e.preventDefault();
  const username = s.username.trim();
  const password = s.loginPass;

  if(!username || !password) return;

  if (username.length < 8 || password.length < 8) {
    showFieldError("loginErrorBox", "Tài khoản và mật khẩu phải có ít nhất 8 ký tự");
    buddiesReact("sad", 1600);
    return;
  }
  showFieldError("loginErrorBox", "");

  s.isLoading = true;
  render();

  try {
    const res = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      s.username = data.username || username;
      s.avatar = data.avatar || "";
      s.token = data.token || "";
      // Nếu tài khoản đã từng bấm "Sử dụng" các chibi trước đó, chạy lại đúng các chibi đó ngay khi đăng nhập.
      // Chưa từng chọn -> active_chibi_codes rỗng -> không chạy chibi nào cả.
      s.activeChibiCodes = new Set(data.active_chibi_codes || []);
      applyChibiRunnerState();
      fetchChibis(); // lấy trạng thái khoá/mở khoá chibi của tài khoản này
      if (data.nickname && data.nickname.trim() !== "") {
        s.nick = data.nickname;
        s.view = "games";
        saveSession();
        fetchLeaderboard();
        fetchUserStats();
        fetchFriends();
        fetchConversations();
        connectMessagesWS();
        startNotifPolling();
      } else {
        s.nick = username;
        s.view = "nickname";
        saveSession();
      }
    } else {
      alert("Đăng nhập thất bại: " + (data.detail || "Sai tên đăng nhập hoặc mật khẩu"));
    }
  } catch (err) {
    alert("Không kết nối được tới máy chủ Backend!");
  } finally {
    s.isLoading = false;
    render();
  }
}

async function doRegister(e){
  e.preventDefault();
  const username = s.username.trim();
  const password = s.regPass;

  if(!username || !password) return;

  if (/\s/.test(username) || username.length < 8) {
    showFieldError("registerErrorBox", "Tài khoản không được chứa khoảng trắng và phải có ít nhất 8 ký tự");
    return;
  }
  if (/\s/.test(password) || password.length < 8) {
    showFieldError("registerErrorBox", "Mật khẩu không được chứa khoảng trắng và phải có ít nhất 8 ký tự");
    return;
  }
  if (!(/[A-Za-z]/.test(password) && /\d/.test(password))) {
    showFieldError("registerErrorBox", "Mật khẩu phải có cả chữ và số");
    return;
  }
  showFieldError("registerErrorBox", "");

  s.isLoading = true;
  render();

  try {
    const res = await fetch(`${API_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      s.regOk = true;
    } else {
      alert("Đăng ký thất bại: " + (data.detail || "Tên tài khoản đã tồn tại"));
    }
  } catch (err) {
    alert("Không kết nối được tới máy chủ Backend!");
  } finally {
    s.isLoading = false;
    render();
  }
}

async function doNick(e){
  e.preventDefault();
  const chosenNick = s.nick.trim() || s.username || "GameThủ";

  try {
    await authFetch(`${API_URL}/update-nickname`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: chosenNick })
    });
  } catch (err) {
    console.error("Lỗi cập nhật bí danh:", err);
  }

  s.nick = chosenNick;
  s.view = "games";
  saveSession();
  fetchLeaderboard();
  fetchUserStats();
  fetchFriends();
  fetchConversations();
  connectMessagesWS();
  startNotifPolling();
  render();
}

// Nén & resize ảnh về tối đa 300x300 (giữ tỉ lệ) trước khi gửi lên server,
// tránh lưu ảnh gốc quá nặng vào CSDL.
function resizeImageToDataUrl(file, maxSize = 300, quality = 0.85){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round(height * (maxSize / width));
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round(width * (maxSize / height));
          height = maxSize;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Ảnh không hợp lệ"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Không đọc được file"));
    reader.readAsDataURL(file);
  });
}

function triggerAvatarPicker(){
  const input = document.getElementById("avatarFileInput");
  if (input) input.click();
}

async function onAvatarSelected(inputEl){
  const file = inputEl.files && inputEl.files[0];
  inputEl.value = ""; // cho phép chọn lại cùng 1 file lần sau
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("Vui lòng chọn một file ảnh");
    return;
  }

  try {
    const dataUrl = await resizeImageToDataUrl(file);
    s.avatar = dataUrl;
    saveSession();
    render();

    const res = await authFetch(`${API_URL}/update-avatar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar: dataUrl })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert("Lỗi khi lưu ảnh đại diện: " + (data.detail || "không rõ nguyên nhân"));
    }
  } catch (err) {
    console.error("Lỗi cập nhật ảnh đại diện:", err);
    alert("Không cập nhật được ảnh đại diện!");
  }
}

function pickNick(name){
  s.nick = name;
  render();
}

function setFilter(f){
  s.filter = f;
  render();
}

// ================== THÔNG BÁO ==================
// Thông báo do DATABASE tự tạo (hoàn thành nhiệm vụ, lời mời kết bạn, thành tích...).
// Chuông ở thanh menu hiện số chưa đọc; frontend hỏi server mỗi 30 giây.
// QUAN TRỌNG: cập nhật chuông bằng cách thay đúng khối #notifWrap, KHÔNG gọi render()
// (render() dựng lại cả trang -> sẽ làm game đang chơi bị khởi động lại).

const NOTIF_POLL_MS = 30000;
let notifPollTimer = null;

const NOTIF_ICONS = { quest: "🎯", achievement: "🏆", friend_request: "👥", system: "🔔" };

function notifIcon(type){ return NOTIF_ICONS[type] || "🔔"; }

function notifTimeAgo(iso){
  const t = new Date(iso).getTime();
  if (!iso || isNaN(t)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return "Vừa xong";
  if (sec < 3600) return `${Math.floor(sec / 60)} phút trước`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} giờ trước`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)} ngày trước`;
  return new Date(t).toLocaleDateString("vi-VN");
}

function notifBellHtml(){
  if (!s.notifOpen && s.notifSeen.size) s.notifSeen.clear(); // đóng panel -> hết tô sáng
  const unread = s.notifUnread || 0;
  const badge = unread ? `<span class="notif-badge">${unread > 99 ? "99+" : unread}</span>` : "";

  let panel = "";
  if (s.notifOpen) {
    const isNew = (n) => !n.is_read || s.notifSeen.has(n.id);
    const items = s.notifications.map(n => `<div class="notif-item${isNew(n) ? " unread" : ""}" onclick="onNotifClick(${Number(n.id)})">
        <div class="notif-icon">${notifIcon(n.type)}</div>
        <div class="notif-body">
          <div class="notif-text">${esc(n.content)}</div>
          <div class="notif-time">${esc(notifTimeAgo(n.created_at))}</div>
        </div>
        ${isNew(n) ? `<span class="notif-dot"></span>` : ""}
      </div>`).join("");
    const empty = `<div class="notif-empty">${s.notifLoaded ? "📭 Chưa có thông báo nào" : "⏳ Đang tải..."}</div>`;
    panel = `<div class="notif-panel">
        <div class="notif-head">
          <span>Thông báo</span>
        </div>
        <div class="notif-list">${items || empty}</div>
      </div>`;
  }

  return `<div class="notif-wrap" id="notifWrap">
      <button type="button" class="notif-bell${s.notifOpen ? " open" : ""}" onclick="toggleNotifPanel()" title="Thông báo" aria-label="Thông báo">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        ${badge}
      </button>
      ${panel}
    </div>`;
}

// Chỉ thay khối chuông (không render lại cả trang).
function refreshNotifUI(){
  const wrap = document.getElementById("notifWrap");
  if (wrap) wrap.outerHTML = notifBellHtml();
}

// Mở chuông = đã xem: số đỏ trên chuông về 0 (server cũng đánh dấu đã đọc). Thông báo mới đến sau đó
// lại hiện số mới. Trong panel, các thông báo vừa xem vẫn được tô sáng cho tới khi đóng panel.
function markNotifsSeen(){
  let any = false;
  s.notifications.forEach(n => {
    if (!n.is_read) { s.notifSeen.add(n.id); n.is_read = true; any = true; }
  });
  if (any || s.notifUnread) {
    s.notifUnread = 0;
    authFetch(`${API_URL}/notifications/read-all`, { method: "POST" })
      .catch(err => console.error("Lỗi đánh dấu đã đọc:", err));
  }
}

async function toggleNotifPanel(){
  s.notifOpen = !s.notifOpen;
  if (s.notifOpen) markNotifsSeen();
  refreshNotifUI();
  if (s.notifOpen) await fetchNotifications();
}

async function fetchNotifications(fromQuests){
  if (!s.token) return;
  try {
    const res = await authFetch(`${API_URL}/notifications?limit=30`);
    if (!res.ok) return;
    const data = await res.json();
    const list = data.notifications || [];
    const maxId = list.reduce((m, n) => Math.max(m, n.id), 0);

    // Lần tải đầu tiên chỉ ghi nhớ mốc, không bật toast cho thông báo cũ.
    const prevLastId = s.notifLastId;
    s.notifLastId = Math.max(prevLastId || 0, maxId);
    const fresh = prevLastId !== null
      ? list.filter(n => n.id > prevLastId && !n.is_read).reverse().slice(-3)
      : [];
    s.notifications = list;
    s.notifUnread = data.unread || 0;
    s.notifLoaded = true;
    if (s.notifOpen) markNotifsSeen(); // đang mở chuông mà có thông báo mới -> coi như đã xem luôn
    refreshNotifUI();

    if (prevLastId !== null) {
      fresh.forEach(showNotifToast);
      // Đang ở trang Nhiệm vụ mà có nhiệm vụ mới hoàn thành -> làm mới danh sách.
      if (!fromQuests && s.view === "quests" && fresh.some(n => n.type === "quest")) fetchQuests();
    }
  } catch (err) {
    console.error("Lỗi lấy thông báo:", err);
  }
}

async function pollNotifications(){
  if (!s.token || document.hidden) return;
  try {
    const res = await authFetch(`${API_URL}/notifications/unread-count`);
    if (!res.ok) return;
    const data = await res.json();
    // Số chưa đọc đổi (có thông báo mới, hoặc đã đọc ở tab khác) / panel đang mở -> tải lại danh sách.
    if ((data.unread || 0) !== s.notifUnread || s.notifOpen) await fetchNotifications();
  } catch (err) { /* mất mạng: bỏ qua, lần sau thử lại */ }
}

function startNotifPolling(){
  if (!s.token) return;
  if (notifPollTimer) return;
  fetchNotifications();
  notifPollTimer = setInterval(pollNotifications, NOTIF_POLL_MS);
}

function stopNotifPolling(){
  if (notifPollTimer) { clearInterval(notifPollTimer); notifPollTimer = null; }
  s.notifications = [];
  s.notifUnread = 0;
  s.notifOpen = false;
  s.notifLoaded = false;
  s.notifLastId = null;
}

async function markNotifReadOnServer(id){
  try {
    await authFetch(`${API_URL}/notifications/${id}/read`, { method: "POST" });
  } catch (err) { console.error("Lỗi đánh dấu đã đọc:", err); }
}

function onNotifClick(id){
  const n = s.notifications.find(x => x.id === id);
  if (!n) return;
  if (!n.is_read) {
    n.is_read = true;
    s.notifUnread = Math.max(0, s.notifUnread - 1);
    markNotifReadOnServer(id);
  }
  s.notifOpen = false;
  if (n.type === "quest") go("quests");
  else if (n.type === "friend_request") go("friends");
  else refreshNotifUI();
}

async function markAllNotifRead(){
  s.notifications.forEach(n => { n.is_read = true; });
  s.notifUnread = 0;
  refreshNotifUI();
  try {
    await authFetch(`${API_URL}/notifications/read-all`, { method: "POST" });
  } catch (err) { console.error("Lỗi đánh dấu đã đọc tất cả:", err); }
}

// Toast nổi góc phải màn hình; gắn vào <body> (ngoài #app) nên không bị render() xóa mất.
function showNotifToast(n){
  let box = document.getElementById("notifToastBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "notifToastBox";
    box.className = "notif-toast-box";
    document.body.appendChild(box);
  }
  const el = document.createElement("div");
  el.className = "notif-toast";
  el.innerHTML = `<span class="notif-toast-icon">${notifIcon(n.type)}</span><span class="notif-toast-text">${esc(n.content)}</span>`;
  el.onclick = () => { el.remove(); onNotifClick(n.id); };
  box.appendChild(el);
  setTimeout(() => { el.classList.add("hide"); setTimeout(() => el.remove(), 400); }, 6000);
}

// Bấm ra ngoài khối chuông -> đóng panel.
document.addEventListener("click", (e) => {
  if (s.notifOpen && !(e.target.closest && e.target.closest(".notif-wrap"))) {
    s.notifOpen = false;
    refreshNotifUI();
  }
});

// ================== TÌM KIẾM NGƯỜI CHƠI (thanh menu) ==================

// Thanh menu dùng chung cho các trang home / games / game, có kèm ô tìm kiếm.
function navBar(){
  const displayName = s.nick || s.username || "GameThủ";
  const ini = displayName.slice(0, 2).toUpperCase();
  const gamesActive = (s.view === "game" || s.view === "games");
  return `<nav class="navbar">
      ${logo()}
      <div class="navlinks">
        <span class="${s.view==='home'?'active':''}" onclick="go('home')" style="cursor:pointer">Hồ sơ</span>
        <span class="${gamesActive?'active':''}" onclick="go('games')" style="cursor:pointer">Chơi ngay</span>
        <span class="${s.view==='shop'?'active':''}" onclick="go('shop')" style="cursor:pointer">Cửa hàng</span>
      </div>
      ${searchBox()}
      <div class="navuser">
        <span class="nav-gold" title="Số vàng của bạn" onclick="go('shop')">🪙 ${Number(s.gold) || 0}</span>
        ${notifBellHtml()}
        <div class="navuser-profile" onclick="go('home')" style="display:flex;align-items:center;gap:.5rem;cursor:pointer" title="Xem hồ sơ">
          <div class="avatar">${avatarHtml(s.avatar, ini)}</div>
          <span style="font-size:14.5px;font-weight:500">${esc(displayName)}</span>
        </div>
        <button class="logout" onclick="logout()">Đăng xuất</button>
      </div>
    </nav>
    ${sideBar()}`;
}

// Thanh bên trái: Chibi, Bạn bè, Tin nhắn, Nhiệm vụ (position:fixed nên không ảnh hưởng bố cục từng trang).
function sideBar(){
  const ic = (d) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const items = [
    { view: "chibi",    label: "Chibi",    badge: 0,
      icon: ic('<circle cx="12" cy="12" r="9"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line>') },
    { view: "friends",  label: "Bạn bè",   badge: s.friendsIncoming.length,
      icon: ic('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>') },
    { view: "messages", label: "Tin nhắn", badge: totalUnreadMessages(),
      icon: ic('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>') },
    { view: "history",  label: "Lịch sử",  badge: 0,
      icon: ic('<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>') },
    { view: "quests",   label: "Nhiệm vụ", badge: 0,
      icon: ic('<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle>') }
  ];
  return `<aside class="sidebar">${items.map(i => `<div class="side-item${s.view === i.view ? " active" : ""}" onclick="go('${i.view}')" title="${i.label}">
      <span class="side-icon">${i.icon}</span>
      <span class="side-label">${i.label}</span>
      ${i.badge ? `<span class="side-badge">${i.badge}</span>` : ""}
    </div>`).join("")}</aside>`;
}

function searchBox(){
  return `<div class="nav-search" id="navSearch">
    <svg class="nav-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"></circle>
      <path d="m21 21-4.35-4.35"></path>
    </svg>
    <input type="text" id="navSearchInput" class="nav-search-input" placeholder="Tìm theo tên hoặc ID..."
      value="${esc(s.searchQuery)}"
      oninput="onSearchInput(this.value)"
      onfocus="onSearchFocus()"
      onblur="onSearchBlur()"
      autocomplete="off">
    ${s.searchQuery ? `<button type="button" class="nav-search-clear" onmousedown="clearSearch()">✕</button>` : ""}
    <div class="nav-search-dropdown" id="navSearchDropdown" style="display:none"></div>
  </div>`;
}

let searchDebounceTimer = null;

function clearSearch(){
  s.searchQuery = "";
  const input = document.getElementById("navSearchInput");
  if (input) input.value = "";
  const box = document.getElementById("navSearch");
  const clearBtn = box && box.querySelector(".nav-search-clear");
  if (clearBtn) clearBtn.remove();
  const dropdown = document.getElementById("navSearchDropdown");
  if (dropdown) { dropdown.style.display = "none"; dropdown.innerHTML = ""; }
  if (input) input.focus();
}

// Gõ tới đâu tự tìm tới đó (có debounce), không render lại cả trang để không mất focus ô nhập.
function onSearchInput(val){
  s.searchQuery = val;

  const box = document.getElementById("navSearch");
  const dropdown = document.getElementById("navSearchDropdown");
  if (box && dropdown) {
    let clearBtn = box.querySelector(".nav-search-clear");
    if (val && !clearBtn) {
      clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "nav-search-clear";
      clearBtn.textContent = "✕";
      clearBtn.onmousedown = clearSearch;
      box.insertBefore(clearBtn, dropdown);
    } else if (!val && clearBtn) {
      clearBtn.remove();
    }
  }

  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  const query = val.trim();
  if (!query) {
    if (dropdown) { dropdown.style.display = "none"; dropdown.innerHTML = ""; }
    return;
  }
  if (dropdown) {
    dropdown.style.display = "block";
    dropdown.innerHTML = `<div class="nav-search-empty"><span class="nav-search-spin">◌</span> Đang tìm...</div>`;
  }
  searchDebounceTimer = setTimeout(() => doSearch(query), 300);
}

function onSearchFocus(){
  const dropdown = document.getElementById("navSearchDropdown");
  if (dropdown && dropdown.innerHTML.trim() && s.searchQuery.trim()) {
    dropdown.style.display = "block";
  }
}

function onSearchBlur(){
  // Trễ 1 chút để onmousedown trên kết quả kịp chạy trước khi dropdown bị ẩn.
  setTimeout(() => {
    const dropdown = document.getElementById("navSearchDropdown");
    if (dropdown) dropdown.style.display = "none";
  }, 150);
}

async function doSearch(query){
  const dropdown = document.getElementById("navSearchDropdown");
  try {
    const res = await fetch(`${API_URL}/search-users?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error("Tìm kiếm thất bại");
    const results = await res.json();
    if (dropdown) dropdown.innerHTML = searchResultsHtml(results);
  } catch (err) {
    console.error("Lỗi tìm kiếm người chơi:", err);
    if (dropdown) dropdown.innerHTML = `<div class="nav-search-empty"><span class="nav-search-empty-icon">⚠️</span>Không thể tìm kiếm lúc này</div>`;
  }
}

// Bôi vàng phần tên trùng khớp với từ khóa đang gõ (giống ô tìm kiếm anh hùng).
function highlightMatch(text, query){
  const q = (query || "").trim();
  if (!q) return esc(text);
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return esc(text);
  return esc(text.slice(0, idx)) + `<mark>${esc(text.slice(idx, idx + q.length))}</mark>` + esc(text.slice(idx + q.length));
}

function searchResultsHtml(results){
  if (!results || results.length === 0) {
    return `<div class="nav-search-empty">
      <span class="nav-search-empty-icon">🌌</span>
      Không tìm thấy người chơi nào
    </div>`;
  }
  const q = s.searchQuery;
  const items = results.map((r) => {
    const tier = getRankTier(r.high_score);
    const name = r.display_name || "Ẩn danh";
    return `<button type="button" class="nav-search-item" onmousedown="openProfile('${esc(r.public_id)}')">
      <div class="nav-search-avatar" style="background:linear-gradient(135deg, ${tier.color}40, ${tier.color}15);border-color:${tier.color}45;color:${tier.color}">${avatarHtml(r.avatar, name.slice(0,2).toUpperCase())}</div>
      <div class="nav-search-item-info">
        <div class="nav-search-item-name">${highlightMatch(name, q)}</div>
        <div class="nav-search-item-id">ID: ${highlightMatch(r.public_id || "--------", q)}</div>
      </div>
      <div class="nav-search-item-tier" style="background:${tier.color}18;border-color:${tier.color}38;color:${tier.color}">
        ${rankIconHtml(tier, 20)}<span class="nav-search-item-tier-label">${esc(tier.name)}</span>
      </div>
    </button>`;
  }).join("");
  return items + `<div class="nav-search-count">${results.length} kết quả</div>`;
}

// ================== HỒ SƠ NGƯỜI CHƠI KHÁC (modal) ==================
// Modal được gắn thẳng vào <body> (giống portal) để hiện được ở bất kỳ trang nào,
// không phụ thuộc vào render() của #app.

function ensureProfileModalRoot(){
  let el = document.getElementById("profileModalRoot");
  if (!el) {
    el = document.createElement("div");
    el.id = "profileModalRoot";
    document.body.appendChild(el);
  }
  return el;
}

function onProfileModalKeydown(e){
  if (e.key === "Escape") closeProfileModal();
}

function closeProfileModal(){
  const el = document.getElementById("profileModalRoot");
  if (el) el.innerHTML = "";
  document.body.style.overflow = "";
  document.removeEventListener("keydown", onProfileModalKeydown);
}

async function openProfile(publicId){
  const dropdown = document.getElementById("navSearchDropdown");
  if (dropdown) dropdown.style.display = "none";
  const searchInput = document.getElementById("navSearchInput");
  if (searchInput) searchInput.blur();

  const root = ensureProfileModalRoot();
  root.innerHTML = profileModalHtml({ loading: true });
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", onProfileModalKeydown);

  try {
    const headers = s.token ? { "Authorization": `Bearer ${s.token}` } : {};
    const res = await fetch(`${API_URL}/profile/${encodeURIComponent(publicId)}`, { headers });
    if (!res.ok) throw new Error("Không tìm thấy hồ sơ");
    const data = await res.json();
    root.innerHTML = profileModalHtml({ data });
  } catch (err) {
    console.error("Lỗi tải hồ sơ người chơi:", err);
    root.innerHTML = profileModalHtml({ error: true });
  }
}

// Nút kết bạn trong modal hồ sơ, tuỳ theo quan hệ hiện tại với người đang xem (friend_status).
function friendActionHtml(data){
  const pid = esc(data.public_id || "");
  switch (data.friend_status) {
    case "self":
      return "";
    case "friends":
      return `<div class="profile-friend-action">
        <span class="friend-btn friend-btn-friends">✓ Bạn bè</span>
        <button type="button" class="friend-btn friend-btn-chat" onclick="goToChat('${pid}')">💬 Nhắn tin</button>
        <button type="button" class="friend-btn friend-btn-remove" onclick="removeFriend('${pid}', true)">Huỷ kết bạn</button>
      </div>`;
    case "pending_sent":
      return `<div class="profile-friend-action">
        <span class="friend-btn friend-btn-pending">Đã gửi lời mời</span>
        <button type="button" class="friend-btn friend-btn-cancel" onclick="removeFriend('${pid}', true)">Huỷ lời mời</button>
      </div>`;
    case "pending_received":
      return `<div class="profile-friend-action">
        <button type="button" class="friend-btn friend-btn-accept" onclick="respondFriendRequest('${pid}','accept', true)">Chấp nhận kết bạn</button>
        <button type="button" class="friend-btn friend-btn-decline" onclick="respondFriendRequest('${pid}','decline', true)">Từ chối</button>
      </div>`;
    case "none":
      return `<div class="profile-friend-action">
        <button type="button" class="friend-btn friend-btn-add" onclick="sendFriendRequest('${pid}')">+ Kết bạn</button>
      </div>`;
    default:
      return "";
  }
}

function profileModalHtml({ loading, error, data } = {}){
  let body;

  if (loading) {
    body = `<div class="profile-modal-status">Đang tải hồ sơ...</div>`;
  } else if (error || !data) {
    body = `<div class="profile-modal-status">Không tìm thấy người chơi này 😢</div>`;
  } else {
    const name = data.display_name || "Ẩn danh";
    const ini = name.slice(0, 2).toUpperCase();
    const tier = getRankTier(data.high_score);
    const achCards = badgesFor(data.badges).map(badgeCardHtml).join("");

    body = `
      <section class="profile profile-modal-section">
        <div class="avatar-wrap">
          <div class="avatar-big">${avatarHtml(data.avatar, ini)}</div>
        </div>
        <div class="profile-info">
          <div class="eyebrow">Hồ sơ người chơi</div>
          <h2>${esc(name)}</h2>
          <div style="font-size:11px;color:rgba(248,247,244,.35)">ID: ${esc(data.public_id || "--------")}</div>
          <div class="profile-badges">
            <span class="badge badge-score">🏆    <b>${Number(data.high_score || 0).toLocaleString()} </b></span>
          </div>
          <span style="font-size:11px;color:rgba(248,247,244,.4);display:block;margin-top:6px"> · Thành viên từ 2026</span>
        </div>
        <div class="profile-rank-display">
          ${rankIconHtml(tier, 96, "profile-rank-icon")}
          <span class="profile-rank-name" style="color:${tier.color}">${esc(tier.name)}</span>
        </div>
        <div class="profile-stats">
          <div><b>${data.total_matches ?? 0}</b><small>Số trận đã chơi</small></div>
          <div><b>${data.rank || "#-"}</b><small>Xếp hạng hiện tại</small></div>
        </div>
        ${friendActionHtml(data)}
      </section>
      <div class="profile-modal-achievements">
        <div class="section-title">Thành tích</div>
        <h3>Huy hiệu</h3>
        <div class="achievements">${achCards}</div>
      </div>`;
  }

  return `<div class="profile-modal-backdrop" onmousedown="if(event.target===this) closeProfileModal()">
    <div class="profile-modal fade">
      <button type="button" class="profile-modal-close" onclick="closeProfileModal()">✕</button>
      ${body}
    </div>
  </div>`;
}

// ================== NHÂN VẬT KHỐI MÀU Ở TRANG ĐĂNG NHẬP ==================
// 4 nhân vật: cam, tím, đen, vàng. Khuôn mặt (mắt + mồm) trượt theo con trỏ, thân hơi nghiêng,
// tròng đen nhìn theo chuột, thỉnh thoảng chớp mắt và "nói chuyện". Phản ứng theo form:
//  - gõ tên đăng nhập  : cả nhóm nhìn theo con trỏ chữ trong ô, gật đầu mỗi lần gõ
//  - nhập mật khẩu     : giơ tay che mắt
//  - bấm hiện mật khẩu : bỏ tay ra, mở mắt tròn nhìn mật khẩu
//  - đăng nhập sai     : lắc đầu, mồm buồn

function buddyEyes(type){
  const eye = `<div class="bd-eye"><i class="bd-pupil"></i></div>`;
  return `<div class="bd-eyes ${type}">${eye}${eye}<b class="bd-hand l"></b><b class="bd-hand r"></b></div>`;
}

function buddiesHtml(){
  const buddy = (cls, eyeType, mouth) => `<div class="bd ${cls}">
      <div class="bd-shape"></div>
      <div class="bd-face">${buddyEyes(eyeType)}<div class="bd-mouth ${mouth}"></div></div>
    </div>`;
  return `<div class="buddies" aria-hidden="true">
      ${buddy("bd-purple", "sclera", "m-line")}
      ${buddy("bd-black",  "sclera", "m-line")}
      ${buddy("bd-yellow", "dot",    "m-line")}
      ${buddy("bd-orange", "dot",    "m-smile")}
    </div>`;
}

let lastMouse = null;

function updateBuddies(clientX, clientY){
  document.querySelectorAll(".buddies .bd").forEach((bd) => {
    const r = bd.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height * 0.3; // mặt nằm ở phần trên của khối
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, dist / 260);          // càng xa chuột càng quay hết cỡ
    const fx = (dx / dist) * 11 * k;            // mặt trượt ngang tối đa 11px
    const fy = (dy / dist) * 6 * k;             // trượt dọc tối đa 6px
    bd.style.setProperty("--fx", fx.toFixed(1) + "px");
    bd.style.setProperty("--fy", fy.toFixed(1) + "px");
    // thân nghiêng nhẹ về phía chuột (khối thấp như nửa tròn cam thì không nghiêng)
    const lean = bd.classList.contains("bd-orange") ? 0 : -Math.max(-1, Math.min(1, dx / 320)) * 4;
    bd.style.setProperty("--lean", lean.toFixed(2) + "deg");

    bd.querySelectorAll(".bd-eye").forEach((eye) => {
      const er = eye.getBoundingClientRect();
      const ex = er.left + er.width / 2;
      const ey = er.top + er.height / 2;
      const a = Math.atan2(clientY - ey, clientX - ex);
      const reach = eye.parentElement.classList.contains("dot") ? 2 : 3.5;
      const pupil = eye.firstElementChild;
      pupil.style.transform = `translate(${(Math.cos(a) * reach).toFixed(1)}px, ${(Math.sin(a) * reach).toFixed(1)}px)`;
    });
  });
}

function resetBuddies(){
  document.querySelectorAll(".buddies .bd").forEach((bd) => {
    bd.style.setProperty("--fx", "0px");
    bd.style.setProperty("--fy", "0px");
    bd.style.setProperty("--lean", "0deg");
    bd.querySelectorAll(".bd-pupil").forEach(p => { p.style.transform = ""; });
  });
}

// Chớp mắt / nói chuyện ngẫu nhiên. Một bộ đếm chung, dùng được dù trang bị dựng lại nhiều lần.
setInterval(() => {
  const now = Date.now();
  document.querySelectorAll(".buddies .bd").forEach((bd) => {
    if (!bd._nextBlink) { bd._nextBlink = now + 1200 + Math.random() * 3000; bd._nextTalk = now + 2500 + Math.random() * 5000; }
    if (now >= bd._nextBlink) {
      bd.classList.add("blink");
      setTimeout(() => bd.classList.remove("blink"), 140);
      bd._nextBlink = now + 2200 + Math.random() * 4500;
    }
    if (now >= bd._nextTalk) {
      const m = bd.querySelector(".bd-mouth");
      m.classList.add("talk");
      setTimeout(() => m.classList.remove("talk"), 1400);
      bd._nextTalk = now + 4000 + Math.random() * 7000;
    }
  });
}, 200);

// ---- phản ứng theo ô đang nhập ----
let buddyFocusEl = null;   // ô input đang được focus trong trang đăng nhập / đăng ký
let buddyMood = null;      // "sad" trong ít giây sau khi đăng nhập sai

function buddyInput(t){
  return (t && t.tagName === "INPUT" && t.closest && t.closest(".auth")) ? t : null;
}

function buddyLiveFocus(){
  return (buddyFocusEl && document.body.contains(buddyFocusEl)) ? buddyFocusEl : null;
}

// Nhìn vào đúng vị trí con trỏ chữ trong ô (ước lượng theo số ký tự đã gõ).
function lookAtField(el){
  const r = el.getBoundingClientRect();
  const x = r.left + 16 + Math.min((el.value || "").length * 8.5, Math.max(0, r.width - 60));
  updateBuddies(x, r.top + r.height / 2);
}

function applyBuddyState(){
  const root = document.querySelector(".buddies");
  if (!root) return;
  const el = buddyLiveFocus();
  const isPw = !!el && el.type === "password";
  const isPeek = !!el && el.classList.contains("input-pw") && el.type === "text";
  root.classList.toggle("shy", isPw);
  root.classList.toggle("peek", isPeek);
  root.classList.toggle("sad", buddyMood === "sad");
  if (el && !isPw) lookAtField(el);
}

function buddiesReact(mood, ms){
  buddyMood = mood;
  applyBuddyState();
  setTimeout(() => { if (buddyMood === mood) { buddyMood = null; applyBuddyState(); } }, ms || 1800);
}

document.addEventListener("focusin", (e) => {
  const el = buddyInput(e.target);
  if (el) { buddyFocusEl = el; applyBuddyState(); }
});
document.addEventListener("focusout", (e) => {
  if (buddyFocusEl === e.target) { buddyFocusEl = null; applyBuddyState(); }
});
document.addEventListener("input", (e) => {
  const el = buddyInput(e.target);
  if (!el) return;
  const root = document.querySelector(".buddies");
  if (!root) return;
  if (el.type !== "password") lookAtField(el);
  root.classList.remove("nod");
  void root.offsetWidth; // chạy lại animation gật đầu
  root.classList.add("nod");
});
document.addEventListener("mouseout", (e) => { if (!e.relatedTarget && !buddyLiveFocus()) resetBuddies(); });

document.addEventListener("mousemove", (event) => {
  lastMouse = { x: event.clientX, y: event.clientY };
  if (!buddyLiveFocus()) updateBuddies(event.clientX, event.clientY);
  const pupils = document.querySelectorAll(".pupil");
  pupils.forEach((pupil) => {
    const eye = pupil.parentElement;
    const rect = eye.getBoundingClientRect();
    const eyeX = rect.left + rect.width / 2;
    const eyeY = rect.top + rect.height / 2;
    const radian = Math.atan2(event.clientY - eyeY, event.clientX - eyeX);
    const maxDistance = 3;
    const x = Math.cos(radian) * maxDistance;
    const y = Math.sin(radian) * maxDistance;
    pupil.style.transform = `translate(${x}px, ${y}px)`;
  });

  // Cổ dài vươn theo hướng con trỏ chuột
  const rigs = document.querySelectorAll(".pet-rig");
  const maxTilt = 32; // độ nghiêng tối đa, tránh xoay quá lố
  rigs.forEach((rig) => {
    const box = rig.closest(".pet-box");
    const rect = box.getBoundingClientRect();
    const anchorX = rect.left + rect.width / 2;
    const anchorY = rect.bottom; // gốc cổ luôn cố định ở đáy pet-box
    const dx = event.clientX - anchorX;
    const dy = event.clientY - anchorY;
    let angle = Math.atan2(dx, -dy) * (180 / Math.PI);
    angle = Math.max(-maxTilt, Math.min(maxTilt, angle));
    rig.style.transform = `rotate(${angle}deg)`;
  });
});

fetchLeaderboard();
restoreSession().then((restored) => {
  if (!restored) render();
});
