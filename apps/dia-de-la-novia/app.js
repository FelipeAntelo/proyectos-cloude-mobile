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

/* ---------- Música de fondo (archivo MP3, sin autoplay) ---------- */

const audioToggle = document.getElementById('audio-toggle');
const bgMusic = document.getElementById('bg-music');

let musicEverStarted = false;

if (bgMusic) {
  bgMusic.volume = 0.25;
}

function setAudioButtonState(playing) {
  if (!audioToggle) return;
  audioToggle.classList.toggle('is-playing', playing);
  audioToggle.setAttribute('aria-pressed', String(playing));
  audioToggle.setAttribute('aria-label', playing ? 'Pausar música' : 'Activar música');
}

function playMusic() {
  if (!bgMusic) return;
  const playPromise = bgMusic.play();
  musicEverStarted = true;
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => {
      /* Safari puede bloquear la reproducción fuera de un gesto del usuario */
    });
  }
}

function pauseMusic() {
  bgMusic?.pause();
}

if (bgMusic) {
  bgMusic.addEventListener('play', () => setAudioButtonState(true));
  bgMusic.addEventListener('pause', () => setAudioButtonState(false));
  bgMusic.addEventListener('error', () => setAudioButtonState(false));
} else if (audioToggle) {
  audioToggle.remove();
}

audioToggle?.addEventListener('click', () => {
  if (!bgMusic) return;
  if (bgMusic.paused) {
    playMusic();
  } else {
    pauseMusic();
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
