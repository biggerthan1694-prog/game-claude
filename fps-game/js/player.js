// 플레이어: 이동, 충돌, 체력, 입력
window.GAME = window.GAME || {};

GAME.Player = (function () {
  function create(skinId, mapDef) {
    const skin = GAME.SKINS[skinId];
    return {
      x: mapDef.spawn.x, y: mapDef.spawn.y, angle: mapDef.spawn.angle,
      pitch: 0,
      fov: GAME.CONFIG.FOV,
      baseFov: GAME.CONFIG.FOV,
      hp: skin.maxHp, maxHp: skin.maxHp,
      skinId,
      speedMult: skin.speedMult,
      reloadMult: skin.reloadMult,
      visionReduce: skin.visionReduce,
      sprinting: false,
      ads: false,
      bobPhase: 0,
      bobAmount: 0,
      recoil: 0,
      moveX: 0, moveY: 0, moving: false,
      shots: 0, hits: 0, kills: 0,
      hurtFlash: 0,
      hurtDirX: 0, hurtDirY: 0,
    };
  }

  function tryMove(player, map, dx, dy) {
    const r = GAME.CONFIG.PLAYER_RADIUS;
    // X축 이동
    let nx = player.x + dx;
    if (!collides(map, nx, player.y, r)) player.x = nx;
    // Y축 이동
    let ny = player.y + dy;
    if (!collides(map, player.x, ny, r)) player.y = ny;
  }

  function collides(map, x, y, r) {
    const checks = [
      [x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r],
    ];
    for (const [cx, cy] of checks) {
      if (GAME.Raycaster.isWall(map, cx, cy) > 0) return true;
    }
    return false;
  }

  function update(player, input, map, dt) {
    const cfg = GAME.CONFIG;
    let speed = cfg.BASE_SPEED * player.speedMult;
    player.sprinting = input.shift && (input.forward || input.strafe);
    player.ads = input.rightMouse;

    if (player.sprinting) speed *= cfg.SPRINT_MULT;
    if (player.ads) speed *= cfg.ADS_MULT;

    let mx = 0, my = 0;
    const dirX = Math.cos(player.angle), dirY = Math.sin(player.angle);
    const strafeX = Math.cos(player.angle + Math.PI / 2), strafeY = Math.sin(player.angle + Math.PI / 2);

    if (input.w) { mx += dirX; my += dirY; }
    if (input.s) { mx -= dirX; my -= dirY; }
    if (input.d) { mx += strafeX; my += strafeY; }
    if (input.a) { mx -= strafeX; my -= strafeY; }

    const len = Math.hypot(mx, my);
    player.moving = len > 0.001;
    if (player.moving) {
      mx /= len; my /= len;
      tryMove(player, map, mx * speed * dt, my * speed * dt);
    }

    // 시점 회전 (마우스는 main.js에서 델타 적용)
    // 헤드밥
    if (player.moving && !player.ads) {
      player.bobPhase += dt * cfg.BOB_FREQ * (player.sprinting ? 1.3 : 1);
      player.bobAmount = Math.sin(player.bobPhase) * cfg.BOB_AMP;
    } else {
      player.bobPhase = 0;
      player.bobAmount *= Math.max(0, 1 - dt * 6);
    }

    // 반동 복구
    if (player.recoil > 0) {
      player.recoil = Math.max(0, player.recoil - cfg.RECOIL_RECOVER * dt);
    }

    // FOV 보간 (정조준)
    const targetFov = player.ads && player.activeWeaponZoomFov ? player.activeWeaponZoomFov : player.baseFov;
    player.fov += (targetFov - player.fov) * Math.min(1, dt * 10);

    if (player.hurtFlash > 0) player.hurtFlash = Math.max(0, player.hurtFlash - dt * 1.2);
  }

  function damage(player, amount, fromX, fromY) {
    player.hp = Math.max(0, player.hp - amount);
    player.hurtFlash = 1;
    const dx = fromX - player.x, dy = fromY - player.y;
    const d = Math.hypot(dx, dy) || 1;
    player.hurtDirX = dx / d; player.hurtDirY = dy / d;
    GAME.Audio.playerHurt();
    return player.hp <= 0;
  }

  function heal(player, amount) {
    player.hp = Math.min(player.maxHp, player.hp + amount);
  }

  return { create, update, tryMove, collides, damage, heal };
})();
