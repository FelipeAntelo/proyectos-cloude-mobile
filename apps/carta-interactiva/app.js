const SLUG = 'carta-interactiva';
const KEY_COUNTER = `pwa-lab:${SLUG}:counter`;
const KEY_STEP = `pwa-lab:${SLUG}:step`;
const KEY_FLIPPED = `pwa-lab:${SLUG}:flipped`;

function readNumber(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const value = JSON.parse(raw);
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

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

function writeValue(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* localStorage no disponible (modo privado, cuota llena, etc.) */
  }
}

let counter = readNumber(KEY_COUNTER, 0);
let step = readNumber(KEY_STEP, 1);
let flipped = readBoolean(KEY_FLIPPED, false);

const card = document.getElementById('card');
const flipBtn = document.getElementById('flip-btn');
const counterValue = document.getElementById('counter-value');
const incrementBtn = document.getElementById('increment-btn');
const decrementBtn = document.getElementById('decrement-btn');
const stepInput = document.getElementById('step-input');

function renderCounter() {
  counterValue.textContent = String(counter);
}

function renderFlip() {
  card.classList.toggle('flipped', flipped);
  card.setAttribute('aria-pressed', String(flipped));
}

function pulse() {
  counterValue.classList.remove('pulse');
  // Forzar reflow para poder re-disparar la animación en cambios consecutivos.
  void counterValue.offsetWidth;
  counterValue.classList.add('pulse');
}

function toggleFlip() {
  flipped = !flipped;
  writeValue(KEY_FLIPPED, flipped);
  renderFlip();
}

function changeCounter(delta) {
  counter = Math.max(0, counter + delta);
  writeValue(KEY_COUNTER, counter);
  renderCounter();
  pulse();
}

card.addEventListener('click', toggleFlip);
card.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    toggleFlip();
  }
});
flipBtn.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleFlip();
});

incrementBtn.addEventListener('click', () => changeCounter(step));
decrementBtn.addEventListener('click', () => changeCounter(-step));

stepInput.addEventListener('change', () => {
  const parsed = parseInt(stepInput.value, 10);
  step = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
  stepInput.value = String(step);
  writeValue(KEY_STEP, step);
});

counterValue.addEventListener('transitionend', () => {
  counterValue.classList.remove('pulse');
});

stepInput.value = String(step);
renderCounter();
renderFlip();
