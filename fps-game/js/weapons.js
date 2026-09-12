// 무기 로직: 반동, 재장전, 히트스캔, 뷰모델 렌더링
window.GAME = window.GAME || {};

GAME.Weapons = (function () {
  function createInstance(weaponId) {
    const def = GAME.WEAPONS[weaponId];
    return {
      id: weaponId,
      def,
      ammoInMag: def.magSize,
      reserve: def.infiniteReserve ? Infinity : def.reserve,
      reloading: false,
      reloadTimer: 0,
      fireTimer: 0,
      muzzleFlash: 0,
      recoilKick: 0,
      lowerAmount: 0, // 재장전 시 아래로 내려가는 정도 0~1
      pumpAnim: 0,
    };
  }

  function createLoadout(weaponIds) {
    const weapons = {};
    for (const id of weaponIds) weapons[id] = createInstance(id);
    return weapons;
  }

  function canFire(w) {
    return !w.reloading && w.fireTimer <= 0 && w.ammoInMag > 0;
  }

  function startReload(w, player) {
    if (w.reloading) return;
    if (w.ammoInMag >= w.def.magSize) return;
    if (w.reserve <= 0) return;
    w.reloading = true;
    w.reloadTimer = w.def.reloadTime * (player ? player.reloadMult : 1);
    GAME.Audio.reload();
  }

  function update(w, dt, player) {
    if (w.fireTimer > 0) w.fireTimer -= dt;
    if (w.muzzleFlash > 0) w.muzzleFlash = Math.max(0, w.muzzleFlash - dt * 6);
    if (w.recoilKick > 0) w.recoilKick = Math.max(0, w.recoilKick - dt * 5);
    if (w.pumpAnim > 0) w.pumpAnim = Math.max(0, w.pumpAnim - dt * 3);

    if (w.reloading) {
      w.reloadTimer -= dt;
      const t = 1 - Math.max(0, w.reloadTimer / (w.def.reloadTime * (player ? player.reloadMult : 1)));
      w.lowerAmount = Math.sin(Math.min(t, 1) * Math.PI); // 내려갔다 올라옴
      if (w.reloadTimer <= 0) {
        w.reloading = false;
        w.lowerAmount = 0;
        const need = w.def.magSize - w.ammoInMag;
        const take = w.reserve === Infinity ? need : Math.min(need, w.reserve);
        w.ammoInMag += take;
        if (w.reserve !== Infinity) w.reserve -= take;
      }
    }
  }

  // 히트스캔 발사: 벽/적과의 교차 검사
  function fire(w, player, map, enemies, onHit, onWallHit) {
    if (!canFire(w)) {
      if (w.ammoInMag <= 0 && !w.reloading) GAME.Audio.empty();
      return false;
    }
    w.ammoInMag--;
    w.fireTimer = 1 / w.def.fireRate;
    w.muzzleFlash = 1;
    w.recoilKick = 1;
    w.pumpAnim = 1;
    player.recoil = Math.min(1, player.recoil + GAME.CONFIG.RECOIL_KICK * 10);
    player.shots++;
    GAME.Audio.shoot(w.id);

    let spread = w.def.spread;
    if (player.sprinting) spread *= GAME.CONFIG.SPRINT_SPREAD_MULT;
    if (player.ads) spread *= GAME.CONFIG.ADS_SPREAD_MULT;

    const pellets = w.def.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const angle = player.angle + (Math.random() * 2 - 1) * spread;
      castHitscan(player, angle, w.def.range, w.def.damage, map, enemies, onHit, onWallHit);
    }

    if (w.ammoInMag <= 0 && w.reserve > 0) {
      // 자동 재장전은 하지 않음 (플레이어가 R로 재장전)
    }
    return true;
  }

  function castHitscan(player, angle, range, damage, map, enemies, onHit, onWallHit) {
    const dirX = Math.cos(angle), dirY = Math.sin(angle);
    const step = 0.05;
    let x = player.x, y = player.y;
    let dist = 0;
    let hitEnemy = null;
    let hitDist = Infinity;

    // 적과의 교차 검사 (원기둥 근사, 헤드샷은 상단 1/3 판정)
    for (const e of enemies) {
      if (e.state === 'DEAD') continue;
      const ex = e.x - player.x, ey = e.y - player.y;
      const proj = ex * dirX + ey * dirY;
      if (proj < 0 || proj > range) continue;
      const closestX = player.x + dirX * proj, closestY = player.y + dirY * proj;
      const d = Math.hypot(closestX - e.x, closestY - e.y);
      if (d < e.def.size) {
        if (proj < hitDist) { hitDist = proj; hitEnemy = e; }
      }
    }

    // 벽까지의 거리 계산
    let wallDist = range;
    while (dist < range) {
      x += dirX * step; y += dirY * step; dist += step;
      if (GAME.Raycaster.isWall(map, x, y) > 0) { wallDist = dist; break; }
    }

    if (hitEnemy && hitDist < wallDist) {
      const isHeadshot = Math.random() < 0.25; // 근사 헤드샷 판정 (수직 조준 반영 단순화)
      const finalDamage = isHeadshot ? damage * GAME.CONFIG.HEADSHOT_MULT : damage;
      player.hits++;
      onHit(hitEnemy, finalDamage, isHeadshot);
    } else {
      onWallHit(x, y);
    }
  }

  // ===== 뷰모델 렌더링 =====
  function renderViewmodel(w, player, ctx, W, H, skinId) {
    const skin = GAME.SKINS[skinId];
    const bobX = player.moving && !player.ads ? Math.sin(player.bobPhase) * 18 : 0;
    const bobY = player.moving && !player.ads ? Math.abs(Math.sin(player.bobPhase)) * 10 : 0;
    const adsOffsetX = player.ads ? (W / 2 - (W * 0.32)) : 0;
    const adsOffsetY = player.ads ? 30 : 0;
    const baseX = W * 0.68 + bobX + adsOffsetX;
    const baseY = H * 0.82 + bobY - w.recoilKick * 20 + w.lowerAmount * 160 + adsOffsetY;

    ctx.save();
    ctx.translate(baseX, baseY);

    switch (w.id) {
      case 'pistol': drawPistol(ctx, w, skin); break;
      case 'smg': drawSMG(ctx, w, skin); break;
      case 'shotgun': drawShotgun(ctx, w, skin); break;
      case 'sniper': drawSniper(ctx, w, skin); break;
    }

    ctx.restore();

    // 머즐 플래시
    if (w.muzzleFlash > 0) {
      const flashX = baseX + (w.id === 'sniper' ? -140 : -100);
      const flashY = baseY - 60;
      ctx.save();
      ctx.globalAlpha = w.muzzleFlash;
      const grad = ctx.createRadialGradient(flashX, flashY, 0, flashX, flashY, 28);
      grad.addColorStop(0, '#fff6c8');
      grad.addColorStop(0.5, '#ffcf4a');
      grad.addColorStop(1, 'rgba(255,140,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(flashX, flashY, 28, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawHand(ctx, skin, x, y, w, h) {
    ctx.fillStyle = '#d9a066';
    ctx.fillRect(x, y, w, h);
  }

  function drawPistol(ctx, w, skin) {
    ctx.fillStyle = skin.secondary;
    ctx.fillRect(-30, -10, 70, 26); // 슬라이드
    ctx.fillStyle = w.def.color;
    ctx.fillRect(-30, -14, 60, 8);
    ctx.fillStyle = skin.primary;
    ctx.fillRect(-10, 10, 20, 50); // 손잡이
    drawHand(ctx, skin, -14, 20, 26, 40);
  }

  function drawSMG(ctx, w, skin) {
    ctx.fillStyle = skin.secondary;
    ctx.fillRect(-70, -8, 120, 22); // 몸체
    ctx.fillStyle = w.def.color;
    ctx.fillRect(-90, -4, 24, 12); // 총열
    ctx.fillStyle = skin.primary;
    ctx.fillRect(-30, 0, 30, 16); // 탄창
    ctx.fillRect(0, 12, 18, 46); // 손잡이
    drawHand(ctx, skin, -4, 22, 24, 36);
    drawHand(ctx, skin, -50, 4, 22, 20);
  }

  function drawShotgun(ctx, w, skin) {
    ctx.fillStyle = skin.secondary;
    ctx.fillRect(-100, -10, 150, 24); // 총열
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(-20, -6, 60, 16); // 목재 개머리 부분
    ctx.fillStyle = w.def.color;
    const pumpOffset = w.pumpAnim * 14;
    ctx.fillRect(-70 + pumpOffset, -4, 28, 16); // 펌프
    ctx.fillStyle = skin.primary;
    ctx.fillRect(10, 8, 18, 44);
    drawHand(ctx, skin, 6, 18, 24, 34);
    drawHand(ctx, skin, -68 + pumpOffset, 8, 22, 18);
  }

  function drawSniper(ctx, w, skin) {
    ctx.fillStyle = skin.secondary;
    ctx.fillRect(-140, -8, 190, 20); // 긴 총열
    ctx.fillStyle = '#111';
    ctx.fillRect(-40, -26, 60, 14); // 스코프
    ctx.beginPath(); ctx.arc(-10, -19, 8, 0, Math.PI * 2); ctx.fillStyle = '#0a1a0a'; ctx.fill();
    ctx.fillStyle = skin.primary;
    ctx.fillRect(20, -4, 26, 8); // 볼트
    ctx.fillRect(20, 6, 18, 46);
    drawHand(ctx, skin, 16, 16, 24, 34);
    drawHand(ctx, skin, -90, -2, 22, 18);
  }

  return { createInstance, createLoadout, canFire, startReload, update, fire, renderViewmodel };
})();
