// ==================== SNAKE.JS ====================
// Game Rắn săn mồi (giao diện "Neon Arcade") — module có thể mount/unmount nhiều lần trong SPA (app.js),
// cùng giao diện lập trình với TetrisGame.
//
// Sử dụng: SnakeGame.mount(containerEl, {
//            onFinish(score)  -> Promise<{rank, highScore, totalMatches} | null>  // lưu điểm lên server
//            onGoHome()       -> về trang chủ
//            onStart()        -> (tuỳ chọn) gọi mỗi khi chơi LẠI, để xin phiên chơi mới từ server
//            highScore        -> (tuỳ chọn) kỷ lục hiện tại để hiển thị
//            rank             -> (tuỳ chọn) hạng hiện tại, vd "#17"
//          });
//          SnakeGame.unmount(); // gọi khi rời màn game để dọn timer/listener

const SnakeGame = (function () {
  const COLS = 20, ROWS = 20, CELL = 24;
  const W = COLS * CELL, H = ROWS * CELL;

  const START_LEN = 3;
  const FOOD_SCORE = 10;          // điểm mồi thường (cộng thêm 2 điểm cho mỗi cấp)
  const BONUS_SCORE = 50;         // mồi vàng
  const BONUS_EVERY = 5;          // cứ ăn 5 mồi thường thì xuất hiện 1 mồi vàng
  const BONUS_TTL = 35;           // mồi vàng tồn tại 35 bước đi rồi biến mất
  const FOODS_PER_LEVEL = 5;      // ăn 5 mồi lên 1 cấp
  const MIN_SUBMIT_MS = 2500;     // ván ngắn hơn mức này sẽ không nộp điểm (server từ chối ván < 2s)
  const MILESTONE = 100;          // thanh tiến độ điểm: mỗi mốc 100 điểm

  const speedFor = (level) => Math.max(65, 150 - (level - 1) * 10); // ms / bước

  const DIRS = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  };

  // Thử thách mỗi ngày (chỉ hiển thị trên máy này, không ảnh hưởng điểm/xếp hạng).
  // Mỗi ngày chọn 1 thử thách cố định theo ngày; tiến độ là thành tích tốt nhất trong ngày.
  const CHALLENGES = [
    { id: 'length', label: 'Đạt độ dài 15',     target: 15,  get: (st) => st.snake.length },
    { id: 'score',  label: 'Đạt 200 điểm',      target: 200, get: (st) => st.score },
    { id: 'eat',    label: 'Ăn 12 mồi trong một ván', target: 12, get: (st) => st.eaten },
    { id: 'level',  label: 'Lên cấp độ 4',      target: 4,   get: (st) => st.level },
    { id: 'gold',   label: 'Ăn 2 mồi vàng',    target: 2,   get: (st) => st.golds },
  ];
  const DAILY_KEY = 'snake_daily_v1';

  // ── trạng thái (mỗi lần mount) ──
  let state = null;
  let dom = null;
  let timerId = null;
  let keyHandler = null;
  let visHandler = null;
  let touchStart = null;
  let onFinishCb = null;
  let onGoHomeCb = null;
  let onStartCb = null;
  let bestScore = 0;
  let rankText = '—';
  let roundsPlayed = 0;
  let challenge = null;      // thử thách hôm nay
  let challengeBest = 0;     // tiến độ tốt nhất trong ngày

  // ── thử thách ngày (localStorage chỉ là tiện ích, lỗi thì bỏ qua) ──
  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function pickChallenge() {
    const d = new Date();
    const n = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
    return CHALLENGES[n % CHALLENGES.length];
  }
  function loadChallengeBest() {
    try {
      const raw = JSON.parse(localStorage.getItem(DAILY_KEY) || 'null');
      if (raw && raw.day === todayKey() && raw.id === challenge.id) return Number(raw.best) || 0;
    } catch (e) { /* bỏ qua */ }
    return 0;
  }
  function saveChallengeBest(v) {
    try {
      localStorage.setItem(DAILY_KEY, JSON.stringify({ day: todayKey(), id: challenge.id, best: v }));
    } catch (e) { /* bỏ qua */ }
  }

  function freshState() {
    const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
    const snake = [];
    for (let i = 0; i < START_LEN; i++) snake.push({ x: cx - i, y: cy });
    const st = {
      snake,
      dir: DIRS.right,
      queue: [],            // hàng đợi đổi hướng (tối đa 2) để bấm nhanh không bị mất phím
      food: null,
      bonus: null,          // { x, y, ttl }
      score: 0,
      eaten: 0,             // số mồi thường đã ăn
      golds: 0,             // số mồi vàng đã ăn
      level: 1,
      started: false, paused: false, gameOver: false, won: false,
      startedAt: 0,
    };
    st.food = randomFreeCell(st);
    return st;
  }

  function randomFreeCell(st) {
    const taken = new Set(st.snake.map(p => p.x + ',' + p.y));
    if (st.food) taken.add(st.food.x + ',' + st.food.y);
    if (st.bonus) taken.add(st.bonus.x + ',' + st.bonus.y);
    const free = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!taken.has(x + ',' + y)) free.push({ x, y });
      }
    }
    if (!free.length) return null;
    return free[Math.floor(Math.random() * free.length)];
  }

  // ── giao diện ──
  // Font tiêu đề (hỗ trợ tiếng Việt). Nạp 1 lần; nếu mạng lỗi thì dùng font hệ thống.
  function ensureFont() {
    if (document.getElementById('snake-font')) return;
    const l = document.createElement('link');
    l.id = 'snake-font';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&display=swap';
    document.head.appendChild(l);
  }

  function html() {
    return `
    <div class="sn-wrap">
      <header class="sn-head">
        <div class="sn-brand">
          <div class="sn-logo"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="9" width="4" height="8" rx="2"/><rect x="10" y="5" width="4" height="14" rx="2"/><rect x="16" y="8" width="4" height="9" rx="2"/></svg></div>
          <div>
            <div class="sn-eyebrow">NEON ARCADE</div>
            <h2 class="sn-title">RẮN SĂN MỒI</h2>
          </div>
        </div>
        <div class="sn-head-right">
          <button class="sn-hbtn" data-el="pauseBtn">⏸ Tạm dừng</button>
          <button class="sn-hbtn" data-el="exitBtn">← Thoát &amp; lưu điểm</button>
          <div class="sn-status ready" data-el="status"><i></i><span data-el="statusText">SẴN SÀNG</span></div>
        </div>
      </header>

      <div class="sn-stage">
        <aside class="sn-col sn-left">
          <div class="sn-sec"><span>THÀNH TÍCH</span><em>LIVE</em></div>
          <div class="sn-card sn-score-card">
            <div class="sn-label">ĐIỂM HIỆN TẠI</div>
            <div class="sn-score" data-el="score">000</div>
            <div class="sn-bar"><i data-el="scoreBar"></i></div>
            <div class="sn-hint" data-el="scoreHint">Còn ${MILESTONE} điểm tới mốc ${MILESTONE}</div>
          </div>
          <div class="sn-tiles">
            <div class="sn-tile rec"><div class="sn-label">KỶ LỤC</div><div class="sn-val" data-el="best">0</div></div>
            <div class="sn-tile"><div class="sn-label">ĐỘ DÀI</div><div class="sn-val" data-el="length">${START_LEN}</div></div>
            <div class="sn-tile"><div class="sn-label">CẤP ĐỘ</div><div class="sn-val" data-el="level">1</div></div>
            <div class="sn-tile"><div class="sn-label">XẾP HẠNG</div><div class="sn-val" data-el="rank">—</div></div>
          </div>
          <div class="sn-tip">
            <span class="sn-tip-i">i</span>
            <div><b>Mẹo nhỏ</b><p>Ăn càng nhiều, tốc độ di chuyển càng tăng. Mồi vàng +${BONUS_SCORE} điểm nhưng sẽ biến mất sau ít bước.</p></div>
          </div>
        </aside>

        <section class="sn-center">
          <div class="sn-meta"><span>KHU VỰC 01</span><span class="sn-signal" data-el="signal"><i></i><b data-el="signalText">TÍN HIỆU ỔN ĐỊNH</b></span></div>
          <div class="sn-board" data-el="boardOuter">
            <span class="sn-corner tl"></span><span class="sn-corner tr"></span><span class="sn-corner bl"></span><span class="sn-corner br"></span>
            <canvas class="sn-canvas" data-el="canvas"></canvas>
            <div class="sn-overlay" data-el="overlay"><div class="sn-overlay-inner" data-el="overlayContent"></div></div>
          </div>
          <div class="sn-meta sn-foot"><span>GRID ${COLS} × ${ROWS}</span><span data-el="spaceHint">Bắt đầu <kbd>SPACE</kbd></span></div>
        </section>

        <aside class="sn-col sn-right">
          <div class="sn-sec"><span>ĐIỀU KHIỂN</span><em class="dim">BÀN PHÍM</em></div>
          <div class="sn-card sn-keys-card">
            <div class="sn-arrows">
              <kbd class="up">↑</kbd><kbd class="lf">←</kbd><kbd class="dn">↓</kbd><kbd class="rt">→</kbd>
            </div>
            <div class="sn-key-title">Di chuyển</div>
            <div class="sn-key-sub">Sử dụng các phím mũi tên để điều hướng.</div>
          </div>
          <div class="sn-keyrow">
            <div class="sn-wasd"><kbd class="w">W</kbd><kbd class="a">A</kbd><kbd class="s">S</kbd><kbd class="d">D</kbd></div>
            <div><div class="sn-key-title">Thay thế</div><div class="sn-key-sub spaced">WASD</div></div>
          </div>
          <div class="sn-keyrow">
            <kbd class="sn-space">SPACE</kbd>
            <div><div class="sn-key-title">Tạm dừng</div><div class="sn-key-sub">Dừng / tiếp tục</div></div>
          </div>
          <div class="sn-challenge" data-el="challenge">
            <div class="sn-label">THỬ THÁCH HÔM NAY</div>
            <div class="sn-ch-title" data-el="chTitle">—</div>
            <div class="sn-bar"><i data-el="chBar"></i></div>
            <div class="sn-ch-num" data-el="chNum">0 / 0</div>
          </div>
        </aside>
      </div>

      <div class="sn-dpad" data-el="dpad">
        <button data-dir="up" aria-label="Lên">▲</button>
        <button data-dir="left" aria-label="Trái">◀</button>
        <button data-dir="down" aria-label="Xuống">▼</button>
        <button data-dir="right" aria-label="Phải">▶</button>
      </div>
    </div>`;
  }

  function q(root, name) { return root.querySelector(`[data-el="${name}"]`); }

  function setupCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    dom.canvas.width = W * dpr;
    dom.canvas.height = H * dpr;
    dom.ctx = dom.canvas.getContext('2d');
    dom.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function lerpColor(a, b, t) {
    const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
    const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
    return 'rgb(' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',') + ')';
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw() {
    if (!dom || !state) return;
    const ctx = dom.ctx;

    // nền + lưới mờ
    ctx.fillStyle = '#080626';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(124,108,255,.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) { ctx.moveTo(x * CELL + .5, 0); ctx.lineTo(x * CELL + .5, H); }
    for (let y = 1; y < ROWS; y++) { ctx.moveTo(0, y * CELL + .5); ctx.lineTo(W, y * CELL + .5); }
    ctx.stroke();

    // mồi thường
    const f = state.food;
    if (f) {
      const cx = f.x * CELL + CELL / 2, cy = f.y * CELL + CELL / 2;
      ctx.save();
      ctx.shadowColor = '#fb7185';
      ctx.shadowBlur = 16;
      const g = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, CELL / 2 - 3);
      g.addColorStop(0, '#fecdd3');
      g.addColorStop(1, '#f43f5e');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, CELL / 2 - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // mồi vàng (có vòng đếm ngược)
    const b = state.bonus;
    if (b) {
      const cx = b.x * CELL + CELL / 2, cy = b.y * CELL + CELL / 2;
      ctx.save();
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 18;
      const g = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, CELL / 2 - 2);
      g.addColorStop(0, '#fef3c7');
      g.addColorStop(1, '#f59e0b');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, CELL / 2 - 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(251,191,36,.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, CELL / 2 - 1.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (b.ttl / BONUS_TTL));
      ctx.stroke();
      ctx.restore();
    }

    // thân rắn: vẽ từng cặp đốt liền nhau thành 1 "viên thuốc" cho liền mạch
    const snake = state.snake, n = snake.length;
    const dead = state.gameOver && !state.won;
    const headColor = dead ? '#fb7185' : '#a89cff';
    const tailColor = dead ? '#7f1d3a' : '#3a2fc0';
    ctx.save();
    ctx.shadowColor = dead ? 'rgba(251,113,133,.55)' : 'rgba(124,108,255,.55)';
    ctx.shadowBlur = 10;
    for (let i = n - 1; i >= 0; i--) {
      const a = snake[i];
      const nb = snake[i - 1] || a;
      const t = n > 1 ? 1 - i / (n - 1) : 1; // 0 = đuôi, 1 = đầu
      ctx.fillStyle = lerpColor(tailColor, headColor, t);
      const x = Math.min(a.x, nb.x) * CELL + 2;
      const y = Math.min(a.y, nb.y) * CELL + 2;
      const w = (Math.abs(a.x - nb.x) + 1) * CELL - 4;
      const h = (Math.abs(a.y - nb.y) + 1) * CELL - 4;
      roundRect(ctx, x, y, w, h, 7);
      ctx.fill();
    }
    ctx.restore();

    // đầu rắn: mắt nhìn theo hướng đi
    const hd = snake[0];
    const hx = hd.x * CELL + CELL / 2, hy = hd.y * CELL + CELL / 2;
    const d = state.dir;
    const px = -d.y, py = d.x; // vector vuông góc để đặt 2 mắt
    for (const side of [-1, 1]) {
      const ex = hx + d.x * 4 + px * 5 * side;
      const ey = hy + d.y * 4 + py * 5 * side;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex, ey, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#080626';
      ctx.beginPath(); ctx.arc(ex + d.x * 1.2, ey + d.y * 1.2, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── HUD ──
  function fmtScore(n) {
    return n < 1000 ? String(n).padStart(3, '0') : n.toLocaleString();
  }

  // Cập nhật nhãn trạng thái ở tiêu đề, dòng gợi ý phím Space và "tín hiệu" trên bàn chơi.
  function setPhase(phase) {
    if (!dom) return;
    const map = {
      ready:   { text: 'SẴN SÀNG',  signal: 'TÍN HIỆU ỔN ĐỊNH', hint: 'Bắt đầu' },
      playing: { text: 'ĐANG CHƠI', signal: 'ĐANG TRUYỀN DỮ LIỆU', hint: 'Tạm dừng' },
      paused:  { text: 'TẠM DỪNG',  signal: 'TÍN HIỆU TẠM NGẮT', hint: 'Tiếp tục' },
      over:    { text: 'KẾT THÚC',  signal: 'MẤT TÍN HIỆU', hint: 'Chơi lại' },
    };
    const m = map[phase] || map.ready;
    dom.status.className = 'sn-status ' + phase;
    dom.statusText.textContent = m.text;
    dom.signal.className = 'sn-signal ' + phase;
    dom.signalText.textContent = m.signal;
    dom.spaceHint.innerHTML = m.hint + ' <kbd>SPACE</kbd>';
  }

  function updateChallenge() {
    if (!dom || !state || !challenge) return;
    const cur = challenge.get(state);
    if (cur > challengeBest) { challengeBest = cur; saveChallengeBest(cur); }
    const shown = Math.min(challengeBest, challenge.target);
    const done = challengeBest >= challenge.target;
    dom.challenge.classList.toggle('done', done);
    dom.chTitle.textContent = challenge.label;
    dom.chBar.style.width = (shown / challenge.target * 100) + '%';
    dom.chNum.textContent = done ? '✓ Hoàn thành' : shown + ' / ' + challenge.target;
  }

  function updateHud() {
    if (!dom || !state) return;
    dom.score.textContent = fmtScore(state.score);
    const into = state.score % MILESTONE;
    dom.scoreBar.style.width = (into / MILESTONE * 100) + '%';
    const next = (Math.floor(state.score / MILESTONE) + 1) * MILESTONE;
    dom.scoreHint.textContent = 'Còn ' + (next - state.score).toLocaleString() + ' điểm tới mốc ' + next.toLocaleString();
    dom.best.textContent = Math.max(bestScore, state.score).toLocaleString();
    dom.length.textContent = state.snake.length;
    dom.level.textContent = state.level;
    dom.rank.textContent = rankText;
    dom.pauseBtn.textContent = state.paused ? '▶ Tiếp tục' : '⏸ Tạm dừng';
    updateChallenge();
  }

  // ── overlay ──
  function showOverlay(contentHtml, final) {
    dom.overlayContent.innerHTML = contentHtml;
    dom.overlay.classList.toggle('final', !!final);
    dom.overlay.classList.add('show');
  }
  function hideOverlay() {
    dom.overlay.classList.remove('show', 'final');
    dom.overlayContent.innerHTML = '';
  }

  function showStartScreen() {
    showOverlay(`
      <div class="sn-ov-eyebrow">SẴN SÀNG?</div>
      <div class="sn-ov-title">BẮT ĐẦU CUỘC SĂN</div>
      <div class="sn-ov-sub">Dùng phím mũi tên hoặc WASD để di chuyển</div>
      <button class="sn-btn" data-el="startBtn"><span>BẮT ĐẦU CHƠI</span><i>→</i></button>`);
    q(dom.overlayContent, 'startBtn').onclick = startGame;
  }

  function showPauseScreen() {
    showOverlay(`
      <div class="sn-ov-eyebrow amber">TẠM DỪNG</div>
      <div class="sn-ov-title">ĐANG NGHỈ NGƠI</div>
      <div class="sn-ov-sub">Nhấn SPACE hoặc P để tiếp tục</div>
      <button class="sn-btn" data-el="resumeBtn"><span>TIẾP TỤC</span><i>→</i></button>`);
    q(dom.overlayContent, 'resumeBtn').onclick = togglePause;
  }

  // ── vòng lặp ──
  function schedule() {
    clearTimeout(timerId);
    timerId = setTimeout(tick, speedFor(state.level));
  }
  function stopLoop() { clearTimeout(timerId); timerId = null; }

  function tick() {
    if (!state || !state.started || state.paused || state.gameOver) return;
    step();
    if (!state || state.gameOver) return;
    schedule();
  }

  function step() {
    const st = state;
    if (st.queue.length) st.dir = st.queue.shift();

    const head = st.snake[0];
    const nx = head.x + st.dir.x, ny = head.y + st.dir.y;

    // đâm tường
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return endGame(false);

    const ateFood = st.food && nx === st.food.x && ny === st.food.y;
    const ateBonus = st.bonus && nx === st.bonus.x && ny === st.bonus.y;
    const grow = ateFood || ateBonus;

    // tự cắn mình (nếu không lớn thì đuôi sẽ rời đi nên không tính đốt cuối)
    const body = grow ? st.snake : st.snake.slice(0, -1);
    if (body.some(p => p.x === nx && p.y === ny)) return endGame(false);

    st.snake.unshift({ x: nx, y: ny });
    if (!grow) st.snake.pop();

    if (ateFood) {
      st.score += FOOD_SCORE + (st.level - 1) * 2;
      st.eaten++;
      st.level = 1 + Math.floor(st.eaten / FOODS_PER_LEVEL);
      st.food = null;
      st.food = randomFreeCell(st);
      if (st.eaten % BONUS_EVERY === 0 && !st.bonus) {
        const cell = randomFreeCell(st);
        if (cell) st.bonus = { x: cell.x, y: cell.y, ttl: BONUS_TTL };
      }
    }
    if (ateBonus) {
      st.score += BONUS_SCORE;
      st.golds++;
      st.bonus = null;
    }

    // đếm ngược mồi vàng
    if (st.bonus && !ateBonus) {
      st.bonus.ttl--;
      if (st.bonus.ttl <= 0) st.bonus = null;
    }

    // lấp đầy cả bàn = thắng
    if (!st.food || st.snake.length >= COLS * ROWS) return endGame(true);

    updateHud();
    draw();
  }

  function startGame() {
    if (!dom) return;
    if (roundsPlayed > 0 && typeof onStartCb === 'function') onStartCb(); // ván mới cần phiên chơi mới
    roundsPlayed++;
    state = freshState();
    state.started = true;
    state.startedAt = Date.now();
    hideOverlay();
    setPhase('playing');
    updateHud();
    draw();
    schedule();
  }

  function setDir(name) {
    if (!state || !state.started || state.paused || state.gameOver) return;
    const nd = DIRS[name];
    const last = state.queue.length ? state.queue[state.queue.length - 1] : state.dir;
    if (nd === last) return;                                  // trùng hướng hiện tại
    if (nd.x + last.x === 0 && nd.y + last.y === 0) return;   // không cho quay đầu 180°
    if (state.queue.length < 2) state.queue.push(nd);
  }

  function togglePause() {
    if (!state || !state.started || state.gameOver) return;
    state.paused = !state.paused;
    if (state.paused) { stopLoop(); showPauseScreen(); setPhase('paused'); }
    else { hideOverlay(); setPhase('playing'); schedule(); }
    updateHud();
  }

  // ── kết thúc ──
  function endGame(won) {
    stopLoop();
    state.gameOver = true;
    state.won = !!won;
    setPhase('over');
    updateHud();
    draw();
    handleGameOver();
  }

  // Lưu điểm lên server (nếu ván đủ dài và có điểm), rồi hiện bảng kết quả.
  async function submitIfEligible() {
    const playedMs = Date.now() - state.startedAt;
    if (state.score <= 0 || playedMs < MIN_SUBMIT_MS) return { stats: null, skipped: true };
    if (typeof onFinishCb !== 'function') return { stats: null, skipped: false };
    return { stats: await onFinishCb(state.score), skipped: false };
  }

  async function handleGameOver() {
    const st = state;
    const res = await submitIfEligible();
    if (!dom || state !== st) return; // đã unmount hoặc đã chơi lại trong lúc chờ
    if (res.stats && typeof res.stats.highScore === 'number') bestScore = res.stats.highScore;
    if (res.stats && res.stats.rank) rankText = res.stats.rank;
    updateHud();
    renderGameOverSummary(res);
  }

  async function exitToHome() {
    if (state && state.started && !state.gameOver) {
      await submitIfEligible();
    }
    if (typeof onGoHomeCb === 'function') onGoHomeCb();
  }

  function renderGameOverSummary(res) {
    const stats = res.stats;
    const finalScore = state.score.toLocaleString();
    const rank = (stats && stats.rank) ? stats.rank : '—';
    const highText = (stats && typeof stats.highScore === 'number')
      ? stats.highScore.toLocaleString()
      : Math.max(bestScore, state.score).toLocaleString();
    const note = res.skipped
      ? '<div class="sn-ov-sub dim">Ván quá ngắn hoặc 0 điểm nên không được lưu</div>' : '';

    showOverlay(`
      <div class="sn-ov-eyebrow ${state.won ? 'gold' : 'rose'}">${state.won ? 'CHIẾN THẮNG' : 'KẾT THÚC CUỘC SĂN'}</div>
      <div class="sn-ov-title ${state.won ? 'won' : 'over'}">${state.won ? 'CHIẾN THẮNG!' : 'GAME OVER'}</div>
      <div class="sn-ov-stats">
        <div><span>ĐIỂM</span><b>${finalScore}</b></div>
        <div><span>ĐỘ DÀI</span><b>${state.snake.length}</b></div>
        <div><span>KỶ LỤC</span><b>${highText}</b></div>
        <div><span>XẾP HẠNG</span><b>${rank}</b></div>
      </div>
      ${note}
      <div class="sn-ov-actions">
        <button class="sn-btn" data-el="replayBtn"><span>CHƠI LẠI</span><i>→</i></button>
        <button class="sn-btn ghost" data-el="homeBtn"><span>VỀ TRANG CHỦ</span></button>
      </div>`, true);
    state.summaryShown = true;
    q(dom.overlayContent, 'replayBtn').onclick = startGame;
    q(dom.overlayContent, 'homeBtn').onclick = () => { if (typeof onGoHomeCb === 'function') onGoHomeCb(); };
  }

  // ── điều khiển ──
  const KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right',
  };

  function onKeyDown(e) {
    if (!state) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // SPACE / Enter: bắt đầu / chơi lại khi chưa chơi; đang chơi thì tạm dừng, đang tạm dừng thì tiếp tục.
    if (e.key === ' ' || e.key === 'Enter') {
      if (e.repeat) return;
      if (!state.started || (state.gameOver && state.summaryShown)) {
        e.preventDefault();
        startGame();
      } else if (!state.gameOver) {
        e.preventDefault();
        togglePause();
      }
      return;
    }
    if (e.key === 'p' || e.key === 'P') { togglePause(); return; }

    const dir = KEYMAP[e.key];
    if (dir) {
      e.preventDefault();
      setDir(dir);
    }
  }

  function onTouchStart(e) {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }
  function onTouchMove(e) {
    if (state && state.started && !state.gameOver) e.preventDefault(); // chặn trang cuộn khi vuốt trong lúc chơi
  }
  function onTouchEnd(e) {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return; // chạm nhẹ, không phải vuốt
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 'right' : 'left');
    else setDir(dy > 0 ? 'down' : 'up');
  }

  // ── mount / unmount ──
  function mount(containerEl, opts) {
    opts = opts || {};
    onFinishCb = opts.onFinish || null;
    onGoHomeCb = opts.onGoHome || null;
    onStartCb = opts.onStart || null;
    bestScore = Number(opts.highScore) || 0;
    rankText = opts.rank && opts.rank !== '#-' ? String(opts.rank) : '—';
    roundsPlayed = 0;
    challenge = pickChallenge();
    challengeBest = loadChallengeBest();

    ensureFont();
    containerEl.innerHTML = html();
    dom = {
      boardOuter: q(containerEl, 'boardOuter'),
      canvas: q(containerEl, 'canvas'),
      overlay: q(containerEl, 'overlay'),
      overlayContent: q(containerEl, 'overlayContent'),
      score: q(containerEl, 'score'),
      scoreBar: q(containerEl, 'scoreBar'),
      scoreHint: q(containerEl, 'scoreHint'),
      best: q(containerEl, 'best'),
      length: q(containerEl, 'length'),
      level: q(containerEl, 'level'),
      rank: q(containerEl, 'rank'),
      status: q(containerEl, 'status'),
      statusText: q(containerEl, 'statusText'),
      signal: q(containerEl, 'signal'),
      signalText: q(containerEl, 'signalText'),
      spaceHint: q(containerEl, 'spaceHint'),
      challenge: q(containerEl, 'challenge'),
      chTitle: q(containerEl, 'chTitle'),
      chBar: q(containerEl, 'chBar'),
      chNum: q(containerEl, 'chNum'),
      exitBtn: q(containerEl, 'exitBtn'),
      pauseBtn: q(containerEl, 'pauseBtn'),
      dpad: q(containerEl, 'dpad'),
    };
    setupCanvas();
    state = freshState();
    updateHud();
    draw();
    setPhase('ready');
    showStartScreen();

    dom.exitBtn.onclick = () => { stopLoop(); exitToHome(); };
    dom.pauseBtn.onclick = togglePause;

    dom.dpad.querySelectorAll('button[data-dir]').forEach(btn => {
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); setDir(btn.dataset.dir); });
    });

    dom.boardOuter.addEventListener('touchstart', onTouchStart, { passive: true });
    dom.boardOuter.addEventListener('touchmove', onTouchMove, { passive: false });
    dom.boardOuter.addEventListener('touchend', onTouchEnd, { passive: true });

    keyHandler = onKeyDown;
    document.addEventListener('keydown', keyHandler);

    // tự tạm dừng khi chuyển tab để rắn không "chạy mù"
    visHandler = () => {
      if (document.hidden && state && state.started && !state.paused && !state.gameOver) togglePause();
    };
    document.addEventListener('visibilitychange', visHandler);
  }

  function unmount() {
    stopLoop();
    if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
    if (visHandler) { document.removeEventListener('visibilitychange', visHandler); visHandler = null; }
    dom = null;
    state = null;
    touchStart = null;
    onFinishCb = null;
    onGoHomeCb = null;
    onStartCb = null;
  }

  return { mount, unmount };
})();
