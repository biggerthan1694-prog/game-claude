// 절차적 벽 텍스처 생성 (오프스크린 캔버스)
window.GAME = window.GAME || {};

GAME.Textures = (function () {
  const SIZE = 64;
  const cache = {};

  function makeCanvas() {
    const c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    return c;
  }

  // 1: 벽돌
  function brick() {
    const c = makeCanvas();
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#7a3b2e';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = '#4a221a';
    ctx.lineWidth = 2;
    const rowH = 8;
    for (let y = 0; y < SIZE; y += rowH) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SIZE, y); ctx.stroke();
      const offset = (y / rowH) % 2 === 0 ? 0 : 8;
      for (let x = -8; x < SIZE; x += 16) {
        ctx.beginPath(); ctx.moveTo(x + offset, y); ctx.lineTo(x + offset, y + rowH); ctx.stroke();
      }
    }
    // 얼룩
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
      ctx.fillRect(Math.random() * SIZE, Math.random() * SIZE, 3, 3);
    }
    return c;
  }

  // 2: 금속
  function metal() {
    const c = makeCanvas();
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, SIZE, 0);
    grad.addColorStop(0, '#5b6470');
    grad.addColorStop(0.5, '#8b95a3');
    grad.addColorStop(1, '#5b6470');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = '#333a42';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, SIZE - 8, SIZE - 8);
    // 리벳
    ctx.fillStyle = '#2b3138';
    const pts = [[8, 8], [SIZE - 8, 8], [8, SIZE - 8], [SIZE - 8, SIZE - 8], [SIZE / 2, SIZE / 2]];
    for (const [x, y] of pts) {
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    return c;
  }

  // 3: 돌
  function stone() {
    const c = makeCanvas();
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#6a6e6a';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 22; i++) {
      const x = Math.random() * SIZE, y = Math.random() * SIZE;
      const r = 4 + Math.random() * 8;
      const shade = 40 + Math.random() * 60;
      ctx.fillStyle = `rgb(${shade + 40},${shade + 42},${shade + 38})`;
      ctx.strokeStyle = `rgba(0,0,0,0.25)`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    return c;
  }

  // 4: 콘크리트/판넬
  function panel() {
    const c = makeCanvas();
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#9a9488';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = '#5f5a50';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, SIZE - 4, SIZE - 4);
    ctx.beginPath(); ctx.moveTo(SIZE / 2, 0); ctx.lineTo(SIZE / 2, SIZE); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, SIZE / 2); ctx.lineTo(SIZE, SIZE / 2); ctx.stroke();
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
      ctx.fillRect(Math.random() * SIZE, Math.random() * SIZE, 2, 2);
    }
    return c;
  }

  function get(id) {
    if (cache[id]) return cache[id];
    let canvas;
    switch (id) {
      case 1: canvas = brick(); break;
      case 2: canvas = metal(); break;
      case 3: canvas = stone(); break;
      case 4: canvas = panel(); break;
      default: canvas = brick();
    }
    cache[id] = canvas;
    return canvas;
  }

  // 바닥/천장용 단색 (그라디언트 형태로 처리는 raycaster에서)
  return { get, SIZE };
})();
