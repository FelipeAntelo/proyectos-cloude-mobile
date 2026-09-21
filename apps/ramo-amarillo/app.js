'use strict';

/* ============================================================
   CONFIG — todo lo editable vive acá.
   Cambiar textos, mensajes de cada flor o la música es solo
   tocar este bloque. Los colores están en styles.css (:root).
   ============================================================ */
const CONFIG = {
  storagePrefix: 'pwa-lab:ramo-amarillo:',
  musicSrc: './assets/musica.mp3',
  musicVolume: 0.35, // volumen de fondo, sugerido 30–40%
  musicFadeMs: 1000, // fade-in suave solo al arrancar la música

  // Cuánto queda visible el 4º mensaje antes de avanzar al cierre.
  // La duración de esa transición en sí vive en styles.css (.final-transition).
  finalMessageHoldMs: 5000,

  texts: {
    introTitle: 'Tengo un detallito para vos, mi amorcito.',
    introSub: 'Es algo sencillo, pero hecho con cariño para vos.',
    openButton: 'Abrilo',
    bouquetHint: 'Tocá las flores.',
    finalTitle: 'Solo quería recordarte que te amo mucho, mi amorcito.',
    finalSub: 'Con cariño, para vos ♡',
    replayButton: 'Ver otra vez',
    musicOn: 'Poner musiquita',
    musicOff: 'Quitar musiquita',
  },

  // Un mensaje por flor interactiva, en orden (flor 1, 2, 3, 4).
  flowerMessages: [
    'Solo quería darte un detallito, mi mujercita.',
    'Me gusta mucho tenerte en mi vida, mi amorcito.',
    'Vos hacés bonitos hasta los días simples.',
    'Te hice esto con mucho cariño, solo para vos.',
  ],
};

/* ============================================================
   Estado + almacenamiento (namespaceado, con defaults seguros)
   ============================================================ */
function readDiscovered() {
  try {
    const raw = localStorage.getItem(CONFIG.storagePrefix + 'discovered');
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (_err) {
    return new Set();
  }
}

function writeDiscovered(set) {
  try {
    localStorage.setItem(CONFIG.storagePrefix + 'discovered', JSON.stringify([...set]));
  } catch (_err) {
    /* almacenamiento no disponible: seguimos sin persistir */
  }
}

const state = {
  discovered: readDiscovered(),
};

/* ============================================================
   Navegación entre pantallas
   ============================================================ */
const appEl = document.querySelector('.app');
const screens = {
  intro: document.getElementById('screen-intro'),
  bouquet: document.getElementById('screen-bouquet'),
  final: document.getElementById('screen-final'),
};

function showScreen(name) {
  for (const key of Object.keys(screens)) {
    const el = screens[key];
    const active = key === name;
    el.classList.toggle('is-active', active);
    el.setAttribute('aria-hidden', active ? 'false' : 'true');
  }
}

/* ============================================================
   Transición (lenta y deliberada) hacia la pantalla de cierre.
   Se agenda con un timer rastreado para poder cancelarlo sin
   dejar un setTimeout viejo que dispare después de un reinicio.
   ============================================================ */
let finalTransitionTimer = null;

function clearFinalTransitionTimer() {
  if (finalTransitionTimer !== null) {
    window.clearTimeout(finalTransitionTimer);
    finalTransitionTimer = null;
  }
}

function scheduleFinalTransition(delayMs) {
  clearFinalTransitionTimer();
  finalTransitionTimer = window.setTimeout(() => {
    finalTransitionTimer = null;
    appEl.classList.add('final-transition');
    goToFinal();
  }, delayMs);
}

/* ============================================================
   Pantalla 2 — ramo interactivo
   ============================================================ */
const bouquetHint = document.getElementById('bouquet-hint');
const messagePanel = document.getElementById('message-text');
const progressEl = document.getElementById('progress-count');
const tulipButtons = Array.from(document.querySelectorAll('.tulip'));
const totalFlowers = CONFIG.flowerMessages.length;

function updateProgress() {
  progressEl.textContent = `${state.discovered.size} de ${totalFlowers}`;
}

function applyDiscoveredState() {
  tulipButtons.forEach((btn) => {
    const id = btn.dataset.flower;
    const isDiscovered = state.discovered.has(id);
    btn.classList.toggle('is-discovered', isDiscovered);
    btn.setAttribute('aria-pressed', isDiscovered ? 'true' : 'false');
  });
  updateProgress();
}

function showMessage(index) {
  const text = CONFIG.flowerMessages[index];
  if (!text) return;
  messagePanel.classList.remove('is-visible');
  // pequeño respiro antes de revelar, para que se sienta como una aparición y no un salto
  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      messagePanel.textContent = text;
      messagePanel.classList.add('is-visible');
    }, 80);
  });
}

