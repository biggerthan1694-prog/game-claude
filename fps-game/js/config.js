// 전역 네임스페이스
window.GAME = window.GAME || {};

// ===== 설정값 테이블 (밸런스 조정은 여기만 수정) =====
GAME.CONFIG = {
  // 렌더링
  FOV: 66 * Math.PI / 180,
  RENDER_SCALE: 1.0, // 0.5 / 0.75 / 1.0
  MAX_RENDER_DIST: 20,
  WALL_H_SCALE: 1.0,

  // 플레이어
  PLAYER_RADIUS: 0.25,
  BASE_SPEED: 3.2,          // 타일/초
  SPRINT_MULT: 1.6,
  ADS_MULT: 0.55,
  MOUSE_SENS_DEFAULT: 0.0022,
  BOB_FREQ: 9,
  BOB_AMP: 0.045,

  // 반동/탄퍼짐
  RECOIL_KICK: 0.035,
  RECOIL_RECOVER: 3.5,
  SPRINT_SPREAD_MULT: 1.6,
  ADS_SPREAD_MULT: 0.35,

  // 웨이브
  WAVE_REST_SEC: 3,
  WAVE_BASE_ENEMIES: 4,
  WAVE_ENEMY_GROWTH: 2,
  WAVE_HP_GROWTH: 0.18,

  // 드롭
  DROP_CHANCE: 0.35,
  DROP_HEALTH_AMOUNT: 25,
  DROP_AMMO_AMOUNT: 0.5, // 예비탄창 비율

  // 헤드샷
  HEADSHOT_MULT: 2.0,
  HEADSHOT_SCORE_BONUS: 50,

  // 점수
  SCORE_PER_KILL: 100,
};

// ===== 무기 테이블 =====
GAME.WEAPONS = {
  pistol: {
    id: 'pistol', name: '피스톨', slot: 1,
    damage: 25, fireRate: 4, magSize: 12, reloadTime: 1.2,
    spread: 0.012, range: 20, mode: 'semi', pellets: 1,
    infiniteReserve: true, reserve: Infinity,
    color: '#9aa0a6',
  },
  smg: {
    id: 'smg', name: 'SMG', slot: 2,
    damage: 12, fireRate: 12, magSize: 30, reloadTime: 1.6,
    spread: 0.045, range: 15, mode: 'auto', pellets: 1,
    infiniteReserve: false, reserve: 90,
    color: '#5b8def',
  },
  shotgun: {
    id: 'shotgun', name: '샷건', slot: 3,
    damage: 10, fireRate: 1.2, magSize: 6, reloadTime: 2.4,
    spread: 0.11, range: 8, mode: 'pump', pellets: 8,
    infiniteReserve: false, reserve: 24,
    color: '#e2703a',
  },
  sniper: {
    id: 'sniper', name: '저격총', slot: 4,
    damage: 90, fireRate: 0.9, magSize: 5, reloadTime: 2.0,
    spread: 0.0, range: 40, mode: 'bolt', pellets: 1,
    infiniteReserve: false, reserve: 15,
    color: '#2e8b57', zoomFov: 24 * Math.PI / 180,
  },
};
GAME.WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'sniper'];

// ===== 스킨 테이블 =====
GAME.SKINS = {
  ranger: {
    id: 'ranger', name: '레인저', primary: '#6b6f3a', secondary: '#3f4126',
    hud: '#c8d16a', maxHp: 100, speedMult: 1.0, reloadMult: 1.0, visionReduce: 0,
  },
  scout: {
    id: 'scout', name: '스카우트', primary: '#28c7d6', secondary: '#eef7f8',
    hud: '#5be6f2', maxHp: 80, speedMult: 1.25, reloadMult: 1.1, visionReduce: 0,
  },
  guardian: {
    id: 'guardian', name: '가디언', primary: '#3a5a8c', secondary: '#d8b34a',
    hud: '#ffd166', maxHp: 150, speedMult: 0.85, reloadMult: 0.9, visionReduce: 0,
  },
  phantom: {
    id: 'phantom', name: '팬텀', primary: '#5a2d82', secondary: '#12121a',
    hud: '#b388ff', maxHp: 90, speedMult: 1.1, reloadMult: 1.0, visionReduce: 0.30,
  },
};
GAME.SKIN_ORDER = ['ranger', 'scout', 'guardian', 'phantom'];

// ===== 적 테이블 =====
GAME.ENEMY_TYPES = {
  rusher: {
    id: 'rusher', hp: 40, speed: 2.6, damage: 10, attackRange: 0.9,
    attackCooldown: 0.8, sightRange: 9, color: '#ff5c5c', size: 0.35,
    scoreValue: 100, kind: 'melee',
  },
  shooter: {
    id: 'shooter', hp: 35, speed: 1.3, damage: 8, attackRange: 8,
    attackCooldown: 1.6, sightRange: 11, color: '#ffd166', size: 0.35,
    scoreValue: 150, kind: 'ranged', projectileSpeed: 6,
  },
  tanker: {
    id: 'tanker', hp: 110, speed: 1.0, damage: 18, attackRange: 1.1,
    attackCooldown: 1.2, sightRange: 8, color: '#7d7dff', size: 0.45,
    scoreValue: 200, kind: 'melee',
  },
};

// ===== 맵 데이터 (0=바닥, 1~4=벽 종류) =====
function genBorderMap(size, fillFn) {
  const m = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) row.push(1);
      else row.push(fillFn(x, y));
    }
    m.push(row);
  }
  return m;
}

GAME.MAPS = {
  arena: {
    id: 'arena', name: '아레나',
    tiles: genBorderMap(24, (x, y) => {
      if ((x % 6 === 0 && y % 6 === 0)) return 0;
      if (x > 3 && x < 20 && y > 3 && y < 20 && (x % 5 === 0) && (y % 7 === 0)) return 2;
      if (x === 12 && y > 2 && y < 21 && y % 4 !== 0) return 3;
      return 0;
    }),
    spawn: { x: 2.5, y: 2.5, angle: 0 },
  },
  bunker: {
    id: 'bunker', name: '벙커',
    tiles: genBorderMap(24, (x, y) => {
      if (x % 4 === 0 && y % 4 === 0 && x > 2 && x < 21 && y > 2 && y < 21) return 4;
      if ((x === 8 || x === 16) && y > 4 && y < 19 && y % 3 !== 0) return 3;
      if (y === 12 && x > 4 && x < 19 && x % 6 !== 0) return 2;
      return 0;
    }),
    spawn: { x: 21.5, y: 21.5, angle: Math.PI },
  },
};
GAME.MAP_ORDER = ['arena', 'bunker'];
