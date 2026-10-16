// ==================== TETRIS.JS ====================
// Module Tetris có thể mount/unmount nhiều lần trong SPA (app.js).
// Sử dụng: TetrisGame.mount(containerEl, { onExit(score) });
//          TetrisGame.unmount(); // gọi khi rời màn game để dọn interval/listener

const TetrisGame = (function () {
  const COLS = 12, ROWS = 22, CELL = 24;

  const PIECES = {
    I: { shape: [[1, 1, 1, 1]], color: '#00e5ff' },
    O: { shape: [[1, 1], [1, 1]], color: '#ffd600' },
    T: { shape: [[0, 1, 0], [1, 1, 1]], color: '#d500f9' },
    S: { shape: [[0, 1, 1], [1, 1, 0]], color: '#00e676' },
    Z: { shape: [[1, 1, 0], [0, 1, 1]], color: '#ff1744' },
    J: { shape: [[1, 0, 0], [1, 1, 1]], color: '#2979ff' },
    L: { shape: [[0, 0, 1], [1, 1, 1]], color: '#ff8f00' },
  };
  const PIECE_TYPES = Object.keys(PIECES);
  const SCORE_TABLE = [0, 100, 300, 500, 800];
  const SPEED = (level) => Math.max(50, 550 - (level - 1) * 55);

  function createBoard() { return Array.from({ length: ROWS }, () => Array(COLS).fill(null)); }
  function rotateCW(shape) { return shape[0].map((_, i) => shape.map(row => row[i]).reverse()); }
  function randomType() { return PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)]; }

  let _pieceId = 0;
  function makePiece(type) {
    const shape = PIECES[type].shape.map(r => [...r]);
    return { type, shape, x: Math.floor((COLS - shape[0].length) / 2), y: 0, id: ++_pieceId };
  }

  function isValid(board, shape, x, y) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const nr = y + r, nc = x + c;
        if (nc < 0 || nc >= COLS || nr >= ROWS) return false;
        if (nr >= 0 && board[nr][nc]) return false;
      }
    }
    return true;
  }

  function lockPiece(board, piece) {
    const b = board.map(r => [...r]);
    const color = PIECES[piece.type].color;
    for (let r = 0; r < piece.shape.length; r++) {
      for (let c = 0; c < piece.shape[r].length; c++) {
        if (!piece.shape[r][c]) continue;
        const nr = piece.y + r, nc = piece.x + c;
        if (nr >= 0) b[nr][nc] = color;
      }
    }
    return b;
  }

  function clearLines(board) {
    const kept = board.filter(r => r.some(c => c === null));
    const cleared = ROWS - kept.length;
    const empty = Array.from({ length: cleared }, () => Array(COLS).fill(null));
    return { board: [...empty, ...kept], cleared };
  }

  function findFullRows(board) {
    const rows = [];
    for (let r = 0; r < ROWS; r++) {
      if (board[r].every(cell => cell !== null)) rows.push(r);
    }
    return rows;
  }

  function getGhostY(board, piece) {
    let y = piece.y;
    while (isValid(board, piece.shape, piece.x, y + 1)) y++;
    return y;
  }

  // ── mutable game state (per mount) ──
  let state = null;
  let dom = null;
  let loopId = null;
  let keyHandler = null;
  let onFinishCb = null; // (score) => Promise<{rank, highScore, totalMatches} | null>
  let onGoHomeCb = null; // () => void, gọi khi người chơi muốn về trang chủ
  let pendingHardDropBonus = 0; // điểm rơi nhanh, cộng dồn sau khi hiệu ứng nhấp nháy kết thúc
  const FLASH_MS = 280;

  function freshState() {
    return {
      board: createBoard(),
      piece: null,
      next: randomType(),
      score: 0, level: 1, lines: 0,
      gameOver: false, started: false, paused: false,
      clearing: null, // mảng chỉ số hàng đang nhấp nháy trước khi xóa
    };
  }

  function html() {
    return `
    <div class="tetris-wrap">
      <div class="tetris-title">TETRIS</div>
      <div class="tetris-game">
        <div class="tetris-panel">
          <div class="tetris-box"><div class="tetris-box-label">ĐIỂM</div><div class="tetris-box-value" data-el="score">0</div></div>
        </div>
        <div class="tetris-board-outer" data-el="boardOuter">
          <div class="tetris-grid" data-el="boardGrid"></div>
          <div data-el="ghostLayer"></div>
          <div data-el="pieceLayer"></div>
          <div class="tetris-overlay" data-el="overlay">
            <div data-el="overlayContent"></div>
          </div>
        </div>
        <div class="tetris-panel">
          <div class="tetris-box">
            <div class="tetris-box-label">TIẾP THEO</div>
            <div class="tetris-next-grid" data-el="nextGrid"></div>
          </div>
          <div class="tetris-box">
            <div class="tetris-box-label">ĐIỀU KHIỂN</div>
            <div class="tetris-ctrl-row"><span class="tetris-key">← →</span><span>Di chuyển</span></div>
            <div class="tetris-ctrl-row"><span class="tetris-key">↑ / X</span><span>Xoay</span></div>
            <div class="tetris-ctrl-row"><span class="tetris-key">↓</span><span>Tăng tốc</span></div>
            <div class="tetris-ctrl-row"><span class="tetris-key">Space</span><span>Rơi nhanh</span></div>
            <div class="tetris-ctrl-row"><span class="tetris-key">P</span><span>Tạm dừng</span></div>
          </div>
          <button class="tetris-exit-btn" data-el="pauseBtn">⏸ Tạm dừng</button>
          <button class="tetris-exit-btn" data-el="exitBtn">← Thoát &amp; lưu điểm</button>
        </div>
        <div class="tetris-cats">
          
        </div>
      </div>
    </div>`;
  }

  function q(root, name) { return root.querySelector(`[data-el="${name}"]`); }

  function buildBoardGrid() {
    dom.boardGrid.style.gridTemplateColumns = `repeat(${COLS}, ${CELL}px)`;
    dom.boardOuter.style.width = (COLS * CELL) + 'px';
    dom.boardOuter.style.height = (ROWS * CELL) + 'px';
    dom.cells = [];
    for (let r = 0; r < ROWS; r++) {
      const rowArr = [];
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'tetris-cell';
        cell.style.width = CELL + 'px';
        cell.style.height = CELL + 'px';
        dom.boardGrid.appendChild(cell);
        rowArr.push(cell);
      }
      dom.cells.push(rowArr);
    }
    for (let i = 0; i < 16; i++) {
      const mc = document.createElement('div');
      mc.className = 'tetris-mini-cell';
      dom.nextGrid.appendChild(mc);
    }
  }

  function renderBoardCell(el, color) {
    el.innerHTML = '';
    if (!color) {
      el.classList.remove('filled');
      el.style.removeProperty('--c');
      return;
    }
    el.style.setProperty('--c', color);
    el.classList.add('filled');
  }

  function makeBlock(x, y, color) {
    const el = document.createElement('div');
    el.className = 'tetris-block';
    el.style.left = (x * CELL) + 'px';
    el.style.top = (y * CELL) + 'px';
    el.style.width = CELL + 'px';
    el.style.height = CELL + 'px';
    el.style.setProperty('--c', color);
    return el;
  }

  function makeGhostBlock(x, y) {
    const el = document.createElement('div');
    el.className = 'tetris-ghost';
    el.style.left = (x * CELL) + 'px';
    el.style.top = (y * CELL) + 'px';
    el.style.width = CELL + 'px';
    el.style.height = CELL + 'px';
    return el;
  }

  function render() {
    if (!dom) return;
    const flashSet = state.clearing ? new Set(state.clearing) : null;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        renderBoardCell(dom.cells[r][c], state.board[r][c]);
        dom.cells[r][c].classList.toggle('tetris-flash', !!flashSet && flashSet.has(r));
      }

    dom.ghostLayer.innerHTML = '';
    dom.pieceLayer.innerHTML = '';
    if (state.piece) {
      const gy = getGhostY(state.board, state.piece);
      for (let r = 0; r < state.piece.shape.length; r++) {
        for (let c = 0; c < state.piece.shape[r].length; c++) {
          if (!state.piece.shape[r][c]) continue;
          const gr = gy + r, gc = state.piece.x + c;
          if (gr >= 0 && gr < ROWS) dom.ghostLayer.appendChild(makeGhostBlock(gc, gr));
          const pr = state.piece.y + r, pc = state.piece.x + c;
          if (pr >= 0 && pr < ROWS) dom.pieceLayer.appendChild(makeBlock(pc, pr, PIECES[state.piece.type].color));
        }
      }
    }

    if (dom.pauseBtn) {
      dom.pauseBtn.textContent = state.paused ? '▶ Tiếp tục' : '⏸ Tạm dừng';
    }

    dom.score.textContent = state.score.toLocaleString();

    const ns = PIECES[state.next].shape;
    const noffR = Math.floor((4 - ns.length) / 2);
    const noffC = Math.floor((4 - ns[0].length) / 2);
    const grid = Array.from({ length: 4 }, () => Array(4).fill(null));
    ns.forEach((row, r) => row.forEach((cell, c) => { if (cell) grid[noffR + r][noffC + c] = PIECES[state.next].color; }));
    const miniCells = dom.nextGrid.children;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const el = miniCells[r * 4 + c];
        const color = grid[r][c];
        if (color) { el.style.setProperty('--c', color); el.classList.add('filled'); }
        else { el.classList.remove('filled'); el.style.removeProperty('--c'); }
      }
    }

    if (!state.started || state.gameOver || state.paused) {
      dom.overlay.classList.add('show');
      // Khi thua thật sự (gameOver), phóng to overlay ra full màn hình thay vì chỉ trong khung bàn cờ
      dom.overlay.classList.toggle('tetris-overlay-final', !!state.gameOver);
      dom.overlayContent.innerHTML = '';
      if (state.gameOver) {
        // Khi vừa thua, hiện điểm + trạng thái "đang lưu" trước;
        // renderGameOverSummary() sẽ cập nhật lại nội dung này khi có kết quả từ server.
        dom.overlayContent.innerHTML = `
          <div class="tetris-overlay-title over">GAME OVER</div>
          <div class="tetris-overlay-sub">ĐIỂM: ${state.score.toLocaleString()}</div>
          <div class="tetris-overlay-sub">Đang lưu điểm...</div>`;
      } else if (state.paused) {
        dom.overlayContent.innerHTML = `
          <div class="tetris-overlay-title paused">TẠM DỪNG</div>
          <div class="tetris-overlay-sub">Nhấn P để tiếp tục</div>`;
      } else {
        dom.overlayContent.innerHTML = `<div class="tetris-overlay-title">SẴN SÀNG?</div>`;
        const btn = document.createElement('button');
        btn.className = 'tetris-start-btn';
        btn.textContent = 'BẮT ĐẦU';
        btn.onclick = startGame;
        dom.overlayContent.appendChild(btn);
      }
    } else {
      dom.overlay.classList.remove('show');
      dom.overlay.classList.remove('tetris-overlay-final');
    }
  }

  function spawn() {
    const type = state.next;
    const p = makePiece(type);
    if (!isValid(state.board, p.shape, p.x, p.y)) {
      state.gameOver = true;
      stopLoop();
      render();
      handleGameOver();
      return;
    }
    state.piece = p;
    state.next = randomType();
    render();
  }

  function drop() {
    if (state.paused || state.gameOver || !state.piece || state.clearing) return;
    const p = state.piece, b = state.board;
    if (isValid(b, p.shape, p.x, p.y + 1)) {
      p.y += 1;
    } else {
      state.board = lockPiece(b, p);
      state.piece = null;
      const fullRows = findFullRows(state.board);
      if (fullRows.length > 0) {
        stopLoop();
        state.clearing = fullRows;
        render();
        setTimeout(() => finishClear(fullRows), FLASH_MS);
        return;
      }
    }
    render();
    if (state.started && !state.piece && !state.gameOver) spawn();
  }

  // Xóa các hàng đã nhấp nháy xong, cộng điểm, rồi sinh khối mới và chạy lại vòng lặp.
  function finishClear(fullRows) {
    if (!dom || !state || !state.clearing) return; // đã unmount hoặc đã chơi lại trong lúc chờ
    const res = clearLines(state.board);
    state.board = res.board;
    state.clearing = null;
    state.score += pendingHardDropBonus;
    pendingHardDropBonus = 0;
    if (res.cleared > 0) {
      state.score += SCORE_TABLE[res.cleared] * state.level;
      state.lines += res.cleared;
      const newLevel = Math.floor(state.lines / 10) + 1;
      if (newLevel !== state.level) state.level = newLevel;
    }
    render();
    if (state.started && !state.gameOver) {
      spawn();
      if (!state.paused) startLoop();
    }
  }

  function stopLoop() { if (loopId) { clearInterval(loopId); loopId = null; } }
  function startLoop() { stopLoop(); loopId = setInterval(drop, SPEED(state.level)); }

  function startGame() {
    state = freshState();
    state.started = true;
    render();
    spawn();
    startLoop();
  }

  function hardDrop() {
    if (state.clearing) return;
    const p = state.piece, b = state.board;
    const gy = getGhostY(b, p);
    const dropped = gy - p.y;
    p.y = gy;
    state.board = lockPiece(b, p);
    state.piece = null;
    const fullRows = findFullRows(state.board);
    if (fullRows.length > 0) {
      stopLoop();
      pendingHardDropBonus = dropped * 2;
      state.clearing = fullRows;
      render();
      setTimeout(() => finishClear(fullRows), FLASH_MS);
      return;
    }
    state.score += dropped * 2;
    render();
    if (state.started && !state.gameOver) { spawn(); startLoop(); }
  }

  // Dùng khi người chơi bấm nút "Thoát & lưu điểm" giữa chừng: lưu điểm rồi về thẳng trang chủ.
  async function exitToHome() {
    if (typeof onFinishCb === 'function') {
      await onFinishCb(state.score);
    }
    if (typeof onGoHomeCb === 'function') onGoHomeCb();
  }

  // Dùng khi thua tự nhiên (rớt hết bàn cờ): lưu điểm, lấy hạng mới nhất,
  // rồi hiện bảng kết quả với 2 lựa chọn "Chơi lại" / "Về trang chủ".
  async function handleGameOver() {
    let stats = null;
    if (typeof onFinishCb === 'function') {
      stats = await onFinishCb(state.score);
    }
    renderGameOverSummary(stats);
  }

  function renderGameOverSummary(stats) {
    if (!dom || !state || !state.gameOver) return; // đã unmount hoặc đã chơi lại trong lúc chờ

    const finalScore = state.score.toLocaleString();
    const rankText = (stats && stats.rank) ? stats.rank : '—';
    const highText = (stats && typeof stats.highScore === 'number')
      ? stats.highScore.toLocaleString()
      : finalScore;

    dom.overlayContent.innerHTML = `
      <div class="tetris-overlay-title over">GAME OVER</div>
      <div class="tetris-overlay-sub">TỔNG ĐIỂM: ${finalScore}</div>
      <div class="tetris-overlay-sub">KỶ LỤC: ${highText}</div>
      <div class="tetris-overlay-sub">XẾP HẠNG HIỆN TẠI: ${rankText}</div>`;

    const actions = document.createElement('div');
    actions.className = 'tetris-gameover-actions';

    const replayBtn = document.createElement('button');
    replayBtn.className = 'tetris-start-btn';
    replayBtn.textContent = 'CHƠI LẠI';
    replayBtn.onclick = startGame;

    const homeBtn = document.createElement('button');
    homeBtn.className = 'tetris-exit-btn';
    homeBtn.textContent = 'VỀ TRANG CHỦ';
    homeBtn.onclick = () => { if (typeof onGoHomeCb === 'function') onGoHomeCb(); };

    actions.appendChild(replayBtn);
    actions.appendChild(homeBtn);
    dom.overlayContent.appendChild(actions);
  }

  function togglePause() {
    if (!state || !state.started || state.gameOver) return;
    state.paused = !state.paused;
    if (state.paused) stopLoop(); else startLoop();
    render();
  }

  function onKeyDown(e) {
    if (!state) return;
    if (!state.started || state.gameOver) return;
    if (e.key === 'p' || e.key === 'P') {
      togglePause();
      return;
    }
    if (state.paused || !state.piece) return;
    const b = state.board, p = state.piece;
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        if (isValid(b, p.shape, p.x - 1, p.y)) p.x -= 1;
        render();
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (isValid(b, p.shape, p.x + 1, p.y)) p.x += 1;
        render();
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (isValid(b, p.shape, p.x, p.y + 1)) { p.y += 1; state.score += 1; }
        render();
        break;
      case 'ArrowUp':
      case 'x': case 'X': {
        e.preventDefault();
        const rot = rotateCW(p.shape);
        for (const kick of [0, -1, 1, -2, 2]) {
          if (isValid(b, rot, p.x + kick, p.y)) { p.shape = rot; p.x += kick; break; }
        }
        render();
        break;
      }
      case ' ':
        e.preventDefault();
        hardDrop();
        break;
    }
  }

  function mount(containerEl, opts) {
    opts = opts || {};
    onFinishCb = opts.onFinish || null;
    onGoHomeCb = opts.onGoHome || null;

    containerEl.innerHTML = html();
    dom = {
      boardOuter: q(containerEl, 'boardOuter'),
      boardGrid: q(containerEl, 'boardGrid'),
      ghostLayer: q(containerEl, 'ghostLayer'),
      pieceLayer: q(containerEl, 'pieceLayer'),
      overlay: q(containerEl, 'overlay'),
      overlayContent: q(containerEl, 'overlayContent'),
      score: q(containerEl, 'score'),
      nextGrid: q(containerEl, 'nextGrid'),
      exitBtn: q(containerEl, 'exitBtn'),
      pauseBtn: q(containerEl, 'pauseBtn'),
    };
    buildBoardGrid();
    state = freshState();
    render();

    dom.exitBtn.onclick = () => {
      stopLoop();
      exitToHome();
    };

    dom.pauseBtn.onclick = togglePause;

    keyHandler = onKeyDown;
    document.addEventListener('keydown', keyHandler);
  }

  function unmount() {
    stopLoop();
    if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
    dom = null;
    state = null;
    onFinishCb = null;
    onGoHomeCb = null;
    pendingHardDropBonus = 0;
  }

  return { mount, unmount };
})();