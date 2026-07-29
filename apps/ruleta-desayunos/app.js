const SLUG = 'ruleta-desayunos';
const KEY_OPTIONS = `pwa-lab:${SLUG}:options`;

const MAX_LENGTH = 30;
const PALETTE = ['#f2b134', '#ed553b', '#3caea3', '#20639b', '#8e7cc3', '#6fbf73'];
const DEFAULT_OPTIONS = [
  'Tostadas',
  'Huevos revueltos',
  'Yogur con granola',
  'Panqueques',
  'Avena',
  'Café con medialunas',
];

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readOptions() {
  try {
    const raw = localStorage.getItem(KEY_OPTIONS);
    if (raw === null) {
      return DEFAULT_OPTIONS.map((text) => ({ id: generateId(), text }));
    }
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item) => item && typeof item.id === 'string' && typeof item.text === 'string'
    );
  } catch {
    return DEFAULT_OPTIONS.map((text) => ({ id: generateId(), text }));
  }
}

function writeOptions(value) {
  try {
    localStorage.setItem(KEY_OPTIONS, JSON.stringify(value));
  } catch {
    /* localStorage no disponible (modo privado, cuota llena, etc.) */
  }
}

let options = readOptions();
let editingId = null;
let spinning = false;
let currentRotation = 0;

const canvas = document.getElementById('wheel-canvas');
const ctx = canvas.getContext('2d');
const spinBtn = document.getElementById('spin-btn');
const emptyHint = document.getElementById('empty-hint');
const resultEl = document.getElementById('result');
const optionsList = document.getElementById('options-list');
const addInput = document.getElementById('add-input');
const addBtn = document.getElementById('add-btn');

function persist() {
  writeOptions(options);
}

function drawWheel() {
  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 4;

  ctx.clearRect(0, 0, size, size);

  if (options.length === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#1c2030';
    ctx.fill();
    return;
  }

  const sliceAngle = (Math.PI * 2) / options.length;

  options.forEach((option, i) => {
    const start = i * sliceAngle - Math.PI / 2;
    const end = start + sliceAngle;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(start + sliceAngle / 2);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#14161c';
    ctx.font = '600 15px -apple-system, system-ui, sans-serif';
    ctx.fillText(truncateForWheel(option.text, radius - 24), radius - 14, 0);
    ctx.restore();
  });
}

function truncateForWheel(text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

function renderSpinAvailability() {
  const hasOptions = options.length > 0;
  spinBtn.disabled = !hasOptions || spinning;
  emptyHint.hidden = hasOptions;
}

function renderOptions() {
  optionsList.innerHTML = '';

  for (const option of options) {
    const li = document.createElement('li');
    li.className = 'option-row';

    if (editingId === option.id) {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = option.text;
      input.maxLength = MAX_LENGTH;

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.textContent = 'Guardar';
      saveBtn.addEventListener('click', () => saveEdit(option.id, input.value));

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.addEventListener('click', () => {
        editingId = null;
        renderOptions();
      });

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') saveEdit(option.id, input.value);
        if (event.key === 'Escape') {
          editingId = null;
          renderOptions();
        }
      });

      li.append(input, saveBtn, cancelBtn);
    } else {
      const span = document.createElement('span');
      span.className = 'option-text';
      span.textContent = option.text;

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.textContent = 'Editar';
      editBtn.addEventListener('click', () => {
        editingId = option.id;
        renderOptions();
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'delete-btn';
      deleteBtn.textContent = 'Eliminar';
      deleteBtn.addEventListener('click', () => deleteOption(option.id));

      li.append(span, editBtn, deleteBtn);
    }

    optionsList.appendChild(li);
  }
}

function addOption(rawText) {
  const text = rawText.trim().slice(0, MAX_LENGTH);
  if (!text) return;

  options.push({ id: generateId(), text });
  persist();
  drawWheel();
  renderOptions();
  renderSpinAvailability();
}

function saveEdit(id, rawText) {
  const text = rawText.trim().slice(0, MAX_LENGTH);
  if (!text) return;

  options = options.map((option) => (option.id === id ? { ...option, text } : option));
  editingId = null;
  persist();
  drawWheel();
  renderOptions();
}

function deleteOption(id) {
  const option = options.find((o) => o.id === id);
  if (!option) return;
  if (!confirm(`¿Eliminar "${option.text}" de la ruleta?`)) return;

  options = options.filter((o) => o.id !== id);
  persist();
  drawWheel();
  renderOptions();
  renderSpinAvailability();
}

function spin() {
  if (spinning || options.length === 0) return;

  spinning = true;
  renderSpinAvailability();
  resultEl.textContent = '';

  const winnerIndex = Math.floor(Math.random() * options.length);
  const sliceDeg = 360 / options.length;
  const winnerCenterDeg = (winnerIndex + 0.5) * sliceDeg;
  const jitter = (Math.random() - 0.5) * sliceDeg * 0.6;
  const targetDeg = ((360 - (winnerCenterDeg + jitter)) % 360 + 360) % 360;

  const normalizedCurrent = ((currentRotation % 360) + 360) % 360;
  const delta = ((targetDeg - normalizedCurrent) % 360 + 360) % 360;
  const extraSpins = 5;
  currentRotation += delta + extraSpins * 360;

  canvas.style.transform = `rotate(${currentRotation}deg)`;

  const onSpinEnd = () => {
    canvas.removeEventListener('transitionend', onSpinEnd);
    spinning = false;
    renderSpinAvailability();

    const winner = options[winnerIndex];
    resultEl.textContent = winner ? `¡Salió: ${winner.text}!` : '';
    resultEl.classList.remove('pulse');
    void resultEl.offsetWidth;
    resultEl.classList.add('pulse');
  };

  canvas.addEventListener('transitionend', onSpinEnd);
}

resultEl.addEventListener('transitionend', () => {
  resultEl.classList.remove('pulse');
});

addBtn.addEventListener('click', () => {
  addOption(addInput.value);
  addInput.value = '';
  addInput.focus();
});

addInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    addOption(addInput.value);
    addInput.value = '';
  }
});

spinBtn.addEventListener('click', spin);

drawWheel();
renderOptions();
renderSpinAvailability();