function handleTulipTap(btn) {
  const id = btn.dataset.flower;
  const index = Number(id) - 1;
  if (bouquetHint) bouquetHint.classList.add('is-hidden');

  const wasDiscovered = state.discovered.has(id);
  if (!wasDiscovered) {
    state.discovered.add(id);
    writeDiscovered(state.discovered);
    applyDiscoveredState();
  }

  showMessage(index);

  // pequeña reacción visual al tocar, incluso si ya estaba descubierta
  btn.classList.remove('is-touched');
  void btn.offsetWidth; // reinicia la animación
  btn.classList.add('is-touched');

  if (!wasDiscovered && state.discovered.size === totalFlowers) {
    scheduleFinalTransition(CONFIG.finalMessageHoldMs);
  }
}

tulipButtons.forEach((btn) => {
  btn.addEventListener('click', () => handleTulipTap(btn));
});

/* ============================================================
   Transiciones entre pantallas
   ============================================================ */
function goToBouquet() {
  showScreen('bouquet');
  applyDiscoveredState();
  if (state.discovered.size === totalFlowers) {
    if (bouquetHint) bouquetHint.classList.add('is-hidden');
    scheduleFinalTransition(1400);
  }
}

function goToFinal() {
  showScreen('final');
}

function resetExperience() {
  clearFinalTransitionTimer();
  appEl.classList.remove('final-transition');
  state.discovered = new Set();
  writeDiscovered(state.discovered);
  applyDiscoveredState();
  if (bouquetHint) bouquetHint.classList.remove('is-hidden');
  messagePanel.classList.remove('is-visible');
  messagePanel.textContent = '';
  showScreen('intro');
}

document.getElementById('btn-open').addEventListener('click', goToBouquet);
document.getElementById('btn-replay').addEventListener('click', resetExperience);

/* ============================================================
   Música opcional — nunca autoplay, solo por interacción directa
   ============================================================ */
const audio = document.getElementById('bg-audio');
const musicBtn = document.getElementById('btn-music');
const musicLabel = document.getElementById('music-label');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let musicPlaying = false;
let fadeFrame = null;

audio.volume = CONFIG.musicVolume;

function setMusicLabel() {
  musicLabel.textContent = musicPlaying ? CONFIG.texts.musicOff : CONFIG.texts.musicOn;
  musicBtn.setAttribute('aria-pressed', musicPlaying ? 'true' : 'false');
}

function fadeAudioTo(target, durationMs) {
  if (fadeFrame !== null) window.cancelAnimationFrame(fadeFrame);
  if (prefersReducedMotion || durationMs <= 0) {
    audio.volume = target;
    return;
  }
  const start = performance.now();
  const from = audio.volume;
  const step = (now) => {
    const t = Math.min(1, (now - start) / durationMs);
    audio.volume = from + (target - from) * t;
    fadeFrame = t < 1 ? window.requestAnimationFrame(step) : null;
  };
  fadeFrame = window.requestAnimationFrame(step);
}

musicBtn.addEventListener('click', () => {
  if (!musicPlaying) {
    // arranca en silencio y sube suavemente al volumen de fondo (nunca autoplay: solo tras este toque)
    audio.volume = 0;
    audio.play()
      .then(() => {
        musicPlaying = true;
        setMusicLabel();
        fadeAudioTo(CONFIG.musicVolume, CONFIG.musicFadeMs);
      })
      .catch(() => {
        // no hay archivo de música todavía o el navegador bloqueó la reproducción
        musicPlaying = false;
        setMusicLabel();
      });
  } else {
    audio.pause();
    musicPlaying = false;
    setMusicLabel();
  }
});

/* ============================================================
   Init
   ============================================================ */
document.getElementById('intro-title').textContent = CONFIG.texts.introTitle;
document.getElementById('intro-sub').textContent = CONFIG.texts.introSub;
document.getElementById('btn-open').textContent = CONFIG.texts.openButton;
if (bouquetHint) bouquetHint.textContent = CONFIG.texts.bouquetHint;
document.getElementById('final-title').textContent = CONFIG.texts.finalTitle;
document.getElementById('final-sub').textContent = CONFIG.texts.finalSub;
document.getElementById('btn-replay').textContent = CONFIG.texts.replayButton;
setMusicLabel();
applyDiscoveredState();
showScreen('intro');
