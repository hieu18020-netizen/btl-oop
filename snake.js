// ==================== SNAKE.JS ====================
// Game Rắn săn mồi — module có thể mount/unmount nhiều lần trong SPA (app.js),
// cùng giao diện lập trình với TetrisGame.
//
// Sử dụng: SnakeGame.mount(containerEl, {
//            onFinish(score)  -> Promise<{rank, highScore, totalMatches} | null>  // lưu điểm lên server
//            onGoHome()       -> về trang chủ
//            onStart()        -> (tuỳ chọn) gọi mỗi khi chơi LẠI, để xin phiên chơi mới từ server
//            highScore        -> (tuỳ chọn) kỷ lục hiện tại để hiển thị
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

  const speedFor = (level) => Math.max(65, 150 - (level - 1) * 10); // ms / bước

  const DIRS = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  };

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
  let roundsPlayed = 0;

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
  function html() {
    return `
    <div class="snake-wrap">
      <div class="snake-title">RẮN SĂN MỒI</div>
      <div class="snake-game">
        <div class="snake-panel">
          <div class="snake-box"><div class="snake-box-label">ĐIỂM</div><div class="snake-box-value" data-el="score">0</div></div>
          <div class="snake-box"><div class="snake-box-label">KỶ LỤC</div><div class="snake-box-value" data-el="best">0</div></div>
          <div class="snake-box"><div class="snake-box-label">ĐỘ DÀI</div><div class="snake-box-value" data-el="length">${START_LEN}</div></div>
        </div>
        <div class="snake-board-outer" data-el="boardOuter">
          <canvas class="snake-canvas" data-el="canvas"></canvas>
          <div class="snake-overlay" data-el="overlay"><div class="snake-overlay-inner" data-el="overlayContent"></div></div>
        </div>
        <div class="snake-panel">
          <div class="snake-box"><div class="snake-box-label">CẤP ĐỘ</div><div class="snake-box-value" data-el="level">1</div></div>
          <div class="snake-box">
            <div class="snake-box-label">ĐIỀU KHIỂN</div>
            <div class="snake-ctrl-row"><span class="snake-key">← ↑ ↓ →</span><span>Di chuyển</span></div>
            <div class="snake-ctrl-row"><span class="snake-key">W A S D</span><span>Di chuyển</span></div>
            <div class="snake-ctrl-row"><span class="snake-key">Space</span><span>Bắt đầu</span></div>
            <div class="snake-ctrl-row"><span class="snake-key">P</span><span>Tạm dừng</span></div>
            <div class="snake-ctrl-row"><span class="snake-key snake-key-gold">●</span><span>Mồi vàng +${BONUS_SCORE}</span></div>
          </div>
          <button class="snake-exit-btn" data-el="pauseBtn">⏸ Tạm dừng</button>
          <button class="snake-exit-btn" data-el="exitBtn">← Thoát &amp; lưu điểm</button>
        </div>
      </div>
      <div class="snake-dpad" data-el="dpad">
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
    dom.canvas.style.width = W + 'px';
    dom.canvas.style.height = H + 'px';
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

    // nền + lưới mờ kiểu bàn cờ
    ctx.fillStyle = '#04061a';
    ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if ((x + y) % 2 === 0) {
          ctx.fillStyle = 'rgba(52,211,153,.035)';
          ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
      }
    }

    // mồi thường
    const f = state.food;
    if (f) {
      const cx = f.x * CELL + CELL / 2, cy = f.y * CELL + CELL / 2;
      ctx.save();
      ctx.shadowColor = '#fb7185';
      ctx.shadowBlur = 14;
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
    const headColor = dead ? '#fb7185' : '#6ee7b7';
    const tailColor = dead ? '#9f1239' : '#047857';
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
      ctx.fillStyle = '#04061a';
      ctx.beginPath(); ctx.arc(ex + d.x * 1.2, ey + d.y * 1.2, 1.6, 0, Math.PI * 2); ctx.fill();
    }

    // viền khung
    ctx.strokeStyle = 'rgba(52,211,153,.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(.5, .5, W - 1, H - 1);
  }

  function updateHud() {
    if (!dom || !state) return;
    dom.score.textContent = state.score.toLocaleString();
    dom.best.textContent = Math.max(bestScore, state.score).toLocaleString();
    dom.length.textContent = state.snake.length;
    dom.level.textContent = state.level;
    dom.pauseBtn.textContent = state.paused ? '▶ Tiếp tục' : '⏸ Tạm dừng';
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
      <div class="snake-overlay-title">RẮN SĂN MỒI</div>
      <div class="snake-overlay-sub">Ăn mồi để lớn lên · đừng đâm tường hay tự cắn mình</div>
      <button class="snake-start-btn" data-el="startBtn">BẮT ĐẦU</button>
      <div class="snake-overlay-sub dim">hoặc nhấn SPACE</div>`);
    q(dom.overlayContent, 'startBtn').onclick = startGame;
  }

  function showPauseScreen() {
    showOverlay(`
      <div class="snake-overlay-title paused">TẠM DỪNG</div>
      <button class="snake-start-btn" data-el="resumeBtn">TIẾP TỤC</button>
      <div class="snake-overlay-sub dim">hoặc nhấn P</div>`);
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
    if (state.paused) { stopLoop(); showPauseScreen(); }
    else { hideOverlay(); schedule(); }
    updateHud();
  }

  // ── kết thúc ──
  function endGame(won) {
    stopLoop();
    state.gameOver = true;
    state.won = !!won;
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
    const rankText = (stats && stats.rank) ? stats.rank : '—';
    const highText = (stats && typeof stats.highScore === 'number')
      ? stats.highScore.toLocaleString()
      : Math.max(bestScore, state.score).toLocaleString();
    const note = res.skipped
      ? '<div class="snake-overlay-sub dim">Ván quá ngắn hoặc 0 điểm nên không được lưu</div>' : '';

    showOverlay(`
      <div class="snake-overlay-title ${state.won ? 'won' : 'over'}">${state.won ? 'CHIẾN THẮNG!' : 'GAME OVER'}</div>
      <div class="snake-overlay-sub">TỔNG ĐIỂM: ${finalScore}</div>
      <div class="snake-overlay-sub">ĐỘ DÀI: ${state.snake.length}</div>
      <div class="snake-overlay-sub">KỶ LỤC: ${highText}</div>
      <div class="snake-overlay-sub">XẾP HẠNG HIỆN TẠI: ${rankText}</div>
      ${note}
      <div class="snake-gameover-actions">
        <button class="snake-start-btn" data-el="replayBtn">CHƠI LẠI</button>
        <button class="snake-exit-btn" data-el="homeBtn">VỀ TRANG CHỦ</button>
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

    if (e.key === ' ' || e.key === 'Enter') {
      if (e.repeat) return;
      if (!state.started || (state.gameOver && state.summaryShown)) {
        e.preventDefault();
        startGame();
      } else if (state.paused) {
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
    roundsPlayed = 0;

    containerEl.innerHTML = html();
    dom = {
      boardOuter: q(containerEl, 'boardOuter'),
      canvas: q(containerEl, 'canvas'),
      overlay: q(containerEl, 'overlay'),
      overlayContent: q(containerEl, 'overlayContent'),
      score: q(containerEl, 'score'),
      best: q(containerEl, 'best'),
      length: q(containerEl, 'length'),
      level: q(containerEl, 'level'),
      exitBtn: q(containerEl, 'exitBtn'),
      pauseBtn: q(containerEl, 'pauseBtn'),
      dpad: q(containerEl, 'dpad'),
    };
    setupCanvas();
    state = freshState();
    updateHud();
    draw();
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
