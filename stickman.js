const API_URL = window.APP_CONFIG ? window.APP_CONFIG.API_URL : "https://cases-final-msg-radar.trycloudflare.com/api";

const achievements = [
  {icon:"⚔️", label:"Chiến binh", desc:"Thắng 10 trận liên tiếp", earned:true,  rarity:"Huyền thoại"},
  {icon:"🏆", label:"Vô địch",    desc:"Top 1 bảng xếp hạng",    earned:true,  rarity:"Hiếm"},
  {icon:"🎯", label:"Bắn tỉa",   desc:"Chính xác 95% cú đánh",  earned:true,  rarity:"Thường"},
  {icon:"🔥", label:"Bất diệt",  desc:"Không thua 30 ngày",      earned:false, rarity:"Siêu hiếm"},
  {icon:"💎", label:"Kim cương", desc:"Đạt rank Kim Cương",      earned:false, rarity:"Huyền thoại"},
  {icon:"⚡", label:"Sấm sét",   desc:"Kết thúc trận trong 3 phút", earned:true, rarity:"Hiếm"},
];

let dbLeaderboard = [];

// ===== Hệ thống Rank theo điểm =====
// Mỗi 200 điểm = 1 bậc. 5 đại bậc đầu (Sắt, Bạc, Vàng, Bạch Kim, Kim Cương)
// có 4 tiểu bậc IV → I. Sau đó là Cao Thủ rồi Thách Đấu (không chia tiểu bậc).
const RANK_STEP = 200;
const RANK_TIERS = [
  { name: "Sắt",       icon: "🔩", color: "#8c8c8c" },
  { name: "Bạc",       icon: "🥈", color: "#c7d0da" },
  { name: "Vàng",      icon: "🥇", color: "#e8c97a" },
  { name: "Bạch Kim",  icon: "💠", color: "#5fd0c7" },
  { name: "Kim Cương", icon: "💎", color: "#60a5fa" },
];
const RANK_SUBS = ["IV", "III", "II", "I"];
const MASTER_THRESHOLD = RANK_TIERS.length * RANK_SUBS.length * RANK_STEP; // 4000
const CHALLENGER_THRESHOLD = MASTER_THRESHOLD + 2000;                     // 6000

function getRankTier(score) {
  score = Math.max(0, Number(score) || 0);

  if (score >= CHALLENGER_THRESHOLD) {
    return { name: "Thách Đấu", icon: "👑", color: "#ff6b5f" };
  }
  if (score >= MASTER_THRESHOLD) {
    return { name: "Cao Thủ", icon: "🔥", color: "#a78bfa" };
  }

  const idx = Math.floor(score / RANK_STEP);           // bậc thứ mấy (0-based)
  const tierIdx = Math.floor(idx / RANK_SUBS.length);   // đại bậc
  const subIdx = idx % RANK_SUBS.length;                // tiểu bậc
  const tier = RANK_TIERS[tierIdx];
  return { name: `${tier.name} ${RANK_SUBS[subIdx]}`, icon: tier.icon, color: tier.color };
}

const rarityColor = {
  "Huyền thoại":"#e8c97a",
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
};

// ===== Ghi nhớ đăng nhập (để F5 / mở lại tab không bị đá về trang login) =====
// - "Ghi nhớ đăng nhập" được tick -> lưu vào localStorage (tồn tại kể cả sau khi đóng trình duyệt)
// - Không tick -> lưu vào sessionStorage (chỉ tồn tại trong tab hiện tại, mất khi đóng tab)
// Backend hiện không có token phiên, nên ta chỉ lưu username + dữ liệu hiển thị (không lưu mật khẩu),
// rồi khi tải lại trang sẽ gọi API để xác thực & làm mới dữ liệu.
const SESSION_KEY = "gz_session";
const RESTORABLE_VIEWS = ["home", "games", "game"]; // các view hợp lệ để khôi phục sau F5

