// 게임 루프 및 전체 상태 관리
window.GAME = window.GAME || {};

// ===== localStorage 저장 =====
GAME.Storage = (function () {
  const KEY_SETTINGS = 'fps_game_settings_v1';
  const KEY_HIGH = 'fps_game_highscore_v1';
  function getSettings() {
    try {
      const raw = localStorage.getItem(KEY_SETTINGS);
      if (raw) return Object.assign(defaultSettings(), JSON.parse(raw));
    } catch (e) {}
    return defaultSettings();
  }
  function defaultSettings() {
    return { sensitivity: GAME.CONFIG.MOUSE_SENS_DEFAULT, volume: 0.6, fov: 66, renderScale: 1.0 };
  }
  function setSettings(s) {
    try { localStorage.setItem(KEY_SETTINGS, JSON.stringify(s)); } catch (e) {}
  }
  function getHighScore() {
    try { return parseInt(localStorage.getItem(KEY_HIGH) || '0', 10); } catch (e) { return 0; }
  }
  function setHighScore(v) {
    try { localStorage.setItem(KEY_HIGH, String(v)); } catch (e) {}
  }
  return { getSettings, setSettings, getHighScore, setHighScore, defaultSettings };
})();

(function () {
  const CONFIG = GAME.CONFIG;
  let state = null;
  let canvas, lastTime = 0;
  let input = { w: false, a: false, s: false, d: false, shift: false, rightMouse: false, leftMouse: false, mouseDX: 0, mouseDY: 0 };
  let selection = { skinId: 'ranger', weapons: ['pistol', 'smg'], mapId: 'arena' };
  let settings = GAME.Storage.getSettings();
  let projectiles = []; // 적 투사체 풀
  let pickups = [];
  let previewAngle = 0;

  function init() {
    canvas = document.getElementById('game-canvas');
    GAME.Raycaster.init(canvas);
    GAME.UI.cacheEls();
    applySettingsToUI();
    bindMenuEvents();
    bindGameInput();
    window.addEventListener('resize', () => GAME.Raycaster.resize());
    GAME.UI.showScreen('mainMenu');
    document.getElementById('main-highscore').textContent = GAME.Storage.getHighScore();
    requestAnimationFrame(loop);
    startPreviewLoop();
  }

  // ===== 메뉴 이벤트 =====
  function bindMenuEvents() {
    document.getElementById('btn-start').onclick = () => { GAME.Audio.uiClick(); GAME.UI.showScreen('loadout'); renderLoadoutUI(); };
    document.getElementById('btn-settings').onclick = () => { GAME.Audio.uiClick(); GAME.UI.showScreen('settings'); };
    document.getElementById('btn-settings-back').onclick = () => { GAME.Audio.uiClick(); GAME.UI.showScreen('mainMenu'); };
    document.getElementById('btn-loadout-back').onclick = () => { GAME.Audio.uiClick(); GAME.UI.showScreen('mainMenu'); };
    document.getElementById('btn-loadout-start').onclick = () => { GAME.Audio.uiClick(); startGame(); };

    document.getElementById('btn-resume').onclick = () => { resumeGame(); };
    document.getElementById('btn-pause-loadout').onclick = () => { GAME.UI.showScreen('mainMenu'); document.exitPointerLock(); };

    document.getElementById('btn-retry').onclick = () => { GAME.UI.showScreen('loadout'); renderLoadoutUI(); };
    document.getElementById('btn-go-loadout').onclick = () => { GAME.UI.showScreen('loadout'); renderLoadoutUI(); };

    // 설정
    const sens = document.getElementById('opt-sensitivity');
    sens.oninput = () => { settings.sensitivity = parseFloat(sens.value); persist(); };
    const vol = document.getElementById('opt-volume');
    vol.oninput = () => { settings.volume = parseFloat(vol.value); GAME.Audio.setVolume(settings.volume); persist(); };
    const fov = document.getElementById('opt-fov');
    fov.oninput = () => { settings.fov = parseInt(fov.value, 10); persist(); };
    const res = document.getElementById('opt-resolution');
    res.onchange = () => { settings.renderScale = parseFloat(res.value); persist(); GAME.Raycaster.resize(); };
  }

  function persist() { GAME.Storage.setSettings(settings); }

  function applySettingsToUI() {
    document.getElementById('opt-sensitivity').value = settings.sensitivity;
    document.getElementById('opt-volume').value = settings.volume;
    document.getElementById('opt-fov').value = settings.fov;
    document.getElementById('opt-resolution').value = settings.renderScale;
    GAME.Audio.setVolume(settings.volume);
  }

  function renderLoadoutUI() {
    const skinList = document.getElementById('skin-list');
    skinList.innerHTML = '';
    for (const id of GAME.SKIN_ORDER) {
      const skin = GAME.SKINS[id];
      const div = document.createElement('div');
      div.className = 'option-card' + (selection.skinId === id ? ' selected' : '');
      div.innerHTML = `<div class="swatch" style="background:${skin.primary}"></div><div>${skin.name}</div><div class="sub">HP ${skin.maxHp} · 속도 ${Math.round(skin.speedMult * 100)}%</div>`;
      div.onclick = () => { selection.skinId = id; GAME.Audio.uiClick(); renderLoadoutUI(); };
      skinList.appendChild(div);
    }

    const weaponList = document.getElementById('weapon-list');
    weaponList.innerHTML = '';
    for (const id of GAME.WEAPON_ORDER) {
      const w = GAME.WEAPONS[id];
      const selected = selection.weapons.includes(id);
      const div = document.createElement('div');
      div.className = 'option-card' + (selected ? ' selected' : '');
      div.innerHTML = `<div class="sub-title">${w.name}</div><div class="sub">데미지 ${w.damage} · 연사 ${w.fireRate}/s</div>`;
      div.onclick = () => {
        GAME.Audio.uiClick();
        if (selected) {
          if (selection.weapons.length > 1) selection.weapons = selection.weapons.filter(w2 => w2 !== id);
        } else {
          if (selection.weapons.length < 2) selection.weapons.push(id);
          else selection.weapons = [selection.weapons[1], id];
        }
        renderLoadoutUI();
      };
      weaponList.appendChild(div);
    }

    const mapList = document.getElementById('map-list');
    mapList.innerHTML = '';
    for (const id of GAME.MAP_ORDER) {
      const m = GAME.MAPS[id];
      const div = document.createElement('div');
      div.className = 'option-card' + (selection.mapId === id ? ' selected' : '');
      div.innerHTML = `<div class="sub-title">${m.name}</div>`;
      div.onclick = () => { selection.mapId = id; GAME.Audio.uiClick(); renderLoadoutUI(); };
      mapList.appendChild(div);
    }
  }

  // ===== 스킨 미리보기 (로비 회전 패널) =====
  function startPreviewLoop() {
    function tick() {
      previewAngle += 0.015;
      const canvas = document.getElementById('skin-preview-canvas');
      if (canvas && !document.getElementById('screen-loadout').classList.contains('hidden')) {
        drawSkinPreview(canvas);
      }
      requestAnimationFrame(tick);
    }
    tick();
  }

  function drawSkinPreview(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const skin = GAME.SKINS[selection.skinId];
    ctx.save();
    ctx.translate(W / 2, H / 2 + 40);
    const wobble = Math.sin(previewAngle) * 20;
    ctx.translate(wobble, 0);
    ctx.fillStyle = skin.primary;
    ctx.fillRect(-50, -40, 100, 90); // 몸통
    ctx.fillStyle = skin.secondary;
    ctx.fillRect(-30, -80, 60, 50); // 헬멧/머리
    ctx.fillStyle = '#d9a066';
    ctx.fillRect(-45, -20, 22, 60); ctx.fillRect(23, -20, 22, 60); // 팔
    const weaponId = selection.weapons[0] || 'pistol';
    const w = GAME.WEAPONS[weaponId];
    ctx.fillStyle = w.color;
    ctx.fillRect(20, -10, 60, 16);
    ctx.restore();
  }

  // ===== 게임 시작 =====
  function startGame() {
    const mapDef = GAME.MAPS[selection.mapId];
    const player = GAME.Player.create(selection.skinId, mapDef);
    const weapons = GAME.Weapons.createLoadout(selection.weapons);
    state = {
      player, mapDef,
      weapons,
      currentWeaponId: selection.weapons[0],
      enemies: [],
      wave: 0,
      waveTimer: 0,
      waveResting: true,
      restTimer: 1.5,
      score: 0,
      running: true,
      paused: false,
    };
    updateActiveWeaponFov();
    projectiles = [];
    pickups = [];
    GAME.UI.showScreen('hud');
    canvas.requestPointerLock();
    GAME.UI.showCenterMsg('웨이브 1 준비!', 2);
    startNextWave();
  }

  function updateActiveWeaponFov() {
    const w = GAME.WEAPONS[state.currentWeaponId];
    state.player.activeWeaponZoomFov = w.zoomFov || (CONFIG.FOV * 0.6);
    state.player.baseFov = settings.fov * Math.PI / 180;
  }

  function startNextWave() {
    state.wave++;
    state.waveResting = false;
    const count = CONFIG.WAVE_BASE_ENEMIES + (state.wave - 1) * CONFIG.WAVE_ENEMY_GROWTH;
    const waveMult = (state.wave - 1) * CONFIG.WAVE_HP_GROWTH;
    const types = ['rusher', 'shooter', 'tanker'];
    const map = state.mapDef.tiles;
    for (let i = 0; i < count; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const pos = findOpenTile(map, state.player);
      state.enemies.push(GAME.Enemy.spawn(type, pos.x, pos.y, waveMult));
    }
  }

  function findOpenTile(map, player) {
    for (let tries = 0; tries < 200; tries++) {
      const x = 1 + Math.random() * (map[0].length - 2);
      const y = 1 + Math.random() * (map.length - 2);
      if (GAME.Raycaster.isWall(map, x, y) === 0 && Math.hypot(x - player.x, y - player.y) > 4) {
        return { x, y };
      }
    }
    return { x: player.x + 3, y: player.y };
  }

  // ===== 입력 =====
  function bindGameInput() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w') input.w = true;
      if (k === 'a') input.a = true;
      if (k === 's') input.s = true;
      if (k === 'd') input.d = true;
      if (k === 'shift') input.shift = true;
      if (k === 'r') doReload();
      if (k === 'escape') togglePause();
      if (['1', '2', '3', '4'].includes(k)) switchWeaponBySlot(parseInt(k, 10));
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w') input.w = false;
      if (k === 'a') input.a = false;
      if (k === 's') input.s = false;
      if (k === 'd') input.d = false;
      if (k === 'shift') input.shift = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
      if (e.button === 0) input.leftMouse = true;
      if (e.button === 2) input.rightMouse = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) input.leftMouse = false;
      if (e.button === 2) input.rightMouse = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      if (!state || !state.running || state.paused) return;
      const ids = Object.keys(state.weapons);
      let idx = ids.indexOf(state.currentWeaponId);
      idx = (idx + (e.deltaY > 0 ? 1 : -1) + ids.length) % ids.length;
      state.currentWeaponId = ids[idx];
      updateActiveWeaponFov();
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas || !state || state.paused) return;
      input.mouseDX += e.movementX;
      input.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas && state && state.running && !state.paused) {
        pauseGame();
      }
    });
  }

  function switchWeaponBySlot(slot) {
    for (const id of GAME.WEAPON_ORDER) {
      if (GAME.WEAPONS[id].slot === slot && state.weapons[id]) {
        state.currentWeaponId = id;
        updateActiveWeaponFov();
        return;
      }
    }
  }

  function doReload() {
    if (!state || state.paused) return;
    const w = state.weapons[state.currentWeaponId];
    if (w) GAME.Weapons.startReload(w, state.player);
  }

  function togglePause() {
    if (!state || !state.running) return;
    if (state.paused) resumeGame(); else pauseGame();
  }
  function pauseGame() {
    state.paused = true;
    GAME.UI.showScreen('pause');
    document.exitPointerLock();
  }
  function resumeGame() {
    state.paused = false;
    GAME.UI.showScreen('hud');
    canvas.requestPointerLock();
  }

  // ===== 게임 루프 =====
  function loop(t) {
    const dt = Math.min(0.05, (t - lastTime) / 1000 || 0);
    lastTime = t;
    if (state && state.running && !state.paused) {
      update(dt);
      render();
    }
    requestAnimationFrame(loop);
  }

  function update(dt) {
    const player = state.player;
    const map = state.mapDef.tiles;

    // 마우스 시점 회전
    player.angle += input.mouseDX * settings.sensitivity;
    player.pitch = Math.max(-1, Math.min(1, player.pitch - input.mouseDY * settings.sensitivity * 0.5));
    input.mouseDX = 0; input.mouseDY = 0;

    GAME.Player.update(player, input, map, dt);

    const w = state.weapons[state.currentWeaponId];
    if (w) {
      GAME.Weapons.update(w, dt, player);
      const wantFire = w.def.mode === 'auto' ? input.leftMouse : (input.leftMouse && !w._firedOnce);
      if (input.leftMouse && GAME.Weapons.canFire(w)) {
        GAME.Weapons.fire(w, player, map, state.enemies, onEnemyHit, onWallHit);
        if (w.def.mode !== 'auto') w._firedOnce = true;
      }
      if (!input.leftMouse) w._firedOnce = false;
    }

    // 적 업데이트
    for (const e of state.enemies) {
      GAME.Enemy.update(e, player, map, dt, {
        onMeleeAttack: (enemy) => {
          const dead = GAME.Player.damage(player, enemy.def.damage, enemy.x, enemy.y);
          if (dead) onPlayerDeath();
        },
        onRangedAttack: (enemy) => {
          projectiles.push({
            x: enemy.x, y: enemy.y,
            dx: (player.x - enemy.x), dy: (player.y - enemy.y),
            speed: enemy.def.projectileSpeed, damage: enemy.def.damage, life: 3,
          });
        },
      });
    }

    // 투사체 업데이트
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      const d = Math.hypot(p.dx, p.dy) || 1;
      const nx = p.dx / d, ny = p.dy / d;
      p.x += nx * p.speed * dt; p.y += ny * p.speed * dt;
      p.life -= dt;
      const distToPlayer = Math.hypot(p.x - player.x, p.y - player.y);
      if (distToPlayer < 0.3) {
        const dead = GAME.Player.damage(player, p.damage, p.x, p.y);
        if (dead) onPlayerDeath();
        projectiles.splice(i, 1);
        continue;
      }
      if (GAME.Raycaster.isWall(map, p.x, p.y) > 0 || p.life <= 0) {
        projectiles.splice(i, 1);
      }
    }

    // 픽업 처리
    for (let i = pickups.length - 1; i >= 0; i--) {
      const pk = pickups[i];
      if (Math.hypot(pk.x - player.x, pk.y - player.y) < 0.4) {
        if (pk.type === 'health') GAME.Player.heal(player, CONFIG.DROP_HEALTH_AMOUNT);
        else {
          const w2 = state.weapons[pk.weaponId];
          if (w2 && w2.reserve !== Infinity) w2.reserve += Math.ceil(GAME.WEAPONS[pk.weaponId].magSize * CONFIG.DROP_AMMO_AMOUNT);
        }
        GAME.Audio.pickup();
        pickups.splice(i, 1);
      }
    }

    // 웨이브 종료 체크
    if (!state.waveResting) {
      const aliveOrDying = state.enemies.some(e => e.state !== 'DEAD' || e.alpha > 0);
      if (!aliveOrDying && state.enemies.length > 0) {
        state.enemies = [];
        state.waveResting = true;
        state.restTimer = CONFIG.WAVE_REST_SEC;
        GAME.UI.showCenterMsg(`웨이브 ${state.wave} 클리어!`, 2);
      }
    } else {
      state.restTimer -= dt;
      if (state.restTimer <= 0) {
        GAME.UI.showCenterMsg(`웨이브 ${state.wave + 1} 시작!`, 2);
        startNextWave();
      }
    }

    GAME.UI.updateHUD(state);
  }

  function onEnemyHit(enemy, damage, isHeadshot) {
    const killed = GAME.Enemy.damage(enemy, damage, isHeadshot);
    if (killed) {
      state.player.kills++;
      state.score += enemy.def.scoreValue;
      if (isHeadshot) state.score += CONFIG.HEADSHOT_SCORE_BONUS;
      GAME.UI.addKillFeed(`${isHeadshot ? '헤드샷! ' : ''}${enemyName(enemy.typeId)} 처치 +${enemy.def.scoreValue}`);
      if (Math.random() < CONFIG.DROP_CHANCE) spawnDrop(enemy);
    }
  }

  function enemyName(id) {
    return { rusher: '러셔', shooter: '슈터', tanker: '탱커' }[id] || id;
  }

  function spawnDrop(enemy) {
    const isHealth = Math.random() < 0.5;
    if (isHealth) pickups.push({ x: enemy.x, y: enemy.y, type: 'health' });
    else {
      const ids = Object.keys(state.weapons);
      const id = ids[Math.floor(Math.random() * ids.length)];
      pickups.push({ x: enemy.x, y: enemy.y, type: 'ammo', weaponId: id });
    }
  }

  function onWallHit(x, y) {
    // 벽 타격 이펙트 자리 (파티클 생략, 사운드는 발사음에 포함)
  }

  function onPlayerDeath() {
    state.running = false;
    document.exitPointerLock();
    GAME.UI.showGameOver({
      score: state.score, wave: state.wave, kills: state.player.kills,
      shots: state.player.shots, hits: state.player.hits,
    });
  }

  function render() {
    GAME.Raycaster.render(state.player, state.mapDef.tiles);
    const sprites = [];
    for (const e of state.enemies) sprites.push(GAME.Enemy.getSpriteData(e));
    for (const p of pickups) sprites.push(pickupSprite(p));
    for (const pr of projectiles) sprites.push(projectileSprite(pr));
    GAME.Raycaster.renderSprites(state.player, sprites);
    const { W, H } = GAME.Raycaster.getSize();
    const bctx = GAME.Raycaster.getBufCtx();
    const w = state.weapons[state.currentWeaponId];
    if (w) GAME.Weapons.renderViewmodel(w, state.player, bctx, W, H, state.player.skinId);
    GAME.Raycaster.present();
  }

  const pickupCanvasCache = {};
  function pickupSprite(p) {
    const key = p.type + (p.weaponId || '');
    if (!pickupCanvasCache[key]) {
      const c = document.createElement('canvas'); c.width = 32; c.height = 32;
      const ctx = c.getContext('2d');
      ctx.fillStyle = p.type === 'health' ? '#5be05b' : '#e0c85b';
      ctx.fillRect(4, 4, 24, 24);
      ctx.fillStyle = '#fff';
      ctx.fillText(p.type === 'health' ? '+' : 'A', 12, 20);
      pickupCanvasCache[key] = c;
    }
    return { x: p.x, y: p.y, canvas: pickupCanvasCache[key], scale: 0.5, alpha: 1 };
  }

  const projCanvas = (() => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ff8c00';
    ctx.beginPath(); ctx.arc(8, 8, 6, 0, Math.PI * 2); ctx.fill();
    return c;
  })();
  function projectileSprite(p) {
    return { x: p.x, y: p.y, canvas: projCanvas, scale: 0.25, alpha: 1 };
  }

  window.addEventListener('DOMContentLoaded', init);
})();
