// Web Audio API를 이용한 절차적 효과음 생성
window.GAME = window.GAME || {};

GAME.Audio = (function () {
  let ctx = null;
  let masterGain = null;
  let volume = 0.6;

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function setVolume(v) {
    volume = v;
    if (masterGain) masterGain.gain.value = v;
  }

  // 화이트 노이즈 버퍼 생성 (총소리/피격음용)
  function noiseBuffer(duration) {
    const c = ensureCtx();
    const size = Math.floor(c.sampleRate * duration);
    const buf = c.createBuffer(1, size, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function playNoise({ duration = 0.15, filterFreq = 1200, filterType = 'lowpass', gainStart = 0.6, gainEnd = 0.001 }) {
    const c = ensureCtx();
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(duration);
    const filter = c.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.setValueAtTime(gainStart, c.currentTime);
    g.gain.exponentialRampToValueAtTime(gainEnd, c.currentTime + duration);
    src.connect(filter).connect(g).connect(masterGain);
    src.start();
    src.stop(c.currentTime + duration);
  }

  function playTone({ freq = 440, type = 'sine', duration = 0.1, gainStart = 0.4, gainEnd = 0.001, freqEnd = null }) {
    const c = ensureCtx();
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), c.currentTime + duration);
    const g = c.createGain();
    g.gain.setValueAtTime(gainStart, c.currentTime);
    g.gain.exponentialRampToValueAtTime(gainEnd, c.currentTime + duration);
    osc.connect(g).connect(masterGain);
    osc.start();
    osc.stop(c.currentTime + duration);
  }

  // 무기별 발사음
  function shoot(weaponId) {
    ensureCtx();
    switch (weaponId) {
      case 'pistol':
        playNoise({ duration: 0.09, filterFreq: 2200, gainStart: 0.5 });
        playTone({ freq: 220, type: 'square', duration: 0.06, gainStart: 0.3, freqEnd: 80 });
        break;
      case 'smg':
        playNoise({ duration: 0.06, filterFreq: 2600, gainStart: 0.4 });
        playTone({ freq: 300, type: 'square', duration: 0.045, gainStart: 0.25, freqEnd: 100 });
        break;
      case 'shotgun':
        playNoise({ duration: 0.22, filterFreq: 900, gainStart: 0.7 });
        playTone({ freq: 120, type: 'sawtooth', duration: 0.18, gainStart: 0.4, freqEnd: 40 });
        break;
      case 'sniper':
        playNoise({ duration: 0.28, filterFreq: 1600, gainStart: 0.65 });
        playTone({ freq: 90, type: 'sawtooth', duration: 0.3, gainStart: 0.5, freqEnd: 30 });
        break;
      default:
        playNoise({ duration: 0.1 });
    }
  }

  function reload() {
    ensureCtx();
    playTone({ freq: 700, type: 'square', duration: 0.05, gainStart: 0.15 });
    setTimeout(() => playTone({ freq: 500, type: 'square', duration: 0.05, gainStart: 0.15 }), 200);
  }

  function hit() {
    ensureCtx();
    playNoise({ duration: 0.08, filterFreq: 1800, gainStart: 0.35 });
    playTone({ freq: 180, type: 'triangle', duration: 0.08, gainStart: 0.25, freqEnd: 60 });
  }

  function playerHurt() {
    ensureCtx();
    playNoise({ duration: 0.15, filterFreq: 700, gainStart: 0.4 });
  }

  function kill() {
    ensureCtx();
    playTone({ freq: 440, type: 'triangle', duration: 0.1, gainStart: 0.3, freqEnd: 660 });
    setTimeout(() => playTone({ freq: 660, type: 'triangle', duration: 0.14, gainStart: 0.25, freqEnd: 880 }), 90);
  }

  function empty() {
    ensureCtx();
    playTone({ freq: 300, type: 'square', duration: 0.05, gainStart: 0.15, freqEnd: 250 });
  }

  function pickup() {
    ensureCtx();
    playTone({ freq: 500, type: 'sine', duration: 0.1, gainStart: 0.25, freqEnd: 800 });
  }

  function uiClick() {
    ensureCtx();
    playTone({ freq: 350, type: 'sine', duration: 0.05, gainStart: 0.2, freqEnd: 500 });
  }

  return { ensureCtx, setVolume, shoot, reload, hit, playerHurt, kill, empty, pickup, uiClick };
})();
