// 메뉴, HUD, 화면 전환 관리
window.GAME = window.GAME || {};

GAME.UI = (function () {
  let els = {};

  function cacheEls() {
    els = {
      mainMenu: document.getElementById('screen-main'),
      loadout: document.getElementById('screen-loadout'),
      settings: document.getElementById('screen-settings'),
      pause: document.getElementById('screen-pause'),
      gameover: document.getElementById('screen-gameover'),
      hud: document.getElementById('hud'),
      hpBar: document.getElementById('hp-bar-fill'),
      hpText: document.getElementById('hp-text'),
      ammoText: document.getElementById('ammo-text'),
      waveText: document.getElementById('wave-text'),
      scoreText: document.getElementById('score-text'),
      weaponSlots: document.getElementById('weapon-slots'),
      crosshair: document.getElementById('crosshair'),
      minimapCanvas: document.getElementById('minimap-canvas'),
      killfeed: document.getElementById('killfeed'),
      vignette: document.getElementById('vignette'),
      hurtDir: document.getElementById('hurt-dir'),
      centerMsg: document.getElementById('center-msg'),
      preview: document.getElementById('skin-preview-canvas'),
    };
  }

  function showScreen(name) {
    ['mainMenu', 'loadout', 'settings', 'pause', 'gameover', 'hud'].forEach(k => {
      if (els[k]) els[k].classList.add('hidden');
    });
    if (els[name]) els[name].classList.remove('hidden');
  }

  function updateHUD(state) {
    const p = state.player;
    const pct = Math.max(0, p.hp / p.maxHp) * 100;
    els.hpBar.style.width = pct + '%';
    els.hpBar.style.background = pct > 50 ? '#6bd66b' : pct > 25 ? '#e8c94a' : '#e85a4a';
    els.hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;

    const w = state.weapons[state.currentWeaponId];
    if (w) {
      const reserveText = w.reserve === Infinity ? '∞' : Math.floor(w.reserve);
      els.ammoText.textContent = `${w.ammoInMag} / ${reserveText}`;
    }
    els.waveText.textContent = `웨이브 ${state.wave}`;
    els.scoreText.textContent = `점수 ${state.score}`;

    // 무기 슬롯
    els.weaponSlots.innerHTML = '';
    for (const id of GAME.WEAPON_ORDER) {
      const has = !!state.weapons[id];
      const div = document.createElement('div');
      div.className = 'weapon-slot' + (has ? '' : ' locked') + (id === state.currentWeaponId ? ' active' : '');
      div.textContent = GAME.WEAPONS[id].name;
      els.weaponSlots.appendChild(div);
    }

    const skin = GAME.SKINS[p.skinId];
    document.documentElement.style.setProperty('--hud-accent', skin.hud);

    // 크로스헤어
    drawCrosshair(state);

    // 비네트/피격
    els.vignette.style.opacity = p.hurtFlash * 0.7;
    if (p.hurtFlash > 0.05) {
      els.hurtDir.style.opacity = p.hurtFlash;
      const ang = Math.atan2(p.hurtDirY, p.hurtDirX) - p.angle;
      els.hurtDir.style.transform = `translate(-50%,-50%) rotate(${ang}rad)`;
    } else {
      els.hurtDir.style.opacity = 0;
    }

    drawMinimap(state);
  }

  function drawCrosshair(state) {
    const w = state.weapons[state.currentWeaponId];
    if (!w) return;
    let spread = w.def.spread;
    if (state.player.sprinting) spread *= GAME.CONFIG.SPRINT_SPREAD_MULT;
    if (state.player.ads) spread *= GAME.CONFIG.ADS_SPREAD_MULT;
    const gap = 6 + spread * 300;
    els.crosshair.innerHTML = '';
    const skin = GAME.SKINS[state.player.skinId];
    const shapes = [
      { cls: 'ch-top', style: `top:${-gap - 10}px` },
      { cls: 'ch-bottom', style: `top:${gap + 4}px` },
      { cls: 'ch-left', style: `left:${-gap - 10}px` },
      { cls: 'ch-right', style: `left:${gap + 4}px` },
    ];
    for (const s of shapes) {
      const d = document.createElement('div');
      d.className = 'ch-line ' + s.cls;
      d.style.cssText += s.style;
      d.style.background = skin.hud;
      els.crosshair.appendChild(d);
    }
  }

  function drawMinimap(state) {
    const canvas = els.minimapCanvas;
    const ctx = canvas.getContext('2d');
    const map = state.mapDef.tiles;
    const size = map.length;
    const cell = canvas.width / 12; // 플레이어 주변만 표시
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(10,12,16,0.75)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const px = state.player.x, py = state.player.y;
    const range = 6;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-state.player.angle + Math.PI / 2);
    for (let y = Math.floor(py - range); y <= py + range; y++) {
      for (let x = Math.floor(px - range); x <= px + range; x++) {
        if (y < 0 || y >= size || x < 0 || x >= map.length) continue;
        const tile = map[y][x];
        if (tile === 0) continue;
        ctx.fillStyle = '#8a94a6';
        ctx.fillRect((x - px) * cell - cell / 2, (y - py) * cell - cell / 2, cell, cell);
      }
    }
    // 적
    ctx.fillStyle = '#ff5c5c';
    for (const e of state.enemies) {
      if (e.state === 'DEAD') continue;
      if (Math.hypot(e.x - px, e.y - py) > range) continue;
      ctx.beginPath();
      ctx.arc((e.x - px) * cell, (e.y - py) * cell, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 플레이어 (항상 중앙, 위쪽 고정 방향)
    ctx.fillStyle = GAME.SKINS[state.player.skinId].hud;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, canvas.height / 2 - 7);
    ctx.lineTo(canvas.width / 2 - 5, canvas.height / 2 + 5);
    ctx.lineTo(canvas.width / 2 + 5, canvas.height / 2 + 5);
    ctx.closePath();
    ctx.fill();
  }

  function addKillFeed(text) {
    const div = document.createElement('div');
    div.className = 'kill-entry';
    div.textContent = text;
    els.killfeed.appendChild(div);
    setTimeout(() => div.classList.add('fade'), 2500);
    setTimeout(() => div.remove(), 3200);
    while (els.killfeed.children.length > 5) els.killfeed.removeChild(els.killfeed.firstChild);
  }

  function showCenterMsg(text, duration = 2) {
    els.centerMsg.textContent = text;
    els.centerMsg.style.opacity = 1;
    clearTimeout(els.centerMsg._t);
    els.centerMsg._t = setTimeout(() => { els.centerMsg.style.opacity = 0; }, duration * 1000);
  }

  function showGameOver(stats) {
    document.getElementById('go-score').textContent = stats.score;
    document.getElementById('go-wave').textContent = stats.wave;
    document.getElementById('go-kills').textContent = stats.kills;
    const acc = stats.shots > 0 ? Math.round((stats.hits / stats.shots) * 100) : 0;
    document.getElementById('go-accuracy').textContent = acc + '%';
    const best = Math.max(stats.score, GAME.Storage.getHighScore());
    GAME.Storage.setHighScore(best);
    document.getElementById('go-highscore').textContent = best;
    showScreen('gameover');
  }

  return { cacheEls, showScreen, updateHUD, addKillFeed, showCenterMsg, showGameOver, els: () => els };
})();
