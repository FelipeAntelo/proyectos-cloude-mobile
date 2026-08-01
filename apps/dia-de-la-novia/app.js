const SLUG = 'dia-de-la-novia';
const KEY_CARTA = `pwa-lab:${SLUG}:carta-revelada`;
const KEY_TARJETAS = `pwa-lab:${SLUG}:tarjetas-abiertas`;
const KEY_FINAL = `pwa-lab:${SLUG}:pantalla-final`;

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function readBoolean(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const value = JSON.parse(raw);
    return typeof value === 'boolean' ? value : fallback;
  } catch {
    return fallback;
  }
}

function readStringArray(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return [];
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeValue(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* localStorage no disponible (modo privado, cuota llena, etc.) */
  }
}

/* ---------- Portada: foto + fallback ---------- */

const portadaMedia = document.getElementById('portada-media');
const portadaPhoto = document.getElementById('portada-photo');

if (portadaPhoto) {
  if (portadaPhoto.complete && portadaPhoto.naturalWidth > 0) {
    portadaPhoto.classList.add('is-loaded');
  }
  portadaPhoto.addEventListener('load', () => {
    portadaPhoto.classList.add('is-loaded');
  });
  portadaPhoto.addEventListener('error', () => {
    portadaMedia.classList.add('img-error');
  });
}

/* ---------- Portada: partículas ambientales discretas ---------- */

const particlesHost = document.getElementById('portada-particles');

if (particlesHost && !prefersReducedMotion) {
  const total = 12;
  for (let i = 0; i < total; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'particle';
    dot.style.left = `${4 + Math.random() * 92}%`;
    dot.style.setProperty('--drift-x', `${(Math.random() * 16 - 8).toFixed(1)}px`);
    dot.style.width = dot.style.height = `${3 + Math.random() * 3}px`;
    dot.style.animationDuration = `${14 + Math.random() * 10}s`;
    dot.style.animationDelay = `${(-Math.random() * 22).toFixed(1)}s`;
    particlesHost.appendChild(dot);
  }
}

/* ---------- Música ambiental (Web Audio API, sin dependencias externas) ---------- */

const audioToggle = document.getElementById('audio-toggle');
const AudioContextClass = window.AudioContext || window.webkitAudioContext;

const TARGET_VOLUME = 0.07;
const PLUCK_NOTES = [440, 493.88, 587.33, 659.25, 739.99]; // pentatónica cálida sobre La mayor7

let audioCtx = null;
let masterGain = null;
let delayNode = null;
let musicPlaying = false;
let musicEverStarted = false;
let pluckTimer = null;

if (!AudioContextClass && audioToggle) {
  audioToggle.remove();
}

function buildAmbientGraph(ctx) {
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const padFilter = ctx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = 900;
  padFilter.Q.value = 0.4;
  padFilter.connect(master);

  const chord = [220, 277.18, 329.63, 415.3]; // La3, Do#4, Mi4, Sol#4 (Amaj7), acorde cálido
  chord.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const oscGain = ctx.createGain();
    oscGain.gain.value = 0.22;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.06 + i * 0.015;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 2.5;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    osc.connect(oscGain);
    oscGain.connect(padFilter);
    osc.start();
    lfo.start();
  });

  const delay = ctx.createDelay(2);
  delay.delayTime.value = 0.55;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.32;
  const delayFilter = ctx.createBiquadFilter();
  delayFilter.type = 'lowpass';
  delayFilter.frequency.value = 2200;

  delay.connect(delayFilter);
  delayFilter.connect(feedback);
  feedback.connect(delay);
  delay.connect(master);

  return { master, delay };
}

function playPluckNote() {
  const freq = PLUCK_NOTES[Math.floor(Math.random() * PLUCK_NOTES.length)];
  const now = audioCtx.currentTime;

  const osc = audioCtx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0005, now + 2.2);

  osc.connect(gain);

  if (audioCtx.createStereoPanner) {
    const panner = audioCtx.createStereoPanner();
    panner.pan.value = Math.random() * 1.2 - 0.6;
    gain.connect(panner);
    panner.connect(masterGain);
    panner.connect(delayNode);
  } else {
    gain.connect(masterGain);
    gain.connect(delayNode);
  }

  osc.start(now);
  osc.stop(now + 2.3);
}