function saveSession(){
  if (!s.username) return;
  const view = RESTORABLE_VIEWS.includes(s.view) ? s.view : "home";
  const payload = JSON.stringify({ username: s.username, nick: s.nick, avatar: s.avatar, token: s.token, view, selectedGame: s.selectedGame });
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
  dbLeaderboard = [];
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
  render();

  try {
    const res = await fetch(`${API_URL}/user-stats/${encodeURIComponent(s.username)}`);
    if (!res.ok) { logout(); return false; }
    const data = await res.json();
    s.userRank = data.rank;
    s.userMatches = data.total_matches;
    s.userHighScore = data.high_score || 0;
    s.userPublicId = data.public_id || "--------";
    if (data.avatar) s.avatar = data.avatar;
    saveSession();
    fetchLeaderboard();
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
      s.userPublicId = data.public_id || "--------";
      if (data.avatar) s.avatar = data.avatar;
      if (s.view === "home" || s.view === "games" || s.view === "game") render();
    }
  } catch (err) {
    console.error("Lỗi lấy thông tin profile:", err);
  }
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
    <button class="eye" type="button" onclick="toggle('${showKey}')">
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
  return `<aside class="left">
    <div class="gridbg gridbg-abs"></div>
    <div class="glow-gold glow-abs"></div>
    ${logo()}
    <div class="left-main">
      <div class="eyebrow">🎮 Game Online — Chơi ngay, thắng ngay</div>
      <h1>Sẵn sàng<br><span>chiến chưa?</span></h1>
      <p>Tham gia hàng ngàn game thủ mỗi ngày — đấu rank, leo bảng, nhận thưởng.</p>
      <div class="stats">
        <div class="stat"><b>84K+</b><small>Game thủ online</small></div>
        <div class="stat"><b>Top 2</b><small>Server Việt Nam</small></div>
        <div class="stat"><b>24/7</b><small>Máy chủ ổn định</small></div>
      </div>
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
        <div class="pets-row">
          <div class="pet-box">
            <div class="pet-rig" data-pet="cat">
              <div class="cat-orange">
                <div class="c-eyes">
                  <div class="c-eye"><div class="pupil"></div></div>
                  <div class="c-eye"><div class="pupil"></div></div>
                </div>
              </div>
              <div class="pet-neck neck-cat"></div>
            </div>
            <div class="pet-base"></div>
          </div>
          <div class="pet-box">
            <div class="pet-rig" data-pet="dog">
              <div class="dog-brown">
                <div class="dog-ear-l"></div>
                <div class="dog-ear-r"></div>
                <div class="dog-hand"></div>
                <div class="c-eyes" style="padding-top:12px">
                  <div class="c-eye"><div class="pupil"></div></div>
                  <div class="c-eye"><div class="pupil"></div></div>
                </div>
                <div class="dog-tongue"></div>
              </div>
              <div class="pet-neck neck-dog"></div>
            </div>
            <div class="pet-base"></div>
          </div>
          <div class="pet-box">
            <div class="pet-rig" data-pet="owl">
              <div class="owl-body">
                <div class="owl-eyes">
                  <div class="owl-eye"><div class="pupil" style="top:2px;left:2px"></div></div>
                  <div class="owl-eye"><div class="pupil" style="top:2px;left:2px"></div></div>
                </div>
              </div>
              <div class="pet-neck neck-owl"></div>
            </div>
            <div class="owl-branch"></div>
          </div>
          <div class="pet-box">
            <div class="pet-rig" data-pet="rabbit">
              <div class="rabbit-body">
                <div class="r-ear-l"></div>
                <div class="r-ear-r"></div>
                <div class="r-eyes">
                  <div class="r-eye"><div class="pupil r-pupil"></div></div>
                  <div class="r-eye"><div class="pupil r-pupil"></div></div>
                </div>
              </div>
              <div class="pet-neck neck-rabbit"></div>
            </div>
            <div class="pet-base"></div>
          </div>
        </div>

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
          <div style="width:64px;height:64px;background:#0c0f1a;border-radius:50%;display:grid;place-items:center;margin:0 auto 1.5rem;color:#e8c97a;font-size:28px">✓</div>
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
    ? "background:#e8c97a;color:#0c0f1a;cursor:pointer"
    : "background:rgba(232,201,122,.2);color:rgba(232,201,122,.4);cursor:not-allowed";
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
  const list = s.filter === "earned" ? achievements.filter(a => a.earned) : achievements;
  
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
          <div style="font-size:10px;color:${tier.color}">${tier.icon} ${tier.name}</div>
        </div>
      </div>`;
    }).join("");
  }

  const achCards = list.map(a => `
    <div class="achievement${a.earned ? "" : " locked"}">
      <div class="icon">${a.icon}</div>
      <strong>${a.label}</strong>
      <p>${a.desc}</p>
      <span class="rarity" style="color:${rarityColor[a.rarity]}">${a.rarity}</span>
    </div>`).join("");

  return `<div class="home fade">
    <div class="gridbg fixed-grid"></div>
    ${navBar()}
    <main class="content">
      <section class="profile">
        <div class="avatar-wrap">
          <div class="avatar-big">${avatarHtml(s.avatar, ini)}</div>
          <button class="avatar-edit-btn" type="button" onclick="triggerAvatarPicker()" title="Đổi ảnh đại diện">✏️</button>
          <input type="file" id="avatarFileInput" accept="image/*" style="display:none" onchange="onAvatarSelected(this)">
        </div>
        <div class="profile-info">
          <div class="eyebrow">Bí danh</div>
          <h2>${esc(displayName)} <button class="edit-nick-btn" onclick="go('nickname')" title="Sửa bí danh">✏️</button></h2>
          <div style="font-size:11px;color:rgba(248,247,244,.35)">ID: ${esc(s.userPublicId || "--------")}</div>
          <div class="profile-badges">
            <span class="badge badge-rank" style="color:${getRankTier(s.userHighScore).color};border-color:${getRankTier(s.userHighScore).color}66;background:${getRankTier(s.userHighScore).color}1a">${getRankTier(s.userHighScore).icon} ${getRankTier(s.userHighScore).name}</span>
            <span class="badge badge-score">
              🏆 Thành tích: <b>${Number(s.userHighScore || 0).toLocaleString()} điểm</b>
            </span>
          </div>
          <span style="font-size:11px;color:rgba(248,247,244,.4); display: block; margin-top: 6px;"> · Thành viên từ 2026</span>
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
            <div class="progress-head"><span>Tiến độ hoàn thành</span><b style="color:#e8c97a">4/6</b></div>
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
  { id:"stickman",    name:"Đấu Kiếm Que",  desc:"Đấu kiếm 1vs1 với bạn bè qua mạng — múa kiếm, hạ gục đối thủ.", icon:"🤺", tag:"ĐỐI KHÁNG", color:"#ff3b5c", playable:true  },
  { id:"snake",       name:"Rắn săn mồi",   desc:"Điều khiển con rắn, ăn mồi và tránh va chạm.",         icon:"🐍", tag:"ARCADE",     color:"#22c55e", playable:false },
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
    const res = await authFetch(`${API_URL}/start-game`, { method: "POST" });
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
  if (!s.gameSessionToken) {
    alert("Không xác định được phiên chơi, điểm chưa được lưu. Vui lòng chơi lại ván mới.");
    return null;
  }
  try {
    const res = await authFetch(`${API_URL}/update-score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: finalScore, session_token: s.gameSessionToken })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert("Lỗi khi lưu điểm: " + (data.detail || "không rõ nguyên nhân"));
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
      s.gameSessionToken = "";
      return { rank: data.rank, highScore: data.high_score || 0, totalMatches: data.total_matches };
    }
  } catch (err) {
    console.error("Lỗi lấy thông tin xếp hạng:", err);
  }
  return null;
}

