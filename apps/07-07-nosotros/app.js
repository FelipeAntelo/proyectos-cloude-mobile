/* ============================================================
   07:07 — Nosotros

   Lenguaje de interacción:
     FLOR que respira  = puede esconder algo, se toca
     PÉTALO flotando   = hay algo por descubrir / por dónde seguir

   Arquitectura:
   - Cada carga empieza de cero. No se guarda progreso en ningún lado.
   - Todo lo interactivo es un <button> real; los SVG son pointer-events:none,
     así el tap siempre lo recibe el botón y nunca un pétalo suelto.
   - `bindAction()` centraliza feedback en pointerdown + acción en click,
     con guarda contra doble disparo.
   ============================================================ */

(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------
     Arranque limpio
     --------------------------------------------------------------- */

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('pwa-lab:07-07-nosotros:'))
      .forEach((k) => localStorage.removeItem(k));
  } catch (e) { /* almacenamiento no disponible */ }

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) window.location.reload();
  });

  // Sin esto Safari iOS no aplica :active a un toque, solo al mouse.
  document.addEventListener('touchstart', function () {}, { passive: true });

  /* ---------------------------------------------------------------
     Scroll: encuadre centrado y cancelable
     --------------------------------------------------------------- */

  let scrollRaf = null;

  function cancelScroll() {
    if (scrollRaf) {
      cancelAnimationFrame(scrollRaf);
      scrollRaf = null;
    }
  }

  // Si la persona toma el control con el dedo, el scroll automático cede.
  ['touchstart', 'wheel', 'keydown'].forEach((ev) =>
    window.addEventListener(ev, cancelScroll, { passive: true })
  );

  function smoothScrollTo(targetY, duration) {
    cancelScroll();
    const startY = window.scrollY;
    const dist = targetY - startY;
    if (Math.abs(dist) < 2) return;
    if (reduceMotion) { window.scrollTo(0, targetY); return; }

    const ms = duration || 950;
    const t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      window.scrollTo(0, startY + dist * ease(t));
      scrollRaf = t < 1 ? requestAnimationFrame(step) : null;
    };
    scrollRaf = requestAnimationFrame(step);
  }

  /**
   * Deja el elemento encuadrado verticalmente. Si es más alto que la
   * pantalla (la carta), lo alinea arriba con aire en lugar de centrarlo,
   * para no cortar su encabezado.
   */
  function centerOn(el, duration) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const absTop = rect.top + window.scrollY;
    const vh = window.innerHeight;
    const target = rect.height <= vh - 40
      ? absTop - (vh - rect.height) / 2
      : absTop - vh * 0.1;
    const max = Math.max(0, document.documentElement.scrollHeight - vh);
    smoothScrollTo(Math.max(0, Math.min(target, max)), duration);
  }

  /* ---------------------------------------------------------------
     Interacción: un único punto de entrada
     --------------------------------------------------------------- */

  function bindAction(btn, action, opts) {
    if (!btn) return;
    const once = !opts || opts.once !== false;
    let spent = false;
    let releaseTimer = null;

    btn.addEventListener('pointerdown', () => {
      if (spent) return;
      btn.classList.add('pressed');
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => btn.classList.remove('pressed'), 260);
    }, { passive: true });

    const release = () => {
      clearTimeout(releaseTimer);
      btn.classList.remove('pressed');
    };
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
      btn.addEventListener(ev, release, { passive: true })
    );

    btn.addEventListener('click', (event) => {
      event.preventDefault();
      if (spent) return;
      if (once) spent = true;
      action();
    });
  }

  /* ---------------------------------------------------------------
     Flores SVG
     --------------------------------------------------------------- */

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  /**
   * Los pétalos se reparten en ángulos iguales, con una variación mínima
   * (±1.4°) que NO alterna de forma sistemática. Antes se usaba un offset
   * -3/+3 que hacía que los huecos fueran 54° y 66° alternados, y la flor
   * parecía a la que le falta un pétalo. Los pétalos internos van
   * exactamente a media distancia entre dos externos, así el conjunto se
   * lee lleno y simétrico.
   */
  function createFlower({
    size = 96,
    outerColor = '#d9a9ad',
    innerColor = '#f4dde1',
    centerColor = '#c6a15b',
    petals = 6,
  } = {}) {
    const svg = el('svg', {
      viewBox: '0 0 120 120',
      width: size,
      height: size,
      class: 'flower',
      'aria-hidden': 'true',
    });

    const step = 360 / petals;
    const wobble = (i, seed) => Math.sin((i + 1) * seed) * 1.4;

    // Nota: un <g> no puede tener a la vez atributo SVG `transform` y CSS
    // `transform` (gana el CSS). Por eso el centrado vive en un grupo
    // envolvente, separado del que recibe la animación de apertura.
    const outerGroup = el('g', { class: 'outer-petals' });
    for (let i = 0; i < petals; i++) {
      const anchor = el('g', { transform: 'translate(60,60)' });
      const g = el('g', { class: 'petal' });
      g.style.setProperty('--rot', `${(step * i + wobble(i, 2.3)).toFixed(2)}deg`);
      g.style.setProperty('--delay', `${(i * 0.06).toFixed(2)}s`);
      g.appendChild(el('path', {
        d: 'M0,0 C-13,-15 -12,-35 0,-47 C12,-35 13,-15 0,0 Z',
        fill: outerColor,
        opacity: '0.95',
      }));
      anchor.appendChild(g);
      outerGroup.appendChild(anchor);
    }

    const innerGroup = el('g', { class: 'inner-petals' });
    for (let i = 0; i < petals; i++) {
      const anchor = el('g', { transform: 'translate(60,60)' });
      const g = el('g', { class: 'petal-inner' });
      g.style.setProperty('--rot', `${(step * i + step / 2 + wobble(i, 3.7)).toFixed(2)}deg`);
      g.style.setProperty('--delay', `${(i * 0.05).toFixed(2)}s`);
      g.appendChild(el('path', {
        d: 'M0,0 C-9,-10 -8,-24 0,-31 C8,-24 9,-10 0,0 Z',
        fill: innerColor,
      }));
      anchor.appendChild(g);
      innerGroup.appendChild(anchor);
    }

    svg.appendChild(outerGroup);
    svg.appendChild(innerGroup);
    svg.appendChild(el('circle', { class: 'stamen', cx: '60', cy: '60', r: '4.5', fill: centerColor }));

    svg.querySelectorAll('.petal, .petal-inner').forEach((g) => {
      g.style.transformBox = 'fill-box';
    });

    return svg;
  }

  /** Cada flor respira con su propio ritmo: nunca sincronizadas. */
  let breezeSeed = 0;
  function applyBreeze(svg) {
    const i = breezeSeed++;
    const dur = 4.4 + ((i * 0.83) % 2.6);
    const delay = -((i * 1.37) % 4.2);   // fase inicial distinta
    const amp = 0.72 + ((i * 0.47) % 0.56);
    svg.style.setProperty('--breeze-dur', `${dur.toFixed(2)}s`);
    svg.style.setProperty('--breeze-delay', `${delay.toFixed(2)}s`);
    svg.style.setProperty('--breeze-amp', amp.toFixed(2));
  }

  /** Al tocar, la brisa se queda quieta un momento y luego vuelve sola. */
  function calmFlower(svg, ms) {
    if (!svg) return;
    svg.classList.add('calm');
    clearTimeout(svg._calmTimer);
    svg._calmTimer = setTimeout(() => svg.classList.remove('calm'), ms || 1500);
  }

  const styleNoAnim = document.createElement('style');
  styleNoAnim.textContent =
    '.flower.no-anim .petal, .flower.no-anim .petal-inner, .flower.no-anim .stamen { transition: none !important; }';
  document.head.appendChild(styleNoAnim);

  function bloomInstant(svg) {
    svg.classList.add('no-anim', 'bloom');
    svg.getBoundingClientRect();
    requestAnimationFrame(() => svg.classList.remove('no-anim'));
  }

  /* --- Pétalos flotantes: también con ritmo propio --- */
  let floatSeed = 0;
  document.querySelectorAll('.petal-shape').forEach((p) => {
    const i = floatSeed++;
    p.style.setProperty('--float-dur', `${(3.9 + ((i * 0.71) % 2.2)).toFixed(2)}s`);
    p.style.setProperty('--float-delay', `${(-((i * 1.13) % 3.4)).toFixed(2)}s`);
  });

  /* ---------------------------------------------------------------
     Construcción de las flores
     --------------------------------------------------------------- */

  const portadaFlower = createFlower({ size: 108, petals: 6 });
  document.getElementById('portada-flower').appendChild(portadaFlower);
  applyBreeze(portadaFlower);

  // La flor final es la misma de la portada, ya completamente florecida.
  const finalFlower = createFlower({ size: 136, petals: 6 });
  document.getElementById('final-flower').appendChild(finalFlower);
  applyBreeze(finalFlower);

  const gardenPalettes = [
    { outerColor: '#e7c3c8', innerColor: '#f6efe2', centerColor: '#c6a15b', petals: 6, size: 62 },
    { outerColor: '#c98f96', innerColor: '#f4dde1', centerColor: '#c6a15b', petals: 5, size: 66 },
    { outerColor: '#f2e6d8', innerColor: '#f4dde1', centerColor: '#d8bd8a', petals: 6, size: 60 },
    { outerColor: '#d9a9ad', innerColor: '#f6efe2', centerColor: '#c6a15b', petals: 5, size: 64 },
    { outerColor: '#f4dde1', innerColor: '#d9a9ad', centerColor: '#c6a15b', petals: 6, size: 62 },
  ];

  const gardenButtons = Array.from(document.querySelectorAll('.garden-flower'));
  const gardenFlowers = gardenButtons.map((btn, i) => {
    const svg = createFlower(gardenPalettes[i]);
    btn.querySelector('.flower-host').appendChild(svg);
    applyBreeze(svg);
    return svg;
  });

  // Escena de la distancia: son el elemento gráfico principal.
  const herFlower = createFlower({ size: 96, petals: 6 });
  const meFlower = createFlower({ size: 96, petals: 5, outerColor: '#c98f96' });
  document.getElementById('her-flower').appendChild(herFlower);
  document.getElementById('me-flower').appendChild(meFlower);
  applyBreeze(herFlower);
  applyBreeze(meFlower);

  const envelopeFlower = createFlower({ size: 46, petals: 6 });
  document.getElementById('envelope-flower').appendChild(envelopeFlower);
  applyBreeze(envelopeFlower);
  bloomInstant(envelopeFlower);

  /* ---------------------------------------------------------------
     Música — arranca con el primer toque consciente
     --------------------------------------------------------------- */

  const audioEl = document.getElementById('bg-audio');
  const audioToggle = document.getElementById('audio-toggle');
  const TARGET_VOLUME = 0.55;
  const FADE_SECONDS = 2.6;

  const music = {
    started: false,
    broken: false,
    ctx: null,
    gain: null,

    // Siempre dentro de un gesto: iOS exige que play() y la creación del
    // AudioContext ocurran de forma síncrona ahí.
    start() {
      if (this.started || this.broken) return;
      this.started = true;

      // iOS deja `volume` de solo lectura; se detecta escribiéndolo. Si no
      // toma el valor, el fade se hace con Web Audio (que sí funciona ahí).
      audioEl.volume = 0;
      const volumeLocked = audioEl.volume !== 0;
      if (volumeLocked) this.setupWebAudio();

      const p = audioEl.play();
      if (p && p.then) p.then(() => this.onPlaying()).catch(() => this.fail());
      else this.onPlaying();

      this.fadeIn();
    },

    setupWebAudio() {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx || this.ctx) return;
      try {
        this.ctx = new Ctx();
        const source = this.ctx.createMediaElementSource(audioEl);
        this.gain = this.ctx.createGain();
        this.gain.gain.value = 0.0001;
        source.connect(this.gain);
        this.gain.connect(this.ctx.destination);
      } catch (e) {
        this.ctx = null;
        this.gain = null;
        audioEl.volume = TARGET_VOLUME;
      }
    },

    fadeIn() {
      if (this.ctx && this.gain) {
        const ramp = () => {
          const now = this.ctx.currentTime;
          this.gain.gain.cancelScheduledValues(now);
          this.gain.gain.setValueAtTime(0.0001, now);
          this.gain.gain.exponentialRampToValueAtTime(TARGET_VOLUME, now + FADE_SECONDS);
        };
        if (this.ctx.state === 'suspended') this.ctx.resume().then(ramp).catch(ramp);
        else ramp();
        return;
      }
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / (FADE_SECONDS * 1000));
        audioEl.volume = TARGET_VOLUME * t * t;
        if (t < 1 && !audioEl.paused) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },

    onPlaying() {
      audioToggle.hidden = false;
      audioToggle.dataset.playing = 'true';
      requestAnimationFrame(() => audioToggle.classList.add('available'));
    },

    fail() {
      this.started = false;
      this.broken = true;
      audioToggle.hidden = true;
      audioToggle.classList.remove('available');
    },

    toggle() {
      if (audioEl.paused) {
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        const p = audioEl.play();
        if (p && p.catch) p.catch(() => {});
        audioToggle.dataset.playing = 'true';
        audioToggle.setAttribute('aria-label', 'Pausar música');
      } else {
        audioEl.pause();
        audioToggle.dataset.playing = 'false';
        audioToggle.setAttribute('aria-label', 'Reproducir música');
      }
    },
  };

  audioEl.addEventListener('error', () => music.fail(), true);
  bindAction(audioToggle, () => music.toggle(), { once: false });

  /* ---------------------------------------------------------------
     Escenas — revelado al entrar en pantalla
     --------------------------------------------------------------- */

  const sceneCallbacks = {
    'scene-tiempo': runTimeSequence,
    'scene-jardin': runGardenDiscovery,
    'scene-final': runFinalIntro,
  };
  const scenesEntered = new Set();

  // rootMargin en vez de threshold alto: hay escenas (la carta) mucho más
  // altas que el viewport, donde un umbral por área nunca se cumpliría.
  const sceneObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in-view');
      const id = entry.target.id;
      if (sceneCallbacks[id] && !scenesEntered.has(id)) {
        scenesEntered.add(id);
        sceneCallbacks[id]();
      }
    });
  }, { threshold: 0, rootMargin: '-15% 0px -15% 0px' });

  document.querySelectorAll('.scene').forEach((s) => sceneObserver.observe(s));

  /* ---------------------------------------------------------------
     Pétalos de navegación: una frase pequeña + el paso siguiente
     --------------------------------------------------------------- */

  function bindPetalNav({ btnId, phraseId, text, getTarget, holdMs }) {
    const btn = document.getElementById(btnId);
    const phrase = document.getElementById(phraseId);
    if (!btn) return;

    bindAction(btn, () => {
      btn.classList.add('spent');
      if (phrase && text) {
        phrase.textContent = text;
        requestAnimationFrame(() => phrase.classList.add('show'));
      }
      const wait = reduceMotion ? 300 : (holdMs || 2000);
      setTimeout(() => {
        const target = getTarget();
        if (target) centerOn(target);
      }, wait);
    });
  }

  /**
   * Si un elemento acaba de aparecer justo debajo del pliegue, lo sube lo
   * mínimo para que quede a la vista. Sin esto, el pétalo que abre el paso
   * siguiente puede nacer fuera de pantalla y quedar sin descubrir.
   */
  function nudgeIntoView(el, margin) {
    if (!el) return;
    const vh = window.innerHeight;
    const bottom = el.getBoundingClientRect().bottom;
    const limit = vh - (margin || 90);
    if (bottom <= limit) return;
    const max = Math.max(0, document.documentElement.scrollHeight - vh);
    smoothScrollTo(Math.min(window.scrollY + (bottom - limit), max), 850);
  }

  function revealSlot(slotId, nudge) {
    const slot = document.getElementById(slotId);
    if (!slot) return;
    slot.classList.add('show');
    if (nudge) setTimeout(() => nudgeIntoView(slot), 700);
  }

  /* ---------------------------------------------------------------
     Escena 1 — Portada
     --------------------------------------------------------------- */

  const portadaBtn = document.getElementById('portada-flower-btn');
  const portadaHint = document.getElementById('portada-hint');

  bindAction(portadaBtn, () => {
    music.start(); // primer gesto consciente: también inicia la música

    calmFlower(portadaFlower, 2400);
    portadaBtn.classList.add('bloomed');
    portadaFlower.classList.add('bloom');
    portadaHint.classList.remove('show');
    portadaBtn.setAttribute('aria-label', 'La flor ya se abrió');

    setTimeout(() => {
      centerOn(document.querySelector('#scene-tiempo .scene-inner'), 1100);
    }, reduceMotion ? 350 : 2000);
  });

  setTimeout(() => portadaHint.classList.add('show'), 900);

  /* ---------------------------------------------------------------
     Escena 2 — Nuestro tiempo
     --------------------------------------------------------------- */

  const petalLesson = document.getElementById('petal-lesson');

  function runTimeSequence() {
    const years = document.getElementById('time-years');
    const months = document.getElementById('time-months');
    const choose = document.getElementById('time-choose');
    const d = reduceMotion ? 0 : 1;
    setTimeout(() => years.classList.add('show'), 200);
    setTimeout(() => months.classList.add('show'), 200 + 700 * d);
    setTimeout(() => choose.classList.add('show'), 200 + 1500 * d);
    setTimeout(() => revealSlot('time-petal-slot'), 200 + 2300 * d);
    // La lección de los pétalos se enseña una sola vez, y discretamente.
    setTimeout(() => petalLesson.classList.add('show'), 200 + 3400 * d);
  }

  bindPetalNav({
    btnId: 'time-petal-btn',
    phraseId: 'time-petal-phrase',
    text: 'Todavía me encanta coincidir con vos.',
    getTarget: () => document.querySelector('#scene-jardin .scene-inner'),
  });
  document.getElementById('time-petal-btn').addEventListener('click', () => {
    petalLesson.classList.remove('show');
  });

  /* ---------------------------------------------------------------
     Escena 3 — Jardín
     --------------------------------------------------------------- */

  const gardenData = [
    { title: 'Tu forma de querer', text: 'Gracias por quererme incluso cuando quererme no siempre ha sido sencillo.' },
    { title: 'Tu fortaleza', text: 'Admiro profundamente a la mujer que sos, todo lo que perseguís y la fuerza con la que seguís adelante.' },
    { title: 'Tu paciencia', text: 'Gracias por entenderme tantas veces, por quedarte y por seguir construyendo conmigo.' },
    { title: 'Tu compañía', text: 'Hay una tranquilidad muy particular en saber que existís en mi vida.' },
    { title: 'Tú', text: 'Podría intentar explicar todo lo que veo cuando te miro, pero probablemente nunca terminaría.' },
  ];

  const gardenMessage = document.getElementById('garden-message');
  const gardenMsgTitle = gardenMessage.querySelector('.msg-title');
  const gardenMsgText = gardenMessage.querySelector('.msg-text');
  const gardenHint = document.getElementById('garden-discovery-hint');
  const openedFlowers = new Set();

  function showGardenMessage(i) {
    gardenMessage.classList.remove('show');
    requestAnimationFrame(() => {
      gardenMsgTitle.textContent = gardenData[i].title;
      gardenMsgText.textContent = gardenData[i].text;
      requestAnimationFrame(() => gardenMessage.classList.add('show'));
    });
  }

  gardenButtons.forEach((btn, i) => {
    const svg = gardenFlowers[i];
    btn.setAttribute('aria-label', `Descubrir: ${gardenData[i].title}`);

    // once:false — se puede volver a tocar una ya abierta para releerla;
    // la apertura en sí sucede una sola vez.
    bindAction(btn, () => {
      calmFlower(svg, 1600);
      if (!openedFlowers.has(i)) {
        openedFlowers.add(i);
        svg.classList.add('bloom');
        btn.dataset.open = 'true';
        gardenHint.classList.remove('show');
        if (openedFlowers.size >= gardenData.length) {
          setTimeout(() => revealSlot('garden-petal-slot', true), 1400);
        }
      }
      showGardenMessage(i);
    }, { once: false });
  });

  function pulseDiscovery(index) {
    const cell = gardenButtons[index] && gardenButtons[index].querySelector('.cell-flower');
    if (!cell) return;
    cell.classList.add('discovery-cue');
    setTimeout(() => cell.classList.remove('discovery-cue'), 950);
  }

  function runGardenDiscovery() {
    setTimeout(() => {
      if (openedFlowers.size > 0) return;
      pulseDiscovery(0);
      gardenHint.classList.add('show');
      setTimeout(() => gardenHint.classList.remove('show'), 2800);
    }, 1000);

    setTimeout(() => {
      if (openedFlowers.size === 0) pulseDiscovery(2);
    }, 6000);
  }

  bindPetalNav({
    btnId: 'garden-petal-btn',
    phraseId: 'garden-petal-phrase',
    text: 'Gracias por seguir acá.',
    getTarget: () => document.querySelector('#scene-distancia .scene-inner'),
  });

  /* ---------------------------------------------------------------
     Escena 4 — La distancia (~8s, una vez por carga)
     --------------------------------------------------------------- */

  const distanceStage = document.getElementById('distance-stage');
  const distanceReplay = document.getElementById('distance-replay');
  const distTexts = [
    document.getElementById('dist-text-1'),
    document.getElementById('dist-text-2'),
    document.getElementById('dist-text-3'),
  ];
  let distanceTimers = [];

  function clearDistanceTimers() {
    distanceTimers.forEach(clearTimeout);
    distanceTimers = [];
  }

  function runDistanceSequence() {
    clearDistanceTimers();

    if (reduceMotion) {
      distTexts.forEach((t) => t.classList.add('show'));
      distanceStage.dataset.state = 'together';
      revealSlot('distance-petal-slot', true);
      return;
    }

    distTexts.forEach((t) => t.classList.remove('show'));
    distanceStage.dataset.state = 'near';

    const at = (ms, fn) => distanceTimers.push(setTimeout(fn, ms));

    at(400, () => distTexts[0].classList.add('show'));          // "…a la distancia."
    at(1500, () => { distanceStage.dataset.state = 'apart'; });  // se separan (2.7s)
    at(3800, () => { distanceStage.dataset.state = 'linked'; }); // hilo dorado
    at(4100, () => distTexts[1].classList.add('show'));          // "Unas cuantas horas…"
    at(6200, () => { distanceStage.dataset.state = 'closing'; });// se acercan
    at(8400, () => {
      distanceStage.dataset.state = 'together';                  // juntas, siguen respirando
      distTexts[2].classList.add('show');                        // "…dónde quiero estar."
    });
    at(9400, () => {
      revealSlot('distance-petal-slot', true);
      distanceReplay.hidden = false;
      requestAnimationFrame(() => distanceReplay.classList.add('show'));
    });
  }

  // Se observa el escenario (más chico que el viewport), no la sección:
  // así la animación arranca justo cuando las flores están a la vista.
  const distanceObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      distanceObserver.disconnect(); // una sola vez por carga
      runDistanceSequence();
    });
  }, { threshold: 0.5 });
  distanceObserver.observe(distanceStage);

  bindAction(distanceReplay, () => {
    distanceReplay.classList.remove('show');
    runDistanceSequence();
  }, { once: false });

  bindPetalNav({
    btnId: 'distance-petal-btn',
    phraseId: 'distance-petal-phrase',
    text: 'Qué suerte coincidir con vos.',
    getTarget: () => document.getElementById('envelope-slot'),
  });

  /* ---------------------------------------------------------------
     Escena 5 — La carta
     --------------------------------------------------------------- */

  const envelope = document.getElementById('envelope');
  const envelopeBtn = document.getElementById('envelope-btn');
  const envelopeSlot = document.getElementById('envelope-slot');
  const letter = document.getElementById('letter');
  let letterOpened = false;

  function openLetter() {
    if (letterOpened) return;
    letterOpened = true;

    envelope.classList.add('open');   // solapa + hoja que sube + cuerpo que baja
    envelopeBtn.disabled = true;

    // El sobre se colapsa mientras la carta entra: sin salto de layout,
    // la carta parece salir de él.
    setTimeout(() => envelopeSlot.classList.add('collapsing'), 30);
    setTimeout(() => letter.classList.add('show'), reduceMotion ? 250 : 1000);
  }

  bindAction(envelopeBtn, openLetter);

  // El pétalo final de la carta aparece cuando se llega a la firma.
  const signature = letter.querySelector('.signature');
  const signatureObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      signatureObserver.disconnect();
      setTimeout(() => revealSlot('letter-petal-slot', true), 900);
    });
  }, { threshold: 0.9 });
  signatureObserver.observe(signature);

  bindPetalNav({
    btnId: 'letter-petal-btn',
    phraseId: 'letter-petal-phrase',
    text: 'Una última cosa…',
    getTarget: () => document.querySelector('#scene-final .scene-inner'),
    holdMs: 1600,
  });

  /* ---------------------------------------------------------------
     Escena 6 — Final
     --------------------------------------------------------------- */

  const finalLine1 = document.getElementById('final-line-1');
  const finalDate = document.getElementById('final-date');
  const finalMore = document.getElementById('final-more');
  const finalWhisper = document.getElementById('final-whisper');

  function runFinalIntro() {
    bloomInstant(finalFlower);
    setTimeout(() => finalLine1.classList.add('show'), 300);
    setTimeout(() => finalDate.classList.add('show'), 1200);
    setTimeout(() => finalMore.classList.add('show'), 2800);
  }

  bindAction(finalMore, () => {
    finalMore.classList.remove('show');
    calmFlower(finalFlower, 1200);

    const petal = finalFlower.querySelector('.outer-petals .petal');
    if (petal) {
      petal.classList.add('petal-fall');
      requestAnimationFrame(() => {
        setTimeout(() => petal.classList.add('falling'), 30);
      });
    }

    setTimeout(() => { finalMore.style.display = 'none'; }, 500);
    setTimeout(() => finalWhisper.classList.add('show'), reduceMotion ? 400 : 2500);
  });
})();
