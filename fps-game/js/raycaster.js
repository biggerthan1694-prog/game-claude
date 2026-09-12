// 레이캐스팅 렌더링 엔진 (Wolfenstein 3D 방식, DDA 알고리즘)
window.GAME = window.GAME || {};

GAME.Raycaster = (function () {
  let canvas, ctx, buf, bufCtx, bufImageData;
  let W = 0, H = 0;
  let zBuffer = [];

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    buf = document.createElement('canvas');
    bufCtx = buf.getContext('2d');
    resize();
  }

  function resize() {
    const scale = GAME.state ? GAME.state.settings.renderScale : GAME.CONFIG.RENDER_SCALE;
    const cw = canvas.clientWidth || window.innerWidth;
    const ch = canvas.clientHeight || window.innerHeight;
    canvas.width = cw;
    canvas.height = ch;
    W = Math.max(1, Math.floor(cw * scale));
    H = Math.max(1, Math.floor(ch * scale));
    buf.width = W;
    buf.height = H;
    zBuffer = new Array(W).fill(Infinity);
  }

  function isWall(map, x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (iy < 0 || iy >= map.length || ix < 0 || ix >= map[0].length) return 1;
    return map[iy][ix];
  }

  // DDA로 벽까지 캐스팅 + 세로 스트라이프 그리기
  function render(player, map) {
    bufCtx.clearRect(0, 0, W, H);

    // 천장/바닥
    const grad1 = bufCtx.createLinearGradient(0, 0, 0, H / 2);
    grad1.addColorStop(0, '#1b1f2a');
    grad1.addColorStop(1, '#33394a');
    bufCtx.fillStyle = grad1;
    bufCtx.fillRect(0, 0, W, H / 2);
    const grad2 = bufCtx.createLinearGradient(0, H / 2, 0, H);
    grad2.addColorStop(0, '#2b2b28');
    grad2.addColorStop(1, '#14140f');
    bufCtx.fillStyle = grad2;
    bufCtx.fillRect(0, H / 2, W, H / 2);

    const fov = player.fov;
    const dirX = Math.cos(player.angle), dirY = Math.sin(player.angle);
    const planeLen = Math.tan(fov / 2);
    const planeX = -dirY * planeLen, planeY = dirX * planeLen;

    for (let x = 0; x < W; x++) {
      const cameraX = 2 * x / W - 1;
      const rayDirX = dirX + planeX * cameraX;
      const rayDirY = dirY + planeY * cameraX;

      let mapX = Math.floor(player.x);
      let mapY = Math.floor(player.y);

      const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
      const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);

      let stepX, stepY, sideDistX, sideDistY;
      if (rayDirX < 0) { stepX = -1; sideDistX = (player.x - mapX) * deltaDistX; }
      else { stepX = 1; sideDistX = (mapX + 1 - player.x) * deltaDistX; }
      if (rayDirY < 0) { stepY = -1; sideDistY = (player.y - mapY) * deltaDistY; }
      else { stepY = 1; sideDistY = (mapY + 1 - player.y) * deltaDistY; }

      let hit = 0, side = 0, tile = 0;
      let iterations = 0;
      while (hit === 0 && iterations < 64) {
        if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; side = 0; }
        else { sideDistY += deltaDistY; mapY += stepY; side = 1; }
        tile = isWall(map, mapX, mapY);
        if (tile > 0) hit = 1;
        iterations++;
      }

      let perpDist;
      if (side === 0) perpDist = (mapX - player.x + (1 - stepX) / 2) / (rayDirX || 1e-9);
      else perpDist = (mapY - player.y + (1 - stepY) / 2) / (rayDirY || 1e-9);
      perpDist = Math.max(perpDist, 0.0001);

      zBuffer[x] = perpDist;

      const lineHeight = Math.floor(H / perpDist);
      let drawStart = Math.floor(-lineHeight / 2 + H / 2);
      let drawEnd = Math.floor(lineHeight / 2 + H / 2);
      if (drawStart < 0) drawStart = 0;
      if (drawEnd >= H) drawEnd = H - 1;

      // 벽에 맞은 정확한 위치 -> 텍스처 x 좌표
      let wallX;
      if (side === 0) wallX = player.y + perpDist * rayDirY;
      else wallX = player.x + perpDist * rayDirX;
      wallX -= Math.floor(wallX);
      let texX = Math.floor(wallX * GAME.Textures.SIZE);
      if ((side === 0 && rayDirX > 0) || (side === 1 && rayDirY < 0)) {
        texX = GAME.Textures.SIZE - texX - 1;
      }

      const texCanvas = GAME.Textures.get(tile);
      bufCtx.drawImage(texCanvas, texX, 0, 1, GAME.Textures.SIZE, x, drawStart, 1, drawEnd - drawStart);

      // 거리 명암 처리
      const dist01 = Math.min(perpDist / GAME.CONFIG.MAX_RENDER_DIST, 1);
      let shade = dist01 * 0.85;
      if (side === 1) shade += 0.12; // Y측 면은 약간 더 어둡게
      bufCtx.fillStyle = `rgba(0,0,0,${Math.min(shade, 0.92)})`;
      bufCtx.fillRect(x, drawStart, 1, drawEnd - drawStart);
    }
  }

  // 적/픽업 스프라이트 렌더링 (Z-버퍼로 가림 처리)
  function renderSprites(player, sprites) {
    const dirX = Math.cos(player.angle), dirY = Math.sin(player.angle);
    const planeLen = Math.tan(player.fov / 2);
    const planeX = -dirY * planeLen, planeY = dirX * planeLen;

    const withDist = sprites.map(s => ({
      s, dist: (player.x - s.x) ** 2 + (player.y - s.y) ** 2,
    })).sort((a, b) => b.dist - a.dist);

    for (const { s } of withDist) {
      const spriteX = s.x - player.x;
      const spriteY = s.y - player.y;

      const invDet = 1.0 / (planeX * dirY - dirX * planeY);
      const transformX = invDet * (dirY * spriteX - dirX * spriteY);
      const transformY = invDet * (-planeY * spriteX + planeX * spriteY); // 깊이

      if (transformY <= 0.05) continue;

      const spriteScreenX = Math.floor((W / 2) * (1 + transformX / transformY));
      const scale = s.scale || 1;
      const spriteH = Math.abs(Math.floor(H / transformY)) * scale;
      const spriteW = spriteH;

      const drawStartY = Math.max(0, Math.floor(-spriteH / 2 + H / 2 + (s.vOffset || 0) * H / transformY));
      const drawEndY = Math.min(H - 1, Math.floor(spriteH / 2 + H / 2 + (s.vOffset || 0) * H / transformY));
      const drawStartX = Math.floor(-spriteW / 2 + spriteScreenX);
      const drawEndX = Math.floor(spriteW / 2 + spriteScreenX);

      if (drawEndX < 0 || drawStartX >= W) continue;

      const clampStartX = Math.max(0, drawStartX);
      const clampEndX = Math.min(W - 1, drawEndX);

      // Z버퍼 체크: 스프라이트가 벽 뒤에 있으면 잘라서 그림
      let visStart = -1, visEnd = -1;
      for (let x = clampStartX; x <= clampEndX; x++) {
        if (transformY < zBuffer[x]) {
          if (visStart === -1) visStart = x;
          visEnd = x;
        } else if (visStart !== -1) {
          drawSpriteSlice(s, drawStartX, drawEndX, drawStartY, drawEndY, visStart, visEnd);
          visStart = -1;
        }
      }
      if (visStart !== -1) drawSpriteSlice(s, drawStartX, drawEndX, drawStartY, drawEndY, visStart, visEnd);
    }
  }

  function drawSpriteSlice(s, dsX, deX, dsY, deY, clipStart, clipEnd) {
    if (!s.canvas) return;
    const spriteW = deX - dsX;
    const spriteH = deY - dsY;
    if (spriteW <= 0 || spriteH <= 0) return;
    bufCtx.save();
    bufCtx.beginPath();
    bufCtx.rect(clipStart, dsY, clipEnd - clipStart + 1, spriteH);
    bufCtx.clip();
    bufCtx.globalAlpha = s.alpha !== undefined ? s.alpha : 1;
    if (s.tint) {
      bufCtx.drawImage(s.canvas, dsX, dsY, spriteW, spriteH);
      bufCtx.globalCompositeOperation = 'source-atop';
      bufCtx.fillStyle = s.tint;
      bufCtx.globalAlpha = s.tintAlpha || 0.5;
      bufCtx.fillRect(dsX, dsY, spriteW, spriteH);
      bufCtx.globalCompositeOperation = 'source-over';
    } else {
      bufCtx.drawImage(s.canvas, dsX, dsY, spriteW, spriteH);
    }
    bufCtx.restore();
  }

  function present() {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, canvas.width, canvas.height);
  }

  function getBufCtx() { return bufCtx; }
  function getSize() { return { W, H }; }
  function getZBuffer() { return zBuffer; }

  return { init, resize, render, renderSprites, present, getBufCtx, getSize, getZBuffer, isWall };
})();
