// 적 상태머신 + AI + 스프라이트 생성
window.GAME = window.GAME || {};

GAME.Enemy = (function () {
  const spriteCache = {};

  // 절차적 적 스프라이트 (로봇/드론 느낌, 만화적)
  function buildSprite(typeId, color) {
    const key = typeId + color;
    if (spriteCache[key]) return spriteCache[key];
    const size = 128;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.translate(size / 2, size / 2);

    if (typeId === 'rusher') {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(0, 10, 26, 34, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.ellipse(0, -22, 20, 18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffdd55';
      ctx.beginPath(); ctx.arc(-7, -24, 4, 0, Math.PI * 2); ctx.arc(7, -24, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(-38, -4, 12, 30); ctx.fillRect(26, -4, 12, 30);
    } else if (typeId === 'shooter') {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.arc(0, -6, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#66ffee';
      ctx.beginPath(); ctx.arc(0, -6, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(-40, -30, 10, 50); ctx.fillRect(30, -30, 10, 50);
    } else { // tanker
      ctx.fillStyle = color;
      ctx.fillRect(-34, -30, 68, 66);
      ctx.fillStyle = '#222';
      ctx.fillRect(-22, -46, 44, 26);
      ctx.fillStyle = '#ff5555';
      ctx.fillRect(-16, -40, 10, 8); ctx.fillRect(6, -40, 10, 8);
      ctx.fillStyle = color;
      ctx.fillRect(-46, -20, 14, 50); ctx.fillRect(32, -20, 14, 50);
    }
    spriteCache[key] = c;
    return c;
  }

  function spawn(typeId, x, y, waveMult) {
    const def0 = GAME.ENEMY_TYPES[typeId];
    const hp = Math.round(def0.hp * (1 + waveMult));
    return {
      id: Math.random().toString(36).slice(2),
      typeId, def: def0,
      x, y, hp, maxHp: hp,
      state: 'IDLE',
      attackTimer: 0,
      flash: 0,
      deathTimer: 0,
      alpha: 1,
      canvasBase: buildSprite(typeId, def0.color),
      lastKnownPX: 0, lastKnownPY: 0,
    };
  }

  // 시야 확인 (레이캐스트로 벽 가림 검사)
  function canSeePlayer(e, player, map) {
    const dx = player.x - e.x, dy = player.y - e.y;
    const dist = Math.hypot(dx, dy);
    let sight = e.def.sightRange;
    if (player.visionReduce) sight *= (1 - player.visionReduce);
    if (dist > sight) return false;
    const steps = Math.ceil(dist / 0.1);
    const stepX = dx / steps, stepY = dy / steps;
    let x = e.x, y = e.y;
    for (let i = 0; i < steps; i++) {
      x += stepX; y += stepY;
      if (GAME.Raycaster.isWall(map, x, y) > 0) return false;
    }
    return true;
  }

  function update(e, player, map, dt, callbacks) {
    if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 4);

    if (e.state === 'DEAD') {
      e.deathTimer += dt;
      if (e.deathTimer < 0.4) {
        // 쓰러지는 애니메이션 단계
      } else {
        e.alpha = Math.max(0, 1 - (e.deathTimer - 0.4) / 0.6);
      }
      return;
    }

    const dx = player.x - e.x, dy = player.y - e.y;
    const dist = Math.hypot(dx, dy);
    const canSee = canSeePlayer(e, player, map);

    if (canSee) { e.lastKnownPX = player.x; e.lastKnownPY = player.y; }

    switch (e.state) {
      case 'IDLE':
        if (canSee) e.state = 'CHASE';
        break;
      case 'CHASE': {
        if (dist <= e.def.attackRange && canSee) {
          e.state = 'ATTACK';
          break;
        }
        const tx = canSee ? player.x : e.lastKnownPX;
        const ty = canSee ? player.y : e.lastKnownPY;
        const mdx = tx - e.x, mdy = ty - e.y;
        const mdist = Math.hypot(mdx, mdy);
        if (mdist > 0.1) {
          const nx = mdx / mdist, ny = mdy / mdist;
          const r = e.def.size;
          const moveX = nx * e.def.speed * dt, moveY = ny * e.def.speed * dt;
          if (!collidesEnemy(map, e.x + moveX, e.y, r)) e.x += moveX;
          if (!collidesEnemy(map, e.x, e.y + moveY, r)) e.y += moveY;
        } else if (!canSee) {
          e.state = 'IDLE';
        }
        break;
      }
      case 'ATTACK': {
        if (dist > e.def.attackRange * 1.3 || !canSee) { e.state = 'CHASE'; break; }
        e.attackTimer -= dt;
        if (e.attackTimer <= 0) {
          e.attackTimer = e.def.attackCooldown;
          if (e.def.kind === 'melee') {
            callbacks.onMeleeAttack(e);
          } else {
            callbacks.onRangedAttack(e);
          }
        }
        break;
      }
    }
  }

  function collidesEnemy(map, x, y, r) {
    const checks = [[x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r]];
    for (const [cx, cy] of checks) if (GAME.Raycaster.isWall(map, cx, cy) > 0) return true;
    return false;
  }

  function damage(e, amount, isHeadshot) {
    e.hp -= amount;
    e.flash = 1;
    GAME.Audio.hit();
    if (e.hp <= 0 && e.state !== 'DEAD') {
      e.state = 'DEAD';
      e.deathTimer = 0;
      GAME.Audio.kill();
      return true; // killed
    }
    return false;
  }

  function getSpriteData(e) {
    return {
      x: e.x, y: e.y,
      canvas: e.canvasBase,
      scale: e.def.size * 2,
      alpha: e.alpha,
      tint: e.flash > 0 ? '#ffffff' : null,
      tintAlpha: e.flash,
      vOffset: e.state === 'DEAD' ? -0.3 + Math.min(e.deathTimer, 0.4) * 0.6 : 0,
    };
  }

  return { spawn, update, damage, getSpriteData, canSeePlayer };
})();
