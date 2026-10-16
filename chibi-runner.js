/* ==================== CHIBI CHẠY NGANG MÀN HÌNH ====================
   Ghép các khung ảnh chibi/<code>/1.png .. <code>/N.png thành 1 nhân vật
   chạy qua lại 2 chiều, hiển thị cố định (position:fixed) trên mọi trang —
   vì được gắn thẳng vào <body>, không phải #app, nên render() của app.js
   (chỉ thay innerHTML của #app) không đụng tới nó, chạy liên tục xuyên
   suốt khi chuyển view.

   HỖ TRỢ NHIỀU CHIBI CHẠY CÙNG LÚC: mỗi mã chibi (code) có 1 "instance"
   độc lập (DOM riêng, vị trí/hướng/khung hình riêng). Gọi use() nhiều lần
   với các code khác nhau để chúng cùng chạy song song, không cái nào đè
   cái nào.

   File này CHỈ định nghĩa API (window.ChibiRunner), KHÔNG tự chạy chibi nào
   khi vừa nạp trang. app.js là nơi quyết định khi nào chạy / chạy chibi nào:
     - Đăng nhập lần đầu, chưa từng "Sử dụng" chibi nào -> không chạy gì cả.
     - Đã từng bấm "Sử dụng" -> mỗi lần login/restore phiên, app.js gọi
       ChibiRunner.sync(danh sách chibi đang active) để tự chạy lại đúng
       các chibi đó.
     - Bấm "Sử dụng" ở trang Chibi -> app.js gọi ChibiRunner.use(code) để
       thêm 1 chibi vào màn hình (không tắt các chibi khác đang chạy).
     - Bấm "Đi ngủ đi" ở trang Chibi -> app.js gọi ChibiRunner.stop(code)
       để chỉ dừng đúng chibi đó.
     - Đăng xuất -> app.js gọi ChibiRunner.stop() (không truyền code) để
       dừng & dọn TẤT CẢ chibi đang chạy.

   ==================== CONFIG RIÊNG CHO TỪNG CHIBI ====================
   DEFAULT_CONFIG bên dưới là giá trị mặc định dùng chung. Muốn 1 chibi có
   tốc độ / fps / kích thước / hướng mặt... riêng, không ảnh hưởng chibi
   khác, thì truyền `config` khi gọi use(), ví dụ (đặt trong CHIBI_GALLERY
   ở app.js):

     window.ChibiRunner.use("2", 13, frameFileNameFn, {
       speed: 60,          // chỉ chibi này chạy chậm hơn
       fps: 9,
       baseFacing: "right" // chỉ chibi này có ảnh gốc quay mặt sang phải
     });

   Field nào không truyền sẽ lấy lại giá trị trong DEFAULT_CONFIG. */

const DEFAULT_CONFIG = {
  frameDirBase: "chibi",       // thư mục gốc, ảnh nằm ở chibi/<code>/<n>.png
  frameExt: "png",
  spriteWidth: 200,            // độ rộng hiển thị (px)
  bottomOffset: 14,            // cách đáy màn hình (px)
  speed: 78,                   // tốc độ di chuyển (px/giây)
  fps: 11,                     // tốc độ lật khung hình chạy (khung hình/giây)
  zIndex: 45,
  colorBoost: "saturate(1.35) contrast(1.12) brightness(1.04)",
  // ảnh bị thu nhỏ nhiều (666px -> spriteWidth) nên viền mờ lúc tách nền
  // bị loang ra làm cả hình nhìn nhạt màu; bộ lọc trên bù lại cho đậm hơn.
  // Không muốn chỉnh màu nữa thì đặt colorBoost: "" hoặc null.
  baseFacing: "left",           // "left" hoặc "right": ảnh gốc vốn quay mặt/đi hướng nào
};

// Giữ tên cũ để không phá code khác lỡ tham chiếu tới CHIBI_CONFIG.
const CHIBI_CONFIG = DEFAULT_CONFIG;