let lastView = null; // theo dõi view trước đó để biết đây có phải chuyển màn thật sự không

function render(){
  const app = document.getElementById("app");
  if (typeof TetrisGame !== "undefined") {
    TetrisGame.unmount();
  }
  if (typeof StickmanDuel !== "undefined") {
    StickmanDuel.unmount();
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
  else if(s.view==="game"){
    app.innerHTML = gameView();
    s.gameSessionToken = ""; // reset, token cũ (nếu có) đã dùng xong hoặc không còn hợp lệ
    startGameSession();
    const mountPoint = document.getElementById("gameMount");
    const gameOpts = {
      onFinish: submitScore,        // lưu điểm + lấy hạng, không tự chuyển trang
      onGoHome: () => go("home")    // chỉ chuyển trang khi người chơi bấm "Về trang chủ" / "Thoát"
    };
    if (mountPoint && s.selectedGame === "stickman" && typeof StickmanDuel !== "undefined") {
      StickmanDuel.mount(mountPoint, Object.assign({}, gameOpts, { apiUrl: API_URL }));
    } else if (mountPoint && typeof TetrisGame !== "undefined") {
      TetrisGame.mount(mountPoint, gameOpts);
    }
  }
  else                         app.innerHTML = homeView();
}

function go(view, gameId){
  if(view==="login") s.regOk = false;
  if(gameId) s.selectedGame = gameId;
  s.view = view;
  if(view === "home") {
    fetchLeaderboard();
    fetchUserStats();
  }
  render();
  saveSession();
}

function toggle(key){ s[key] = !s[key]; render(); }

async function doLogin(e){
  e.preventDefault();
  const username = s.username.trim();
  const password = s.loginPass;

  if(!username || !password) return;

  if (username.length < 8 || password.length < 8) {
    showFieldError("loginErrorBox", "Tài khoản và mật khẩu phải có ít nhất 8 ký tự");
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
      if (data.nickname && data.nickname.trim() !== "") {
        s.nick = data.nickname;
        s.view = "games";
        saveSession();
        fetchLeaderboard();
        fetchUserStats();
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
        <span>Cửa hàng</span>
      </div>
      ${searchBox()}
      <div class="navuser">
        <div class="navuser-profile" onclick="go('home')" style="display:flex;align-items:center;gap:.5rem;cursor:pointer" title="Xem hồ sơ">
          <div class="avatar">${avatarHtml(s.avatar, ini)}</div>
          <span style="font-size:14.5px;font-weight:500">${esc(displayName)}</span>
        </div>
        <button class="logout" onclick="logout()">Đăng xuất</button>
      </div>
    </nav>`;
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
        <span>${tier.icon}</span><span class="nav-search-item-tier-label">${esc(tier.name)}</span>
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
    const res = await fetch(`${API_URL}/profile/${encodeURIComponent(publicId)}`);
    if (!res.ok) throw new Error("Không tìm thấy hồ sơ");
    const data = await res.json();
    root.innerHTML = profileModalHtml({ data });
  } catch (err) {
    console.error("Lỗi tải hồ sơ người chơi:", err);
    root.innerHTML = profileModalHtml({ error: true });
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
    const achCards = achievements.map(a => `
      <div class="achievement${a.earned ? "" : " locked"}">
        <div class="icon">${a.icon}</div>
        <strong>${a.label}</strong>
        <p>${a.desc}</p>
        <span class="rarity" style="color:${rarityColor[a.rarity]}">${a.rarity}</span>
      </div>`).join("");

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
            <span class="badge badge-rank" style="color:${tier.color};border-color:${tier.color}66;background:${tier.color}1a">${tier.icon} ${tier.name}</span>
            <span class="badge badge-score">🏆 Thành tích: <b>${Number(data.high_score || 0).toLocaleString()} điểm</b></span>
          </div>
          <span style="font-size:11px;color:rgba(248,247,244,.4);display:block;margin-top:6px"> · Thành viên từ 2026</span>
        </div>
        <div class="profile-stats">
          <div><b>${data.total_matches ?? 0}</b><small>Số trận đã chơi</small></div>
          <div><b>${data.rank || "#-"}</b><small>Xếp hạng hiện tại</small></div>
        </div>
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

document.addEventListener("mousemove", (event) => {
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