function scheduleNextPluck() {
  const delaySeconds = 3.5 + Math.random() * 4.5;
  pluckTimer = setTimeout(() => {
    pluckTimer = null;
    if (!musicPlaying) return;
    playPluckNote();
    scheduleNextPluck();
  }, delaySeconds * 1000);
}

function setAudioButtonState(playing) {
  if (!audioToggle) return;
  audioToggle.classList.toggle('is-playing', playing);
  audioToggle.setAttribute('aria-pressed', String(playing));
  audioToggle.setAttribute('aria-label', playing ? 'Pausar música' : 'Activar música');
}

function playMusic() {
  if (!AudioContextClass) return;

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
    const graph = buildAmbientGraph(audioCtx);
    masterGain = graph.master;
    delayNode = graph.delay;
  }

  audioCtx
    .resume()
    .then(() => {
      const now = audioCtx.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.linearRampToValueAtTime(TARGET_VOLUME, now + 1.6);
      musicPlaying = true;
      musicEverStarted = true;
      setAudioButtonState(true);
      if (!pluckTimer) scheduleNextPluck();
    })
    .catch(() => {});
}

function pauseMusic() {
  if (!audioCtx || !masterGain) return;
  const now = audioCtx.currentTime;
  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.setValueAtTime(masterGain.gain.value, now);
  masterGain.gain.linearRampToValueAtTime(0, now + 0.7);
  musicPlaying = false;
  setAudioButtonState(false);
  if (pluckTimer) {
    clearTimeout(pluckTimer);
    pluckTimer = null;
  }
}

audioToggle?.addEventListener('click', () => {
  if (musicPlaying) {
    pauseMusic();
  } else {
    playMusic();
  }
});

/* ---------- Navegación entre pantallas ---------- */

const btnAbrir = document.getElementById('btn-abrir');
const cartaSection = document.getElementById('carta');
const cartaCard = document.getElementById('carta-card');
const btnFinal = document.getElementById('btn-final');
const finalSection = document.getElementById('final');

function revealCarta() {
  cartaCard.classList.add('revealed');
  writeValue(KEY_CARTA, true);
}

btnAbrir?.addEventListener('click', () => {
  cartaSection.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
  revealCarta();
  if (!musicEverStarted) playMusic();
});

function revealFinal() {
  finalSection.classList.add('revealed');
  writeValue(KEY_FINAL, true);
}

btnFinal?.addEventListener('click', () => {
  finalSection.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
  revealFinal();
});

if (readBoolean(KEY_CARTA, false)) {
  cartaCard.classList.add('revealed');
}

if (readBoolean(KEY_FINAL, false)) {
  finalSection.classList.add('revealed');
}

/* ---------- Aparición al hacer scroll (carta y tarjetas) ---------- */

const revealOnScroll = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        if (entry.target === cartaCard) revealCarta();
        if (entry.target === finalSection) revealFinal();
        revealOnScroll.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.35 }
);

revealOnScroll.observe(cartaCard);
revealOnScroll.observe(finalSection);
document.querySelectorAll('.motivo-card').forEach((card) => revealOnScroll.observe(card));

/* ---------- Cinco tarjetas: abrir / cerrar + persistencia ---------- */

const tarjetasAbiertas = new Set(readStringArray(KEY_TARJETAS));

document.querySelectorAll('.motivo-card').forEach((card) => {
  const id = card.dataset.id;
  const toggle = card.querySelector('.motivo-toggle');

  if (tarjetasAbiertas.has(id)) {
    card.classList.add('was-opened');
  }

  toggle.addEventListener('click', () => {
    const isOpen = card.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));

    if (isOpen) {
      card.classList.add('was-opened');
      tarjetasAbiertas.add(id);
      writeValue(KEY_TARJETAS, Array.from(tarjetasAbiertas));
    }
  });
});