(function initChibiRunner() {
  // Tránh khởi tạo trùng nếu script bị nạp 2 lần
  if (window.ChibiRunner) return;

  // Nhiều chibi cùng chạy -> nếu đều đứng sát đáy (bottomOffset giống nhau)
  // sẽ dễ chồng khít lên nhau khi đi ngang qua nhau. Mỗi chibi được cộng
  // thêm 1 khoảng lệch dọc nhỏ, tính theo mã (code) nên luôn cố định dù
  // thứ tự bật/tắt các chibi có đổi thế nào.
  const STAGGER_STEP = 22;   // px lệch dọc giữa mỗi "làn"
  const STAGGER_LANES = 4;   // số làn quay vòng
  function laneOffsetFor(code) {
    let h = 0;
    for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
    return (h % STAGGER_LANES) * STAGGER_STEP;
  }

  // instances: Map<code, instanceObject> — mỗi chibi đang chạy có 1 entry riêng.
  const instances = new Map();

  // Dựng 1 instance chibi độc lập: DOM riêng + vòng lặp animation riêng.
  function createInstance(code) {
    const wrap = document.createElement("div");
    wrap.className = "chibi-runner";
    wrap.dataset.chibiCode = code;
    wrap.style.position = "fixed";
    wrap.style.left = "0";
    wrap.style.pointerEvents = "none";
    wrap.style.willChange = "transform";

    const img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    img.style.display = "block";
    img.style.width = "100%";
    img.style.height = "auto";
    img.style.userSelect = "none";
    img.style.webkitUserDrag = "none";
    wrap.appendChild(img);
    document.body.appendChild(wrap);

    const inst = {
      code,
      wrap, img,
      cfg: DEFAULT_CONFIG,
      msPerFrame: 1000 / DEFAULT_CONFIG.fps,
      frameSrcs: [],
      x: 0,
      dir: Math.random() < 0.5 ? -1 : 1, // -1: sang trái, 1: sang phải
      frameIdx: 0,
      lastTime: null,
      frameAcc: 0,
      rafId: null,
      hasPositioned: false,
      // ----- trạng thái "ngã" khi bị click -----
      state: "walk",           // "walk" | "falling"
      fallFrameSrcs: null,     // mảng ảnh khung ngã (chibi/<code>/<fall.dir>/...)
      fallFrameIdx: 0,
      fallMsPerFrame: 0,
      fallHoldMs: 800,         // đứng yên ở khung ngã cuối bao lâu trước khi đứng dậy chạy tiếp
      fallHoldAcc: 0,
    };

    function clampBounds() {
      return Math.max(0, window.innerWidth - inst.cfg.spriteWidth);
    }
    inst.clampBounds = clampBounds;

    function applyCfgStyles() {
      wrap.style.bottom = `${inst.cfg.bottomOffset + laneOffsetFor(code)}px`;
      wrap.style.width = `${inst.cfg.spriteWidth}px`;
      wrap.style.zIndex = inst.cfg.zIndex;
      wrap.style.filter = "drop-shadow(0 6px 6px rgba(0,0,0,.35))";
      img.style.filter = inst.cfg.colorBoost || "none";
      // Chỉ bắt click khi chibi này có cấu hình `fall` (ngã khi click);
      // các chibi khác vẫn giữ pointerEvents:none để không chặn click xuyên qua.
      wrap.style.pointerEvents = inst.cfg.fall ? "auto" : "none";
      wrap.style.cursor = inst.cfg.fall ? "pointer" : "default";
    }
    inst.applyCfgStyles = applyCfgStyles;

    // Ngoài lật ảnh theo hướng đi, còn đẩy ảnh xuống thấp hơn 1 chút khi
    // đang ngã (fall.yOffset, px) để bù cho việc ảnh ngã có khung/canvas
    // khác ảnh đi khiến nhân vật bị nổi cao hơn mặt đất. Lúc đi lại (walk)
    // offset luôn về 0.
    function applyFacing() {
      const flipWhenDir = inst.cfg.baseFacing === "right" ? -1 : 1;
      const flip = inst.dir === flipWhenDir ? "scaleX(-1)" : "scaleX(1)";
      const yOff = (inst.state === "falling" && inst.cfg.fall && inst.cfg.fall.yOffset) || 0;
      // fall.scale (tuỳ chọn): phóng to riêng ảnh ngã, không ảnh hưởng lúc đang chạy.
      const fallScale = (inst.state === "falling" && inst.cfg.fall && inst.cfg.fall.scale) || 1;
      const parts = [flip];
      if (fallScale !== 1) parts.push(`scale(${fallScale})`);
      if (yOff) parts.push(`translateY(${yOff}px)`);
      img.style.transform = parts.join(" ");
    }
    inst.applyFacing = applyFacing;

    function tickWalking(dt) {
      const maxX = clampBounds();
      inst.x += (inst.dir * inst.cfg.speed * dt) / 1000;
      if (inst.x <= 0) {
        inst.x = 0;
        inst.dir = 1;
        applyFacing();
      } else if (inst.x >= maxX) {
        inst.x = maxX;
        inst.dir = -1;
        applyFacing();
      }
      wrap.style.transform = `translateX(${inst.x}px)`;

      inst.frameAcc += dt;
      if (inst.frameAcc >= inst.msPerFrame && inst.frameSrcs.length > 1) {
        inst.frameAcc = 0;
        inst.frameIdx = (inst.frameIdx + 1) % inst.frameSrcs.length;
        img.src = inst.frameSrcs[inst.frameIdx];
      }
    }

    // Đang ngã: đứng yên tại chỗ (không di chuyển x), phát lần lượt hết
    // frameSrcs ngã; tới khung cuối thì giữ nguyên `fallHoldMs` rồi tự
    // đứng dậy, quay lại chạy bình thường từ khung đầu tiên.
    function tickFalling(dt) {
      if (inst.fallFrameIdx < inst.fallFrameSrcs.length - 1) {
        inst.frameAcc += dt;
        if (inst.frameAcc >= inst.fallMsPerFrame) {
          inst.frameAcc = 0;
          inst.fallFrameIdx++;
          img.src = inst.fallFrameSrcs[inst.fallFrameIdx];
        }
      } else {
        inst.fallHoldAcc += dt;
        if (inst.fallHoldAcc >= inst.fallHoldMs) {
          inst.state = "walk";
          inst.frameAcc = 0;
          inst.frameIdx = 0;
          img.src = inst.frameSrcs[0];
          applyFacing();
        }
      }
    }

    function tick(t) {
      if (inst.lastTime === null) inst.lastTime = t;
      // Chặn dt quá lớn (vd. tab bị trình duyệt hạ tốc rAF lúc để lâu không
      // đụng tới) — không chặn thì 1 khung "nhảy vọt" có thể làm toạ độ/khung
      // hình tính sai, gây giật/lag khi quay lại tương tác.
      const dt = Math.min(t - inst.lastTime, 100);
      inst.lastTime = t;

      try {
        if (inst.state === "falling") {
          tickFalling(dt);
        } else {
          tickWalking(dt);
        }
      } catch (err) {
        // Nếu 1 khung lỡ lỗi mà không bọc try/catch, dòng requestAnimationFrame
        // bên dưới sẽ không bao giờ chạy nữa -> chibi đứng im vĩnh viễn, bấm
        // vào cũng không ngã được. Bọc lại để lỗi 1 khung không giết cả vòng lặp.
        console.error("ChibiRunner tick error:", err);
      }

      inst.rafId = requestAnimationFrame(tick);
    }
    inst.tick = tick;

    // Tab bị ẩn lâu rồi quay lại hiển thị: reset lastTime để khung kế tiếp
    // không bị tính dt dựa trên mốc thời gian quá cũ (tránh nhảy khung lạ).
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") inst.lastTime = null;
    });

    // Bấm chuột vào chibi -> chuyển sang trạng thái "ngã" (chỉ áp dụng nếu
    // chibi này có cấu hình `fall`). Đang ngã mà bấm tiếp thì bỏ qua, đợi
    // đứng dậy xong mới ngã lại được.
    function triggerFall() {
      if (!inst.cfg.fall || !inst.fallFrameSrcs || !inst.fallFrameSrcs.length) return;
      if (inst.state === "falling") return;
      inst.state = "falling";
      inst.fallFrameIdx = 0;
      inst.fallHoldAcc = 0;
      inst.frameAcc = 0;
      img.src = inst.fallFrameSrcs[0];
      applyFacing(); // đẩy ảnh xuống thấp (fall.yOffset) ngay khi bắt đầu ngã
    }
    inst.triggerFall = triggerFall;
    wrap.addEventListener("click", triggerFall);

    function startLoop() {
      if (inst.rafId !== null) return;
      inst.lastTime = null;
      inst.rafId = requestAnimationFrame(tick);
    }
    inst.startLoop = startLoop;

    function stopLoop() {
      if (inst.rafId !== null) {
        cancelAnimationFrame(inst.rafId);
        inst.rafId = null;
      }
    }
    inst.stopLoop = stopLoop;

    // Giữ chibi trong màn hình khi resize cửa sổ
    window.addEventListener("resize", () => {
      inst.x = Math.min(inst.x, clampBounds());
    });

    return inst;
  }

  window.ChibiRunner = {
    /**
     * Bắt đầu chạy chibi có mã `code` (thêm mới vào màn hình, KHÔNG tắt các
     * chibi khác đang chạy). Nếu `code` đã đang chạy, gọi lại chỉ để cập
     * nhật config (đổi tốc độ/kích thước...) mà không giật lại animation.
     * Mặc định ảnh lấy từ chibi/<code>/1.<ext> .. <code>/<frameCount>.<ext>.
     * Nếu chibi đặt tên file khác (vd giữ nguyên "frame_001.png"...), truyền
     * thêm `frameFileName(i)` trả về đúng tên file ứng với khung thứ i.
     * `config` (optional): override riêng cho chibi này, ví dụ
     * { speed, fps, spriteWidth, bottomOffset, zIndex, colorBoost, baseFacing,
     *   frameDirBase, frameExt }. Field nào bỏ trống lấy DEFAULT_CONFIG.
     */
    use(code, frameCount = 10, frameFileName, config) {
      if (!code) return;

      let inst = instances.get(code);
      const isNew = !inst;
      if (isNew) {
        inst = createInstance(code);
        instances.set(code, inst);
      }

      inst.cfg = Object.assign({}, DEFAULT_CONFIG, config || {});
      inst.msPerFrame = 1000 / inst.cfg.fps;
      inst.applyCfgStyles();

      const fileNameFor = typeof frameFileName === "function"
        ? frameFileName
        : (i) => `${i}.${inst.cfg.frameExt}`;

      inst.frameSrcs = [];
      for (let i = 1; i <= frameCount; i++) {
        const src = `${inst.cfg.frameDirBase}/${code}/${fileNameFor(i)}`;
        inst.frameSrcs.push(src);
        const preload = new Image();
        preload.src = src;
      }

      // Khung ảnh "ngã" khi click (tuỳ chọn, chỉ có nếu config truyền `fall`).
      // fall = { dir, frameFileName, start, end, fps, holdMs }
      // Ảnh lấy từ: chibi/<code>/<fall.dir>/<frameFileName(i)>, i chạy từ start..end.
      if (inst.cfg.fall) {
        const f = inst.cfg.fall;
        const fallFileNameFor = typeof f.frameFileName === "function"
          ? f.frameFileName
          : (i) => `${i}.${inst.cfg.frameExt}`;
        const dirPart = f.dir ? `${f.dir}/` : "";
        inst.fallFrameSrcs = [];
        for (let i = f.start; i <= f.end; i++) {
          const src = `${inst.cfg.frameDirBase}/${code}/${dirPart}${fallFileNameFor(i)}`;
          inst.fallFrameSrcs.push(src);
          const preload = new Image();
          preload.src = src;
        }
        inst.fallMsPerFrame = 1000 / (f.fps || inst.cfg.fps);
        inst.fallHoldMs = f.holdMs != null ? f.holdMs : 800;
      } else {
        inst.fallFrameSrcs = null;
      }

      if (isNew) {
        inst.frameIdx = 0;
        inst.img.src = inst.frameSrcs[0];
        inst.x = Math.random() * inst.clampBounds();
        inst.applyFacing();
        inst.wrap.style.transform = `translateX(${inst.x}px)`;
        inst.wrap.style.display = "block";
        inst.startLoop();
      } else {
        // Đã đang chạy: chỉ đảm bảo ảnh khung hiện tại còn hợp lệ với bộ
        // khung mới (phòng khi frameCount đổi) và vị trí vẫn trong màn hình.
        if (inst.frameIdx >= inst.frameSrcs.length) inst.frameIdx = 0;
        inst.img.src = inst.frameSrcs[inst.frameIdx];
        inst.x = Math.min(inst.x, inst.clampBounds());
        inst.wrap.style.display = "block";
        inst.startLoop();
      }
    },

    /**
     * Dừng & gỡ bỏ chibi có mã `code` khỏi màn hình.
     * Không truyền `code` -> dừng & gỡ TẤT CẢ chibi đang chạy (đăng xuất).
     */
    stop(code) {
      if (code === undefined) {
        for (const c of Array.from(instances.keys())) this.stop(c);
        return;
      }
      const inst = instances.get(code);
      if (!inst) return;
      inst.stopLoop();
      inst.wrap.remove();
      instances.delete(code);
    },

    /**
     * Đồng bộ tập chibi đang chạy cho khớp với `entries`
     * (mảng { code, frameCount, frameFileName, config }): chibi nào trong
     * danh sách mà chưa chạy thì bật, chibi nào đang chạy mà không còn
     * trong danh sách thì tắt. Chibi đã chạy sẵn và vẫn còn trong danh sách
     * thì giữ nguyên animation, chỉ cập nhật config.
     */
    sync(entries) {
      const wanted = new Set((entries || []).map(e => e.code));
      for (const code of Array.from(instances.keys())) {
        if (!wanted.has(code)) this.stop(code);
      }
      for (const e of entries || []) {
        this.use(e.code, e.frameCount, e.frameFileName, e.config);
      }
    },

    /** Danh sách mã chibi đang chạy (mảng rỗng nếu không có chibi nào). */
    current() {
      return Array.from(instances.keys());
    },
  };
})();