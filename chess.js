// file: chess.js
const ChessGame = (function () {
  let container = null;
  let socket = null;
  let game = null;    // Instance của chess.js (Logic luật cờ)
  let board = null;   // Instance của chessboard.js (UI bàn cờ)
  let myColor = 'white';
  let room = '';
  let gameStarted = false;
  let options = {};
  let lobbyPollTimer = null;
  let inRoom = false; // false = đang ở sảnh, true = đang trong phòng (chờ hoặc đang chơi)
  let opponentInfo = null; // { name, avatar, score } của đối thủ trong phòng hiện tại

  // ============ ĐỒNG HỒ ĐẾM GIỜ MỖI LƯỢT (1 phút / lượt) ============
  const TURN_SECONDS = 60;          // mỗi người có 60 giây để suy nghĩ mỗi lượt
  const RING_CIRC = 125.66;         // chu vi vòng tròn đếm giờ (2*pi*r, r=20)
  let turnTimerId = null;           // id của setInterval đang chạy
  let turnDeadline = 0;             // mốc thời gian (ms) mà lượt hiện tại sẽ hết giờ
  let timedOut = false;             // true khi đã có người bị xử thua vì hết giờ trong ván này
  let checkFlashTimer = null;       // id timeout đang chờ tắt hiệu ứng "CHIẾU!"

  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function html() {
    return `
    <style>
      .chess-container { display:flex; flex-direction:column; align-items:center; padding:2rem; width:100%; max-width:800px; margin:0 auto; }
      .chess-title { color:#8b5cf6; font-family:Fraunces,serif; font-size: 2.2rem; margin-bottom: 1rem; text-shadow: 0 0 15px rgba(139,92,246,0.4); }

      .chess-lobby-panel { width:100%; max-width:560px; background:rgba(20,20,20,0.8); padding:1.4rem; border-radius:14px; border:1px solid #333; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
      .chess-lobby-actions { display:flex; gap:10px; margin-bottom:1.2rem; flex-wrap:wrap; }
      .chess-lobby-actions button#btnCreate { background:#8b5cf6; color:#000; border:none; padding:0.7rem 1.2rem; border-radius:6px; cursor:pointer; font-weight:700; transition:0.3s; font-family:'Manrope',sans-serif; white-space:nowrap; }
      .chess-lobby-actions button#btnCreate:hover { background:#a78bfa; box-shadow:0 0 15px rgba(139,92,246,0.6); transform: translateY(-2px); }
      .chess-lobby-actions button#btnCreate:disabled { opacity:0.5; cursor:default; transform:none; box-shadow:none; }
      .chess-lobby-search { display:flex; gap:8px; flex:1; min-width:220px; }
      .chess-lobby-search input { flex:1; background:#111; border:1px solid #444; color:#fff; padding:0.6rem 0.8rem; border-radius:6px; outline:none; font-family:'Manrope',sans-serif; text-transform:uppercase; letter-spacing:1px; min-width:0; }
      .chess-lobby-search input:focus { border-color:#8b5cf6; }
      .chess-lobby-search button { background:#2a2a2a; color:#8b5cf6; border:1px solid #8b5cf6; padding:0.6rem 1rem; border-radius:6px; cursor:pointer; font-weight:700; transition:0.3s; font-family:'Manrope',sans-serif; white-space:nowrap; }
      .chess-lobby-search button:hover { background:#3a3a3a; box-shadow:0 0 15px rgba(139,92,246,0.3); }

      .chess-lobby-list-header { display:flex; align-items:center; justify-content:space-between; color:#aaa; font-size:0.9rem; margin-bottom:0.6rem; font-weight:600; letter-spacing:0.5px; }
      .chess-lobby-list-header button { background:transparent; border:none; color:#8b5cf6; cursor:pointer; font-size:1.1rem; padding:2px 8px; border-radius:6px; transition:0.2s; }
      .chess-lobby-list-header button:hover { background:rgba(139,92,246,0.15); }
      .chess-room-list { display:flex; flex-direction:column; gap:8px; max-height:320px; overflow-y:auto; }
      .chess-room-item { display:flex; align-items:center; justify-content:space-between; gap:10px; background:#161616; border:1px solid #333; border-radius:8px; padding:0.7rem 0.9rem; cursor:pointer; transition:0.2s; text-align:left; width:100%; }
      .chess-room-item:hover { border-color:#8b5cf6; background:#1e1e1e; }
      .chess-room-item .room-info { display:flex; flex-direction:column; gap:2px; overflow:hidden; }
      .chess-room-item .room-creator { color:#f0e6c8; font-weight:600; font-family:'Manrope',sans-serif; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .chess-room-item .room-code { color:#888; font-size:0.8rem; letter-spacing:1px; font-family:monospace; }
      .chess-room-item .room-join-badge { background:rgba(139,92,246,0.15); color:#8b5cf6; border:1px solid rgba(139,92,246,0.4); padding:0.35rem 0.8rem; border-radius:20px; font-size:0.85rem; font-weight:700; white-space:nowrap; }
      .chess-room-empty { color:#777; text-align:center; padding:1.5rem 0.5rem; font-size:0.95rem; }

      #gameStatus { color: #aaa; margin: 1.5rem 0 1rem; font-size: 1.1rem; min-height: 24px; text-align: center; font-weight:500; }
      #gameStatus .room-id-tag { display:inline-block; margin-left:8px; background:rgba(139,92,246,0.12); color:#8b5cf6; border:1px solid rgba(139,92,246,0.35); padding:0.15rem 0.6rem; border-radius:12px; font-family:monospace; letter-spacing:1px; font-size:0.85rem; }

      .chess-match-area { display:flex; flex-direction:column; align-items:center; gap:10px; width:100%; max-width:462px; }
      .player-badge { position:relative; display:flex; align-items:center; gap:10px; width:100%; background:rgba(20,20,20,0.85); border:1px solid #333; border-radius:10px; padding:0.5rem 0.8rem; box-sizing:border-box; }
      .player-badge-top { justify-content:flex-end; }
      .player-badge-top .player-badge-info { align-items:flex-end; text-align:right; order:1; }
      .player-badge-top .player-badge-avatar { order:2; }
      .player-badge-bottom { justify-content:flex-start; }
      .player-badge.is-me { border-color:rgba(139,92,246,0.4); box-shadow:0 0 12px rgba(139,92,246,0.1); }
      .player-badge.is-turn { border-color:#00d4ff; box-shadow:0 0 12px rgba(0,212,255,0.25); }
      .player-badge-avatar { width:40px; height:40px; min-width:40px; border-radius:50%; background:linear-gradient(135deg,#3a3a3a,#222); border:1px solid #444; display:flex; align-items:center; justify-content:center; font-weight:700; color:#8b5cf6; font-size:0.85rem; overflow:hidden; flex-shrink:0; }
      .player-badge-avatar img { width:100%; height:100%; object-fit:cover; }
      .avatar-ring { position:relative; width:46px; height:46px; min-width:46px; flex-shrink:0; }
      .avatar-ring .player-badge-avatar { position:absolute; top:3px; left:3px; }
      .avatar-ring-svg { position:absolute; top:0; left:0; width:46px; height:46px; transform:rotate(-90deg); pointer-events:none; }
      .avatar-ring-bg { fill:none; stroke:rgba(255,255,255,0.1); stroke-width:3; }
      .avatar-ring-progress { fill:none; stroke:#fff; stroke-width:3; stroke-linecap:round; stroke-dasharray:125.66; stroke-dashoffset:0; opacity:0; transition: stroke-dashoffset 0.2s linear, stroke 0.3s, opacity 0.2s; }
      .avatar-ring-progress.is-warning { stroke:#ff4c4c; }
      .player-badge-info { display:flex; flex-direction:column; gap:1px; overflow:hidden; min-width:0; }
      .player-badge-name { color:#f0e6c8; font-weight:600; font-family:'Manrope',sans-serif; font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px; }
      .player-badge-score { color:#888; font-size:0.78rem; font-family:'Manrope',sans-serif; }
      .player-badge-score b { color:#8b5cf6; }

      .result-badge { position:absolute; top:-12px; right:12px; padding:4px 16px; border-radius:20px; font-family:'Manrope',sans-serif; font-weight:800; font-size:0.95rem; letter-spacing:1.5px; opacity:0; transform:translateY(6px) scale(0.85); transition: opacity 0.35s ease, transform 0.35s ease; pointer-events:none; z-index:6; }
      .result-badge.is-visible { opacity:1; transform:translateY(0) scale(1); }
      .result-badge.is-win { background:rgba(56,161,105,0.2); color:#4ade80; border:1px solid rgba(74,222,128,0.7); box-shadow:0 0 18px rgba(74,222,128,0.45); }
      .result-badge.is-lose { background:rgba(255,76,76,0.18); color:#ff6b6b; border:1px solid rgba(255,107,107,0.7); box-shadow:0 0 18px rgba(255,76,76,0.4); }
      .result-badge.is-draw { background:rgba(139,92,246,0.18); color:#8b5cf6; border:1px solid rgba(139,92,246,0.7); box-shadow:0 0 18px rgba(139,92,246,0.35); }

      .board-wrapper { box-shadow: 0 0 30px rgba(139,92,246,0.15); border-radius: 6px; padding: 6px; background: #222; border: 1px solid #333; }
      .board-relative { position:relative; width:450px; }
      .move-hints-layer { position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:5; }
      .move-hint { position:absolute; width:22px; height:22px; margin-left:-11px; margin-top:-11px; border-radius:50%; background:rgba(255,255,255,0.85); box-shadow:0 1px 5px rgba(0,0,0,0.55); }
      .move-hint.is-capture { width:52px; height:52px; margin-left:-26px; margin-top:-26px; background:transparent; border:5px solid rgba(255,255,255,0.85); box-shadow:0 1px 5px rgba(0,0,0,0.4); box-sizing:border-box; }
      .check-flash { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%) scale(0.6); pointer-events:none; z-index:20; font-family:Fraunces,serif; font-weight:700; font-size:3rem; letter-spacing:4px; color:#ff4c4c; text-shadow:0 0 20px rgba(255,76,76,0.9), 0 0 45px rgba(255,76,76,0.5); opacity:0; }
      .check-flash.is-active { animation: checkFlashPop 1.1s ease-out; }
      @keyframes checkFlashPop {
        0% { opacity:0; transform:translate(-50%,-50%) scale(0.6); }
        15% { opacity:1; transform:translate(-50%,-50%) scale(1.1); }
        30% { opacity:1; transform:translate(-50%,-50%) scale(1); }
        75% { opacity:1; transform:translate(-50%,-50%) scale(1); }
        100% { opacity:0; transform:translate(-50%,-50%) scale(1); }
      }
      #board [data-square] { cursor:pointer; }
      #board [data-square].square-selected { box-shadow: inset 0 0 0 9999px rgba(139,92,246,0.35); }
      #board [data-square].square-last-move { box-shadow: inset 0 0 0 9999px rgba(0,212,255,0.35); }
      #board [data-square].square-selected.square-last-move { box-shadow: inset 0 0 0 9999px rgba(139,92,246,0.35), inset 0 0 0 9999px rgba(0,212,255,0.25); }
      .chess-exit { margin-top: 2rem; background: transparent; border: 1px solid #555; color: #888; padding: 0.6rem 1.5rem; border-radius: 20px; cursor: pointer; transition: 0.3s; font-family:'Manrope',sans-serif; }
      .chess-exit:hover { background: #333; color: #fff; border-color: #fff; }
      .chess-home-link { margin-top:1rem; background: transparent; border:none; color:#777; cursor:pointer; text-decoration:underline; font-family:'Manrope',sans-serif; font-size:0.85rem; }
      .chess-home-link:hover { color:#ccc; }
    </style>
    <div class="chess-container">
      <h2 class="chess-title">CỜ VUA ONLINE</h2>

      <div id="lobbyPanel" class="chess-lobby-panel">
        <div class="chess-lobby-actions">
          <button id="btnCreate">➕ Tạo phòng mới</button>
          <div class="chess-lobby-search">
            <input id="roomCode" type="text" maxlength="12" placeholder="Nhập ID phòng để vào...">
            <button id="btnJoin">Vào phòng</button>
          </div>
        </div>
        <div class="chess-lobby-list-header">
          <span>Phòng đang chờ đối thủ</span>
          <button id="btnRefreshRooms" title="Làm mới danh sách">⟳</button>
        </div>
        <div id="roomList" class="chess-room-list">
          <div class="chess-room-empty">Đang tải danh sách phòng...</div>
        </div>
      </div>

      <div id="gameStatus" style="display:none;"></div>

      <div class="chess-match-area" id="matchArea" style="display:none;">
        <div class="player-badge player-badge-top" id="opponentBadge">
          <div class="avatar-ring">
            <svg class="avatar-ring-svg" viewBox="0 0 46 46">
              <circle class="avatar-ring-bg" cx="23" cy="23" r="20"></circle>
              <circle class="avatar-ring-progress" id="opponentAvatarRing" cx="23" cy="23" r="20"></circle>
            </svg>
            <div class="player-badge-avatar" id="opponentAvatar">?</div>
          </div>
          <div class="player-badge-info">
            <span class="player-badge-name" id="opponentName">Đang chờ đối thủ...</span>
            <span class="player-badge-score" id="opponentScore"></span>
          </div>
          <div class="result-badge" id="opponentResultBadge"></div>
        </div>

        <div class="board-wrapper" id="boardWrapper">
          <div class="board-relative">
            <div id="board" style="width: 450px;"></div>
            <div id="moveHints" class="move-hints-layer"></div>
            <div id="checkFlash" class="check-flash" aria-hidden="true">CHIẾU!</div>
          </div>
        </div>

        <div class="player-badge player-badge-bottom is-me" id="myBadge">
          <div class="avatar-ring">
            <svg class="avatar-ring-svg" viewBox="0 0 46 46">
              <circle class="avatar-ring-bg" cx="23" cy="23" r="20"></circle>
              <circle class="avatar-ring-progress" id="myAvatarRing" cx="23" cy="23" r="20"></circle>
            </svg>
            <div class="player-badge-avatar" id="myAvatar">?</div>
          </div>
          <div class="player-badge-info">
            <span class="player-badge-name" id="myName">Bạn</span>
            <span class="player-badge-score" id="myScore"></span>
          </div>
          <div class="result-badge" id="myResultBadge"></div>
        </div>
      </div>

      <button id="btnExit" class="chess-exit" style="display:none;">← Thoát trận (về sảnh)</button>
      <button id="btnHome" class="chess-home-link">🏠 Về trang chủ</button>
    </div>
    `;
  }

  // Chuẩn hoá base URL: dù options.apiUrl được truyền có sẵn hậu tố "/api" hay không,
  // hàm này luôn trả về gốc KHÔNG có "/api" ở cuối — mọi nơi gọi API sẽ tự thêm "/api/..." phía sau,
  // tránh bị lặp thành "/api/api/..." (lỗi từng khiến WebSocket không kết nối được).
  function apiBase() {
    let base = options.apiUrl || "http://localhost:8000/api";
    base = base.replace(/\/+$/, '');       // bỏ dấu / thừa ở cuối
    base = base.replace(/\/api$/i, '');    // bỏ hậu tố /api nếu có, sẽ tự thêm lại khi dùng
    return base;
  }

  // ================= SẢNH CHỜ =================

  function timeAgoLabel(createdAtSeconds) {
    const diff = Math.max(0, Math.floor(Date.now() / 1000 - createdAtSeconds));
    if (diff < 60) return "vừa xong";
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    return `${Math.floor(diff / 3600)} giờ trước`;
  }

  function renderRoomList(rooms) {
    const listEl = document.getElementById('roomList');
    if (!listEl) return;

    if (!rooms || rooms.length === 0) {
      listEl.innerHTML = `<div class="chess-room-empty">Chưa có phòng nào đang chờ.<br>Hãy tạo phòng mới để bắt đầu!</div>`;
      return;
    }

    listEl.innerHTML = rooms.map(r => `
      <button type="button" class="chess-room-item" data-room-code="${esc(r.room_code)}">
        <div class="room-info">
          <span class="room-creator">${esc(r.creator_name || "Ẩn danh")}</span>
          <span class="room-code">ID: ${esc(r.room_code)} · ${esc(timeAgoLabel(r.created_at))}</span>
        </div>
        <span class="room-join-badge">Vào chơi</span>
      </button>
    `).join('');

    listEl.querySelectorAll('.chess-room-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.getAttribute('data-room-code');
        joinRoom(code);
      });
    });
  }

  async function refreshRoomList() {
    const listEl = document.getElementById('roomList');
    try {
      const res = await fetch(`${apiBase()}/api/duel/rooms?game=chess`);
      if (!res.ok) throw new Error('Không tải được danh sách phòng');
      const rooms = await res.json();
      renderRoomList(rooms);
    } catch (err) {
      console.error('Lỗi tải danh sách phòng cờ vua:', err);
      if (listEl) listEl.innerHTML = `<div class="chess-room-empty">Không thể tải danh sách phòng lúc này. Nhấn ⟳ để thử lại.</div>`;
    }
  }

  function startLobbyPolling() {
    stopLobbyPolling();
    refreshRoomList();
    lobbyPollTimer = setInterval(refreshRoomList, 4000);
  }

  function stopLobbyPolling() {
    if (lobbyPollTimer) {
      clearInterval(lobbyPollTimer);
      lobbyPollTimer = null;
    }
  }

  async function createRoom() {
    const btn = document.getElementById('btnCreate');
    if (btn) { btn.disabled = true; btn.textContent = 'Đang tạo phòng...'; }
    try {
      const res = await fetch(`${apiBase()}/api/duel/create-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: 'chess', creator_name: options.playerName || 'Ẩn danh' })
      });
      if (!res.ok) throw new Error('Tạo phòng thất bại');
      const data = await res.json();
      connectWS(true, data.room_code);
    } catch (err) {
      console.error('Lỗi tạo phòng cờ vua:', err);
      alert('Không thể tạo phòng lúc này, vui lòng thử lại.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '➕ Tạo phòng mới'; }
    }
  }

  function joinRoom(code) {
    const trimmed = (code || '').trim();
    if (!trimmed) {
      alert('Vui lòng nhập ID phòng!');
      return;
    }
    connectWS(false, trimmed);
  }

  function showLobby() {
    inRoom = false;
    const lobbyPanel = document.getElementById('lobbyPanel');
    const statusEl = document.getElementById('gameStatus');
    const matchArea = document.getElementById('matchArea');
    const exitBtn = document.getElementById('btnExit');
    if (lobbyPanel) lobbyPanel.style.display = '';
    if (statusEl) { statusEl.style.display = 'none'; statusEl.innerHTML = ''; }
    if (matchArea) matchArea.style.display = 'none';
    if (exitBtn) exitBtn.style.display = 'none';
    gameStarted = false;
    opponentInfo = null;
    clearResultBanners();
    startLobbyPolling();
  }

  function enterRoomView() {
    inRoom = true;
    stopLobbyPolling();
    const lobbyPanel = document.getElementById('lobbyPanel');
    const statusEl = document.getElementById('gameStatus');
    const matchArea = document.getElementById('matchArea');
    const exitBtn = document.getElementById('btnExit');
    if (lobbyPanel) lobbyPanel.style.display = 'none';
    if (statusEl) statusEl.style.display = '';
    if (matchArea) matchArea.style.display = '';
    if (exitBtn) exitBtn.style.display = '';
    renderMyBadge();
    renderOpponentBadge(null);
  }

  // ================= KHUNG NGƯỜI CHƠI (avatar / tên / điểm) =================

  // Chỉ chấp nhận avatar dạng data URL ảnh hợp lệ, giống cách app.js xác thực —
  // tránh chèn mã độc qua trường avatar được trao đổi qua WebSocket.
  function avatarInnerHtml(avatarData, initials) {
    const isSafeImage = typeof avatarData === "string" && /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(avatarData);
    if (isSafeImage) return `<img src="${esc(avatarData)}" alt="avatar">`;
    return esc((initials || "?").slice(0, 2).toUpperCase());
  }

  function renderMyBadge() {
    const avatarEl = document.getElementById('myAvatar');
    const nameEl = document.getElementById('myName');
    const scoreEl = document.getElementById('myScore');
    const name = options.playerName || 'Bạn';
    if (avatarEl) avatarEl.innerHTML = avatarInnerHtml(options.playerAvatar, name);
    if (nameEl) nameEl.textContent = name;
    if (scoreEl) scoreEl.innerHTML = `🏆 <b>${Number(options.playerScore || 0).toLocaleString()}</b> điểm`;
  }

  function renderOpponentBadge(info) {
    const avatarEl = document.getElementById('opponentAvatar');
    const nameEl = document.getElementById('opponentName');
    const scoreEl = document.getElementById('opponentScore');
    if (!info) {
      if (avatarEl) avatarEl.innerHTML = '?';
      if (nameEl) nameEl.textContent = 'Đang chờ đối thủ...';
      if (scoreEl) scoreEl.innerHTML = '';
      return;
    }
    const name = info.name || 'Đối thủ';
    if (avatarEl) avatarEl.innerHTML = avatarInnerHtml(info.avatar, name);
    if (nameEl) nameEl.textContent = name;
    if (scoreEl) scoreEl.innerHTML = `🏆 <b>${Number(info.score || 0).toLocaleString()}</b> điểm`;
  }

  // Tô sáng khung của người đang tới lượt đi
  function updateTurnHighlight() {
    const myBadge = document.getElementById('myBadge');
    const opponentBadge = document.getElementById('opponentBadge');
    if (!myBadge || !opponentBadge) return;
    if (!gameStarted || !game || game.game_over()) {
      myBadge.classList.remove('is-turn');
      opponentBadge.classList.remove('is-turn');
      return;
    }
    const isMyTurn = (game.turn() === myColor.charAt(0));
    myBadge.classList.toggle('is-turn', isMyTurn);
    opponentBadge.classList.toggle('is-turn', !isMyTurn);
  }

  // ================= ĐỒNG HỒ ĐẾM GIỜ MỖI LƯỢT =================

  function stopTurnTimer() {
    if (turnTimerId) {
      clearInterval(turnTimerId);
      turnTimerId = null;
    }
  }

  // Vẽ vòng tròn trắng quanh avatar của người đang tới lượt, co dần lại theo thời gian còn lại.
  // Avatar của người kia được ẩn vòng tròn (đang chờ, không tính giờ).
  function renderTurnRing(pct, isMyTurn) {
    const myRing = document.getElementById('myAvatarRing');
    const oppRing = document.getElementById('opponentAvatarRing');
    const offset = RING_CIRC * (1 - Math.max(0, Math.min(1, pct)));
    const isWarning = pct <= (10 / TURN_SECONDS); // 10 giây cuối -> chuyển đỏ

    if (myRing) {
      if (isMyTurn === true) {
        myRing.style.opacity = '1';
        myRing.style.strokeDashoffset = String(offset);
        myRing.classList.toggle('is-warning', isWarning);
      } else {
        myRing.style.opacity = '0';
      }
    }
    if (oppRing) {
      if (isMyTurn === false) {
        oppRing.style.opacity = '1';
        oppRing.style.strokeDashoffset = String(offset);
        oppRing.classList.toggle('is-warning', isWarning);
      } else {
        oppRing.style.opacity = '0';
      }
    }
  }

  // Bắt đầu đếm ngược 60 giây cho lượt hiện tại (gọi lại mỗi khi lượt đổi sang người khác)
  function startTurnTimer() {
    stopTurnTimer();
    if (!gameStarted || !game || game.game_over() || timedOut) {
      renderTurnRing(1, null);
      return;
    }
    turnDeadline = Date.now() + TURN_SECONDS * 1000;
    const isMyTurn = (game.turn() === myColor.charAt(0));

    const tick = () => {
      const remainingMs = Math.max(0, turnDeadline - Date.now());
      renderTurnRing(remainingMs / (TURN_SECONDS * 1000), isMyTurn);
      if (remainingMs <= 0) {
        stopTurnTimer();
        if (isMyTurn) {
          handleLocalTimeout();
        } else {
          // Đồng hồ CỦA MÌNH cũng cho thấy đối thủ đã hết giờ suy nghĩ.
          // Không chỉ ngồi chờ tin nhắn 'timeout' từ đối thủ nữa (vì tin nhắn đó
          // có thể bị mất nếu mất kết nối / đối thủ tắt tab đúng lúc hết giờ,
          // khiến cả 2 bên không bao giờ được cộng/trừ điểm). Tự báo cáo luôn.
          handleOpponentTimeout();
        }
      }
    };
    tick();
    turnTimerId = setInterval(tick, 200);
  }

  // Mình vừa hết giờ suy nghĩ -> tự xử thua, báo cho đối thủ và server
  function handleLocalTimeout() {
    if (timedOut || !gameStarted || !game || game.game_over()) return;
    timedOut = true;
    stopTurnTimer();
    renderTurnRing(0, true);

    const statusEl = document.getElementById('gameStatus');
    if (statusEl) {
      statusEl.innerHTML = `<span style="color:#ff4c4c"><b>Hết giờ!</b> Bạn đã hết 1 phút suy nghĩ và bị xử thua.</span><span class="room-id-tag">Phòng: ${esc(room)}</span>`;
    }
    updateTurnHighlight();
    showResultBanners('loss');

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'timeout' }));
    }
    if (!resultReported) {
      resultReported = true;
      reportChessResult('loss');
    }
  }

  // Đối thủ báo hết giờ -> mình thắng
  function handleOpponentTimeout() {
    if (timedOut || !gameStarted) return;
    timedOut = true;
    stopTurnTimer();
    renderTurnRing(0, false);

    const statusEl = document.getElementById('gameStatus');
    if (statusEl) {
      statusEl.innerHTML = `<span style="color:#38a169"><b>Đối thủ đã hết giờ suy nghĩ!</b> Bạn thắng.</span><span class="room-id-tag">Phòng: ${esc(room)}</span>`;
    }
    updateTurnHighlight();
    showResultBanners('win');

    if (!resultReported) {
      resultReported = true;
      reportChessResult('win');
    }
  }

  // ================= HIỆU ỨNG "CHIẾU!" & NHÃN KẾT QUẢ (WIN/LOSE) =================

  // Hiện chữ "CHIẾU!" giữa bàn cờ trong chốc lát rồi tự tắt (không phải chiếu hết)
  function flashCheck() {
    const el = document.getElementById('checkFlash');
    if (!el) return;
    if (checkFlashTimer) { clearTimeout(checkFlashTimer); checkFlashTimer = null; }
    el.classList.remove('is-active');
    void el.offsetWidth; // ép trình duyệt reflow để có thể chạy lại animation từ đầu
    el.classList.add('is-active');
    checkFlashTimer = setTimeout(() => {
      el.classList.remove('is-active');
      checkFlashTimer = null;
    }, 1100);
  }

  // Xoá nhãn WIN/LOSE/HÒA trên cả 2 khung (gọi khi bắt đầu ván mới)
  function clearResultBanners() {
    const myBadgeResult = document.getElementById('myResultBadge');
    const oppBadgeResult = document.getElementById('opponentResultBadge');
    [myBadgeResult, oppBadgeResult].forEach(el => {
      if (!el) return;
      el.classList.remove('is-visible', 'is-win', 'is-lose', 'is-draw');
      el.textContent = '';
    });
    if (checkFlashTimer) { clearTimeout(checkFlashTimer); checkFlashTimer = null; }
    const flashEl = document.getElementById('checkFlash');
    if (flashEl) flashEl.classList.remove('is-active');
  }

  // Hiện nhãn WIN cho bên thắng, LOSE cho bên thua (result là kết quả của MÌNH: 'win' | 'loss' | 'draw')
  function showResultBanners(result) {
    const myBadgeResult = document.getElementById('myResultBadge');
    const oppBadgeResult = document.getElementById('opponentResultBadge');
    if (!myBadgeResult || !oppBadgeResult) return;

    myBadgeResult.classList.remove('is-win', 'is-lose', 'is-draw');
    oppBadgeResult.classList.remove('is-win', 'is-lose', 'is-draw');

    if (result === 'win') {
      myBadgeResult.textContent = 'WIN';
      oppBadgeResult.textContent = 'LOSE';
      myBadgeResult.classList.add('is-win');
      oppBadgeResult.classList.add('is-lose');
    } else if (result === 'loss') {
      myBadgeResult.textContent = 'LOSE';
      oppBadgeResult.textContent = 'WIN';
      myBadgeResult.classList.add('is-lose');
      oppBadgeResult.classList.add('is-win');
    } else if (result === 'draw') {
      myBadgeResult.textContent = 'HÒA';
      oppBadgeResult.textContent = 'HÒA';
      myBadgeResult.classList.add('is-draw');
      oppBadgeResult.classList.add('is-draw');
    } else {
      return;
    }

    requestAnimationFrame(() => {
      myBadgeResult.classList.add('is-visible');
      oppBadgeResult.classList.add('is-visible');
    });
  }

  // ================= VÁN CỜ =================

  function updateStatus() {
    const statusEl = document.getElementById('gameStatus');
    updateTurnHighlight();
    if (!statusEl) return;
    const roomTag = `<span class="room-id-tag">Phòng: ${esc(room)}</span>`;

    if (!gameStarted) {
      statusEl.innerHTML = `Đang chờ đối thủ kết nối...${roomTag}`;
      statusEl.style.color = "#aaa";
      stopTurnTimer();
      renderTurnRing(1, null);
      return;
    }

    let statusHTML = '';
    let moveColor = game.turn() === 'w' ? 'Trắng' : 'Đen';
    let isMyTurn = (game.turn() === myColor.charAt(0));

    if (game.in_checkmate()) {
      statusHTML = `<b>Ván đấu kết thúc!</b> Quân ${moveColor} đã bị chiếu hết.`;
      statusEl.style.color = "#ff4c4c";
      stopTurnTimer();
      renderTurnRing(1, null);
    } else if (game.in_draw() || game.in_stalemate() || game.in_threefold_repetition()) {
      statusHTML = `<b>Ván đấu kết thúc!</b> Hòa cờ.`;
      statusEl.style.color = "#8b5cf6";
      stopTurnTimer();
      renderTurnRing(1, null);
    } else {
      statusHTML = `Lượt đi của: <b>Quân ${moveColor}</b> ` + (isMyTurn ? "(Tới lượt bạn)" : "(Chờ đối thủ)") + ` · <span style="opacity:0.8">1 phút/lượt</span>`;
      statusEl.style.color = isMyTurn ? "#00d4ff" : "#aaa";
      if (game.in_check()) {
        statusHTML += ` - <span style="color:#ff4c4c; font-weight:bold;">Đang bị chiếu!</span>`;
        flashCheck();
      }
      if (!timedOut) startTurnTimer();
    }
    statusEl.innerHTML = statusHTML + roomTag;
    handleGameEndIfNeeded();
  }

  // ================= BÁO CÁO KẾT QUẢ CỜ VUA (cộng/trừ điểm) =================
  let resultReported = false; // chỉ báo cáo kết quả 1 lần cho mỗi ván

  function handleGameEndIfNeeded() {
    if (resultReported || !gameStarted || !game) return;
    let result = null;
    if (game.in_checkmate()) {
      const loserColor = game.turn(); // bên đang cần đi mà bị chiếu hết -> bên đó thua
      result = (loserColor === myColor.charAt(0)) ? 'loss' : 'win';
    } else if (game.in_draw() || game.in_stalemate() || game.in_threefold_repetition()) {
      result = 'draw';
    }
    if (!result) return;
    resultReported = true;
    showResultBanners(result);
    reportChessResult(result);
  }

  // Gửi kết quả của mình lên server. Điểm chỉ thực sự được cộng/trừ khi CẢ 2 người chơi
  // trong phòng đều báo cáo và 2 kết quả khớp nhau (server tự đối chiếu, xem backend.py).
  async function reportChessResult(result) {
    if (!options.authToken) return; // chưa đăng nhập thì không có tài khoản nào để cộng/trừ điểm
    try {
      const res = await fetch(`${apiBase()}/api/chess/report-result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.authToken}`
        },
        body: JSON.stringify({ room_code: room, result })
      });
      const data = await res.json().catch(() => ({}));
      const statusEl = document.getElementById('gameStatus');
      if (!statusEl) return;
      if (res.ok && data.applied) {
        const delta = Number(data.delta || 0);
        const label = delta > 0 ? `+${delta}` : `${delta}`;
        const color = delta > 0 ? '#38a169' : (delta < 0 ? '#ff4c4c' : '#aaa');
        statusEl.innerHTML += ` <span class="room-id-tag" style="color:${color};border-color:${color}66">Điểm cờ vua: ${esc(label)}</span>`;
      } else if (res.ok) {
        statusEl.innerHTML += ` <span class="room-id-tag">Đang chờ xác nhận điểm từ đối thủ...</span>`;
      }
    } catch (err) {
      console.error('Lỗi báo cáo kết quả cờ vua:', err);
    }
  }

  // ================= Ô VỪA ĐI (highlight) & ÂM THANH NƯỚC ĐI =================
  let lastMoveFrom = null; // ô xuất phát của nước đi gần nhất (VD: "e2")
  let lastMoveTo = null;   // ô đến của nước đi gần nhất (VD: "e4")

  // Tô sáng 2 ô (đi - đến) của nước đi gần nhất, giúp cả 2 bên (đặc biệt là
  // đối phương) dễ dàng nhận ra quân vừa được di chuyển từ đâu tới đâu.
  function renderLastMoveHighlight() {
    document.querySelectorAll('#board [data-square]').forEach(el => el.classList.remove('square-last-move'));
    if (lastMoveFrom) {
      const fromEl = document.querySelector(`#board [data-square="${lastMoveFrom}"]`);
      if (fromEl) fromEl.classList.add('square-last-move');
    }
    if (lastMoveTo) {
      const toEl = document.querySelector(`#board [data-square="${lastMoveTo}"]`);
      if (toEl) toEl.classList.add('square-last-move');
    }
  }

  // Ghi nhận nước đi vừa thực hiện (của mình hoặc của đối thủ) và tô sáng 2 ô liên quan
  function setLastMove(from, to) {
    lastMoveFrom = from;
    lastMoveTo = to;
    renderLastMoveHighlight();
  }

  // Xoá highlight ô vừa đi (gọi khi bắt đầu ván mới)
  function clearLastMoveHighlight() {
    lastMoveFrom = null;
    lastMoveTo = null;
    renderLastMoveHighlight();
  }

  // Phát ngẫu nhiên 1 trong 5 file âm thanh ngoài mỗi khi có nước đi.
  // Đặt 5 file âm thanh của bạn vào thư mục "sounds/" cùng cấp với index.html,
  // đặt tên lần lượt là move1.mp3, move2.mp3, ..., move5.mp3 (hoặc sửa mảng
  // MOVE_SOUND_FILES bên dưới nếu bạn muốn dùng tên/đường dẫn khác).
  //
  // Dùng Web Audio API thay vì thẻ <audio>: cả 5 file được tải + giải mã sẵn
  // thành AudioBuffer trong bộ nhớ ngay khi vào game (preloadMoveSounds()),
  // nên lúc phát chỉ là "bật" dữ liệu âm thanh đã có sẵn -> không còn độ trễ
  // tải/giải mã file như khi dùng <audio> + cloneNode().
  const MOVE_SOUND_FILES = [
    'sounds/move1.mp3',
    'sounds/move2.mp3',
    'sounds/move3.mp3',
    'sounds/move4.mp3',
    'sounds/move5.mp3'
  ];
  let moveSoundCtx = null;
  let moveSoundBuffers = [];       // AudioBuffer đã giải mã sẵn, sẵn sàng phát ngay lập tức
  let moveSoundBuffersLoading = false;
  let moveSoundKeepAliveTimer = null;

  function ensureMoveSoundCtx() {
    const AudioContextCls = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCls) return null;
    if (!moveSoundCtx) moveSoundCtx = new AudioContextCls();
    return moveSoundCtx;
  }

  // Trình duyệt (đặc biệt Chrome/mobile) tự "ngủ đông" AudioContext sau một
  // khoảng im lặng (VD: 2 người suy nghĩ nước đi lâu) để tiết kiệm pin. Khi
  // đó, resume() lần tiếp theo mất một chút thời gian bất đồng bộ -> gây
  // cảm giác "im một lúc rồi mới kêu". Để tránh việc này, ta chủ động "đánh
  // thức" lại context định kỳ để nó không kịp bị ngủ đông.
  function startMoveSoundKeepAlive() {
    if (moveSoundKeepAliveTimer) return;
    moveSoundKeepAliveTimer = setInterval(() => {
      const ctx = ensureMoveSoundCtx();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    }, 10000); // cứ 10 giây "nhắc" context 1 lần, trước khi trình duyệt kịp cho ngủ
  }

  // Tải + giải mã sẵn cả 5 file ngay khi vào game (gọi 1 lần trong mount()),
  // để lúc có nước đi đầu tiên đã sẵn sàng phát ngay, không phải chờ tải file.
  function preloadMoveSounds() {
    if (moveSoundBuffersLoading || moveSoundBuffers.length) return;
    moveSoundBuffersLoading = true;
    const ctx = ensureMoveSoundCtx();
    if (!ctx) return;
    Promise.all(
      MOVE_SOUND_FILES.map((src) =>
        fetch(src)
          .then((res) => res.arrayBuffer())
          .then((data) => ctx.decodeAudioData(data))
          .catch((err) => {
            console.error('Không tải được file âm thanh:', src, err);
            return null;
          })
      )
    ).then((buffers) => {
      moveSoundBuffers = buffers.filter(Boolean);
      startMoveSoundKeepAlive();
    });
  }

  function playMoveSound(isCapture) {
    const ctx = ensureMoveSoundCtx();
    // Nếu chưa giải mã xong (VD: nước đi đầu tiên tới quá nhanh) thì bỏ qua
    // lần này thay vì phát trễ - tránh cảm giác tiếng bị "đến chậm".
    if (!ctx || !moveSoundBuffers.length) return;

    const fire = () => {
      try {
        const idx = Math.floor(Math.random() * moveSoundBuffers.length);
        const source = ctx.createBufferSource();
        source.buffer = moveSoundBuffers[idx];
        source.connect(ctx.destination);
        source.start(0);
      } catch (err) {
        console.error('Lỗi phát âm thanh nước đi:', err);
      }
    };

    if (ctx.state === 'suspended') {
      // Chờ resume() thực sự xong rồi mới lên lịch phát, thay vì gọi start()
      // ngay trong lúc context còn đang "ngủ" (sẽ khiến tiếng phát ra trễ
      // đúng bằng thời gian chờ resume xong).
      ctx.resume().then(fire).catch((err) => {
        console.error('Lỗi khôi phục AudioContext:', err);
      });
    } else {
      fire();
    }
  }

  // ================= ĐIỀU KHIỂN: BẤM ĐỂ CHỌN & DI CHUYỂN =================
  let selectedSquare = null; // ô đang được chọn (VD: "e2")
  let legalTargets = [];     // danh sách nước đi hợp lệ (verbose) từ ô đang chọn

  // Quy đổi toạ độ ô cờ (VD: "e4") sang hàng/cột (0-7) trên lưới hiển thị,
  // có tính đến việc bàn cờ bị xoay khi mình cầm quân Đen.
  function squareToRowCol(square, orientation) {
    const file = square.charCodeAt(0) - 97; // a=0 ... h=7
    const rank = parseInt(square[1], 10);   // 1-8
    if (orientation === 'black') {
      return { row: rank - 1, col: 7 - file };
    }
    return { row: 8 - rank, col: file };
  }

  // Vẽ lại: viền vàng ô đang chọn + các chấm tròn trắng ở những ô có thể đi tới
  function renderSelectionHighlight() {
    const hintsLayer = document.getElementById('moveHints');
    if (hintsLayer) hintsLayer.innerHTML = '';

    document.querySelectorAll('#board [data-square]').forEach(el => el.classList.remove('square-selected'));
    if (!selectedSquare) return;

    const selEl = document.querySelector(`#board [data-square="${selectedSquare}"]`);
    if (selEl) selEl.classList.add('square-selected');

    if (!hintsLayer) return;
    legalTargets.forEach(move => {
      const { row, col } = squareToRowCol(move.to, myColor);
      const dot = document.createElement('div');
      const isCapture = !!move.captured || (move.flags && move.flags.indexOf('e') !== -1); // 'e' = bắt tốt qua đường
      dot.className = 'move-hint' + (isCapture ? ' is-capture' : '');
      dot.style.left = `${(col + 0.5) * 12.5}%`;
      dot.style.top = `${(row + 0.5) * 12.5}%`;
      hintsLayer.appendChild(dot);
    });
  }

  function clearSelection() {
    selectedSquare = null;
    legalTargets = [];
    renderSelectionHighlight();
  }

  function selectSquare(square) {
    selectedSquare = square;
    legalTargets = game.moves({ square, verbose: true }) || [];
    renderSelectionHighlight();
  }

  // Thực hiện nước đi, cập nhật bàn cờ và gửi cho đối thủ qua WebSocket
  function performMove(from, to) {
    const move = game.move({ from, to, promotion: 'q' }); // luôn phong Hậu cho đơn giản
    if (move === null) return;
    board.position(game.fen());
    setLastMove(move.from, move.to);
    playMoveSound(!!move.captured);
    updateStatus();
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'move', move }));
    }
  }

  // Xử lý khi bấm vào 1 ô trên bàn cờ (chọn quân / đi quân)
  function onSquareClicked(square) {
    if (!gameStarted || !game || game.game_over() || timedOut) return;
    if (game.turn() !== myColor.charAt(0)) return; // chưa tới lượt mình

    const piece = game.get(square);
    const isMyPiece = piece && piece.color === myColor.charAt(0);

    if (selectedSquare) {
      if (square === selectedSquare) {
        clearSelection(); // bấm lại quân đang chọn -> bỏ chọn
        return;
      }
      const target = legalTargets.find(m => m.to === square);
      if (target) {
        performMove(selectedSquare, square);
        clearSelection();
        return;
      }
      if (isMyPiece) {
        selectSquare(square); // đổi sang chọn quân khác của mình
        return;
      }
      clearSelection(); // bấm ô không hợp lệ -> bỏ chọn
      return;
    }

    if (isMyPiece) selectSquare(square);
  }

  // Gắn sự kiện click cho toàn bộ bàn cờ (dùng ủy quyền qua thuộc tính data-square)
  function attachBoardClickHandler() {
    const boardEl = document.getElementById('board');
    if (!boardEl) return;
    boardEl.addEventListener('click', (e) => {
      const squareEl = e.target.closest('[data-square]');
      if (!squareEl) return;
      onSquareClicked(squareEl.getAttribute('data-square'));
    });
  }

  // Đóng gói thông tin của mình để gửi cho đối thủ qua WebSocket
  function myPlayerInfo() {
    return {
      name: options.playerName || 'Ẩn danh',
      // Ảnh đại diện dạng base64 có thể rất lớn (hàng chục KB) -> tin nhắn WebSocket quá giới hạn
      // sẽ bị server ĐÓNG kết nối. Chỉ gửi kèm khi ảnh nhỏ; không thì để trống (hiện chữ cái đầu).
      avatar: (options.playerAvatar && options.playerAvatar.length <= 6000) ? options.playerAvatar : '',
      score: Number(options.playerScore || 0)
    };
  }

  // Xử lý kết nối WebSocket
  function connectWS(isCreator, roomCode) {
    room = (roomCode || '').trim();
    if (!room) {
      alert("Vui lòng nhập mã phòng!");
      return;
    }

    myColor = isCreator ? 'white' : 'black';
    opponentInfo = null;
    resultReported = false;
    timedOut = false;
    stopTurnTimer();

    if (socket) socket.close();

    // Chuyển URL HTTP thành WS. apiBase() đã được chuẩn hoá (không có hậu tố /api),
    // nên ta tự thêm "/api/ws/duel/..." — khớp đúng route ở backend.
    const wsUrl = apiBase().replace(/^http/, 'ws') + `/api/ws/duel/${room}`;
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      enterRoomView();
      clearResultBanners();

      // Khởi tạo lại bàn cờ sạch sẽ
      game = new Chess();
      board.start();
      board.orientation(myColor); // Xoay bàn cờ theo phe của người chơi
      clearSelection();
      clearLastMoveHighlight();

      if (isCreator) {
        gameStarted = false;
        updateStatus();
      } else {
        // Người vào sau báo cho người tạo phòng biết, kèm theo thông tin của mình
        socket.send(JSON.stringify({ type: 'join', player: myPlayerInfo() }));
        gameStarted = true;
        updateStatus();
      }
    };

    socket.onmessage = (e) => {
      try {
        let data = JSON.parse(e.data);

        if (data.type === 'room_full') {
          alert('Phòng này đã đủ người, vui lòng chọn phòng khác.');
        }
        else if (data.type === 'join' && isCreator) {
          // Người tạo nhận tín hiệu người vào (kèm thông tin đối thủ) -> Game bắt đầu,
          // gửi lại thông tin của mình cho người vào.
          if (data.player) { opponentInfo = data.player; renderOpponentBadge(opponentInfo); }
          socket.send(JSON.stringify({ type: 'start', player: myPlayerInfo() }));
          gameStarted = true;
          updateStatus();
        }
        else if (data.type === 'start' && !isCreator) {
          if (data.player) { opponentInfo = data.player; renderOpponentBadge(opponentInfo); }
          gameStarted = true;
          updateStatus();
        }
        else if (data.type === 'move') {
          // Nhận nước đi của đối thủ
          const oppMove = game.move(data.move);
          board.position(game.fen());
          clearSelection();
          if (oppMove) {
            setLastMove(oppMove.from, oppMove.to);
            playMoveSound(!!oppMove.captured);
          }
          updateStatus();
        }
        else if (data.type === 'timeout') {
          // Đối thủ vừa báo hết giờ suy nghĩ -> mình thắng
          handleOpponentTimeout();
        }
        else if (data.type === 'opponent_left') {
          gameStarted = false;
          stopTurnTimer();
          renderTurnRing(1, null);
          const statusEl = document.getElementById('gameStatus');
          if (statusEl) statusEl.innerHTML = "<span style='color:#ff4c4c'>Đối thủ đã rời phòng.</span>";
          renderOpponentBadge(opponentInfo ? Object.assign({}, opponentInfo, { name: (opponentInfo.name || 'Đối thủ') + ' (đã rời)' }) : null);
          updateTurnHighlight();
        }
      } catch (err) {
        console.error("Lỗi dữ liệu websocket", err);
      }
    };

    socket.onclose = () => {
      gameStarted = false;
      stopTurnTimer();
      const statusEl = document.getElementById('gameStatus');
      if (statusEl && inRoom) {
        statusEl.innerHTML = "<span style='color:#ff4c4c'>Đã mất kết nối hoặc đối thủ thoát phòng.</span>";
      }
    };
  }

  // Rời phòng hiện tại (chờ hoặc đang chơi), quay lại sảnh
  function leaveRoomToLobby() {
    stopTurnTimer();
    if (socket) {
      socket.close();
      socket = null;
    }
    game = null;
    gameStarted = false;
    room = '';
    selectedSquare = null;
    legalTargets = [];
    showLobby();
  }

  // Khởi chạy khi bấm vào game Cờ Vua ở Home
  function mount(containerEl, opts) {
    container = containerEl;
    options = opts || {};
    container.innerHTML = html();

    // Tải + giải mã sẵn 5 file âm thanh nước đi ngay từ đầu, để có nước đi
    // đầu tiên là phát được ngay, không bị trễ do phải tải file.
    preloadMoveSounds();

    // Khởi tạo game và UI bàn cờ (dùng chung cho mọi ván, chỉ hiện khi vào phòng)
    game = new Chess();
    board = Chessboard('board', {
      draggable: false, // điều khiển hoàn toàn bằng cách bấm chọn quân rồi bấm ô muốn đi tới
      position: 'start',
      pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    });
    attachBoardClickHandler();

    document.getElementById('btnCreate').addEventListener('click', createRoom);
    document.getElementById('btnJoin').addEventListener('click', () => {
      joinRoom(document.getElementById('roomCode').value);
    });
    document.getElementById('roomCode').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') joinRoom(document.getElementById('roomCode').value);
    });
    document.getElementById('btnRefreshRooms').addEventListener('click', refreshRoomList);

    document.getElementById('btnExit').addEventListener('click', leaveRoomToLobby);

    document.getElementById('btnHome').addEventListener('click', () => {
      unmount();
      if (options.onGoHome) options.onGoHome();
    });

    showLobby();
  }

  function unmount() {
    stopLobbyPolling();
    stopTurnTimer();
    if (socket) {
      socket.close();
      socket = null;
    }
    game = null;
    board = null;
    inRoom = false;
    if (container) container.innerHTML = '';
  }

  return { mount, unmount };
})();
