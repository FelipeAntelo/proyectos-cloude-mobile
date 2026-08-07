/* ============================================================
   07:07 — Nosotros

   Arquitectura de interacción:

   - Cada carga de la página empieza de cero. No se guarda progreso en
     ningún lado (ni localStorage, ni sessionStorage, ni caché).
   - Todo elemento interactivo es un <button> real del DOM. Los SVG
     decorativos tienen pointer-events:none, así el tap siempre lo recibe
     el botón y nunca un pétalo suelto.
   - Cada interacción pasa por `bindAction()`, que da feedback visual en
     pointerdown (inmediato) y ejecuta la acción en click, con una guarda
     de estado para que no pueda dispararse dos veces.
   ============================================================ */

(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------
     Arranque limpio
     --------------------------------------------------------------- */

  // Safari restaura el scroll al recargar; aquí siempre se empieza arriba.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  // Restos de versiones anteriores que sí guardaban progreso. Se borran una
  // vez para que nadie arrastre estado viejo desde una visita previa.
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('pwa-lab:07-07-nosotros:'))
      .forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    /* almacenamiento no disponible: no hay nada que limpiar */
  }

  // Al volver desde el bfcache (botón atrás, cambio de app) la página
  // conservaría el estado en memoria: se fuerza una carga limpia.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) window.location.reload();
  });

  // Sin este listener, Safari iOS no aplica :active a un toque (solo al
  // mouse), así que los botones se sentirían "muertos" hasta soltar el dedo.
  document.addEventListener('touchstart', function () {}, { passive: true });

  /* ---------------------------------------------------------------
     Interacción: un único punto de entrada para todos los botones
     --------------------------------------------------------------- */

  /**
   * Conecta un botón a su acción con feedback táctil inmediato.
   * @param {HTMLElement} btn      el <button> real
   * @param {Function}    action   qué hacer al activarlo
   * @param {Object}      [opts]
   * @param {boolean}     [opts.once=true]  si true, solo se ejecuta una vez
   */
  function bindAction(btn, action, opts) {
    if (!btn) return;
    const once = !opts || opts.once !== false;
    let spent = false;
    let releaseTimer = null;

    // Feedback en pointerdown: se ve apenas el dedo toca, sin esperar
    // al click (que en iOS llega recién al soltar).
    btn.addEventListener(
      'pointerdown',
      () => {
        if (spent) return;
        btn.classList.add('pressed');
        clearTimeout(releaseTimer);
        releaseTimer = setTimeout(() => btn.classList.remove('pressed'), 260);
      },
      { passive: true }
    );

    const release = () => {
      clearTimeout(releaseTimer);
      btn.classList.remove('pressed');
    };
    btn.addEventListener('pointerup', release, { passive: true });
    btn.addEventListener('pointercancel', release, { passive: true });
    btn.addEventListener('pointerleave', release, { passive: true });

    btn.addEventListener('click', (event) => {
      event.preventDefault();
      if (spent) return;
      if (once) spent = true;
      action();
    });
  }

  /* ---------------------------------------------------------------
     Fábrica de flores SVG
     --------------------------------------------------------------- */
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  function createFlower({
    size = 96,
    outerColor = '#d9a9ad',
    innerColor = '#f4dde1',
    centerColor = '#c6a15b',
    outerCount = 6,
    innerCount = 5,
  } = {}) {
    const svg = el('svg', {
      viewBox: '0 0 120 120',
      width: size,
      height: size,
      class: 'flower',
      'aria-hidden': 'true',
    });

    // Nota: un <g> no puede tener a la vez atributo SVG `transform` y CSS
    // `transform` (el CSS gana y el atributo se ignora). Por eso el
    // posicionamiento en el centro (60,60) vive en un grupo envolvente
    // separado del grupo que recibe la animación CSS de apertura.
    const outerGroup = el('g', { class: 'outer-petals' });
    for (let i = 0; i < outerCount; i++) {
      const angle = (360 / outerCount) * i + (i % 2 === 0 ? -3 : 3);
      const anchor = el('g', { transform: 'translate(60,60)' });
      const g = el('g', { class: 'petal' });
      g.style.setProperty('--rot', `${angle}deg`);
      g.style.setProperty('--delay', `${(i * 0.06).toFixed(2)}s`);
      const path = el('path', {
        d: 'M0,0 C-13,-15 -12,-35 0,-47 C12,-35 13,-15 0,0 Z',
        fill: outerColor,
        opacity: '0.95',
      });
      g.appendChild(path);
      anchor.appendChild(g);
      outerGroup.appendChild(anchor);
    }

    const innerGroup = el('g', { class: 'inner-petals' });
    for (let i = 0; i < innerCount; i++) {
      const angle = (360 / innerCount) * i + 22;
      const anchor = el('g', { transform: 'translate(60,60)' });
      const g = el('g', { class: 'petal-inner' });
      g.style.setProperty('--rot', `${angle}deg`);
      g.style.setProperty('--delay', `${(i * 0.05).toFixed(2)}s`);
      const path = el('path', {
        d: 'M0,0 C-9,-10 -8,-24 0,-31 C8,-24 9,-10 0,0 Z',
        fill: innerColor,
      });
      g.appendChild(path);
      anchor.appendChild(g);
      innerGroup.appendChild(anchor);
    }

    const stamen = el('circle', {
      class: 'stamen',
      cx: '60',
      cy: '60',
      r: '4.5',
      fill: centerColor,
    });

    svg.appendChild(outerGroup);
    svg.appendChild(innerGroup);
    svg.appendChild(stamen);

    // fill-box para que el pivote de rotación sea la base de cada pétalo
    svg.querySelectorAll('.petal, .petal-inner').forEach((g) => {
      g.style.transformBox = 'fill-box';
    });

    return svg;
  }

  const styleNoAnim = document.createElement('style');
  styleNoAnim.textContent = '.flower.no-anim, .flower.no-anim * { transition: none !important; }';
  document.head.appendChild(styleNoAnim);

  function bloomInstant(svg) {
    svg.classList.add('no-anim', 'bloom');
    svg.getBoundingClientRect(); // fuerza reflow antes de rehabilitar transiciones
    requestAnimationFrame(() => svg.classList.remove('no-anim'));
  }

  /* ---------------------------------------------------------------
     Construcción de las flores
     --------------------------------------------------------------- */

  const portadaFlower = createFlower({ size: 108 });
  document.getElementById('portada-flower').appendChild(portadaFlower);

  const finalFlower = createFlower({ size: 132 });
  document.getElementById('final-flower').appendChild(finalFlower);
  if (!reduceMotion) finalFlower.classList.add('sway');

  const gardenPalettes = [
    { outerColor: '#e7c3c8', innerColor: '#f6efe2', centerColor: '#c6a15b' },
    { outerColor: '#c98f96', innerColor: '#f4dde1', centerColor: '#c6a15b' },
    { outerColor: '#f2e6d8', innerColor: '#f4dde1', centerColor: '#d8bd8a' },
    { outerColor: '#d9a9ad', innerColor: '#f6efe2', centerColor: '#c6a15b' },
    { outerColor: '#f4dde1', innerColor: '#d9a9ad', centerColor: '#c6a15b' },
  ];

  const gardenButtons = Array.from(document.querySelectorAll('.garden-flower'));
  const gardenFlowers = gardenButtons.map((btn, i) => {
    const svg = createFlower({ size: 62, ...gardenPalettes[i] });
    btn.querySelector('.flower-host').appendChild(svg);
    return svg;
  });

  document.getElementById('her-flower')
    .appendChild(createFlower({ size: 40, outerCount: 5, innerCount: 4 }));
  document.getElementById('me-flower')
    .appendChild(createFlower({ size: 40, outerCount: 5, innerCount: 4 }));

  const envelopeFlower = createFlower({ size: 46, outerCount: 6, innerCount: 5 });
  document.getElementById('envelope-flower').appendChild(envelopeFlower);
  bloomInstant(envelopeFlower);

  /* ---------------------------------------------------------------
     Música — arranca con el primer toque consciente (la flor de portada)
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

    // Se llama SIEMPRE dentro de un gesto del usuario: iOS exige que tanto
    // play() como la creación del AudioContext ocurran de forma síncrona ahí.
    start() {
      if (this.started || this.broken) return;
      this.started = true;

      // iOS deja `volume` de solo lectura. Se detecta escribiéndolo: si no
      // toma el valor, el fade se hace con Web Audio (que sí funciona ahí);
      // si toma, basta con el volumen del elemento — camino sin riesgo.
      audioEl.volume = 0;
      const volumeLocked = audioEl.volume !== 0;

      if (volumeLocked) this.setupWebAudio();

      const playPromise = audioEl.play();
      if (playPromise && playPromise.then) {
        playPromise.then(() => this.onPlaying()).catch(() => this.fail());
      } else {
        this.onPlaying();
      }

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
        audioEl.volume = TARGET_VOLUME; // sin fade, pero con sonido
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
      // Fade por volumen del elemento (navegadores que sí lo permiten).
      const startedAt = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - startedAt) / (FADE_SECONDS * 1000));
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

    // Si el MP3 falta o Safari rechaza la reproducción, la experiencia
    // sigue igual y no queda ningún control roto en pantalla.
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

  // rootMargin en vez de un threshold alto: hay escenas (la carta) mucho
  // más altas que el viewport, donde un umbral por proporción de área nunca
  // llegaría a cumplirse. Esto dispara al cruzar la franja central.
  const sceneObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in-view');
        const id = entry.target.id;
        if (sceneCallbacks[id] && !scenesEntered.has(id)) {
          scenesEntered.add(id);
          sceneCallbacks[id]();
        }
      });
    },
    { threshold: 0, rootMargin: '-15% 0px -15% 0px' }
  );
  document.querySelectorAll('.scene').forEach((scene) => sceneObserver.observe(scene));

  function scrollToScene(id) {
    const target = document.getElementById(id);
    if (target) target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  /* ---------------------------------------------------------------
     Escena 1 — Portada
     --------------------------------------------------------------- */

  const portadaBtn = document.getElementById('portada-flower-btn');
  const portadaHint = document.getElementById('portada-hint');

  bindAction(portadaBtn, () => {
    // Primer gesto consciente: también es el que puede iniciar la música.
    music.start();

    portadaBtn.classList.add('bloomed');
    portadaFlower.classList.add('bloom');
    portadaHint.classList.remove('show');
    portadaBtn.setAttribute('aria-label', 'La flor ya se abrió');

    if (!reduceMotion) setTimeout(() => portadaFlower.classList.add('sway'), 2200);
    setTimeout(() => scrollToScene('scene-tiempo'), reduceMotion ? 350 : 2100);
  });

  setTimeout(() => portadaHint.classList.add('show'), 900);

  /* ---------------------------------------------------------------
     Escena 2 — Nuestro tiempo
     --------------------------------------------------------------- */

  function runTimeSequence() {
    const years = document.getElementById('time-years');
    const months = document.getElementById('time-months');
    const choose = document.getElementById('time-choose');
    const petal = document.getElementById('time-petal');
    const d = reduceMotion ? 0 : 1;
    setTimeout(() => years.classList.add('show'), 200);
    setTimeout(() => months.classList.add('show'), 200 + 700 * d);
    setTimeout(() => choose.classList.add('show'), 200 + 1500 * d);
    setTimeout(() => petal.classList.add('show'), 200 + 2200 * d);
  }

  /* ---------------------------------------------------------------
     Pétalos secretos — opcionales, nunca bloquean el recorrido
     --------------------------------------------------------------- */

  function bindSecretPetal(btnId, phraseId, text) {
    const btn = document.getElementById(btnId);
    const phrase = document.getElementById(phraseId);
    if (!btn || !phrase) return;

    bindAction(btn, () => {
      btn.classList.add('discovered');
      phrase.textContent = text;
      requestAnimationFrame(() => phrase.classList.add('show'));
      setTimeout(() => phrase.classList.remove('show'), 3600);
    });
  }

  bindSecretPetal('time-petal-btn', 'time-secret-phrase', 'Qué suerte coincidir con vos.');
  bindSecretPetal('garden-petal-btn', 'garden-secret-phrase', 'Me seguís encantando.');

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
  const gardenContinue = document.getElementById('garden-continue');
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

    // once:false — se puede volver a tocar una flor ya abierta para releer
    // su mensaje; la apertura en sí solo ocurre la primera vez.
    bindAction(
      btn,
      () => {
        if (!openedFlowers.has(i)) {
          openedFlowers.add(i);
          svg.classList.add('bloom');
          btn.dataset.open = 'true';
          gardenHint.classList.remove('show');
          if (openedFlowers.size >= gardenData.length && !gardenContinue.classList.contains('show')) {
            gardenContinue.classList.add('show');
            setTimeout(() => gardenContinue.classList.add('invite'), 1700);
          }
        }
        showGardenMessage(i);
      },
      { once: false }
    );
  });

  bindAction(gardenContinue, () => scrollToScene('scene-distancia'), { once: false });

  // Sistema de descubrimiento: enseña una sola vez, con una microanimación
  // (no un ícono ni una flecha), que las flores se tocan.
  function pulseDiscovery(index) {
    const host = gardenButtons[index] && gardenButtons[index].querySelector('.flower-host');
    if (!host) return;
    host.classList.add('discovery-cue');
    setTimeout(() => host.classList.remove('discovery-cue'), 950);
  }

  function runGardenDiscovery() {
    setTimeout(() => {
      if (openedFlowers.size > 0) return;
      pulseDiscovery(0);
      gardenHint.classList.add('show');
      setTimeout(() => gardenHint.classList.remove('show'), 2800);
    }, 1000);

    // Segunda pista silenciosa, sin texto, si todavía no tocó nada.
    setTimeout(() => {
      if (openedFlowers.size === 0) pulseDiscovery(2);
    }, 6000);
  }

  /* ---------------------------------------------------------------
     Escena 4 — La distancia (secuencia narrativa de ~8s)
     --------------------------------------------------------------- */

  const distanceStage = document.getElementById('distance-stage');
  const distTexts = [
    document.getElementById('dist-text-1'),
    document.getElementById('dist-text-2'),
    document.getElementById('dist-text-3'),
  ];

  function runDistanceSequence() {
    if (reduceMotion) {
      distTexts.forEach((t) => t.classList.add('show'));
      distanceStage.dataset.state = 'together';
      return;
    }

    const at = (ms, fn) => setTimeout(fn, ms);

    at(300, () => distTexts[0].classList.add('show'));        // "…querernos también a la distancia."
    at(1400, () => { distanceStage.dataset.state = 'apart'; }); // se separan (2.6s)
    at(3600, () => { distanceStage.dataset.state = 'linked'; }); // aparece el hilo dorado
    at(3900, () => distTexts[1].classList.add('show'));        // "Unas cuantas horas de camino…"
    at(6000, () => { distanceStage.dataset.state = 'closing'; }); // vuelven a acercarse
    at(8200, () => {
      distanceStage.dataset.state = 'together';
      distTexts[2].classList.add('show');                      // "…pero nunca cambiaron dónde quiero estar."
    });
  }

  // Se observa el escenario (pequeño, siempre menor que el viewport) en
  // lugar de la sección: así la animación arranca justo cuando las dos
  // flores están realmente a la vista.
  const distanceObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        distanceObserver.disconnect(); // una sola vez por carga de página
        runDistanceSequence();
      });
    },
    { threshold: 0.6 }
  );
  distanceObserver.observe(distanceStage);

  /* ---------------------------------------------------------------
     Escena 5 — La carta
     --------------------------------------------------------------- */

  const envelope = document.getElementById('envelope');
  const envelopeBtn = document.getElementById('envelope-btn');
  const openLetterBtn = document.getElementById('open-letter');
  const letter = document.getElementById('letter');
  let letterOpened = false;

  function openLetter() {
    if (letterOpened) return;
    letterOpened = true;

    envelopeBtn.classList.add('opened');
    envelope.classList.add('open');           // solapa + hoja que sube
    envelopeBtn.disabled = true;
    openLetterBtn.classList.remove('show');

    // El sobre se desvanece cuando la hoja ya salió, y entonces entra la carta.
    setTimeout(() => envelopeBtn.classList.add('opening'), 20);
    setTimeout(() => letter.classList.add('show'), reduceMotion ? 250 : 1150);
    setTimeout(() => {
      envelopeBtn.style.display = 'none';
      openLetterBtn.style.display = 'none';
    }, reduceMotion ? 500 : 1700);
  }

  // El sobre entero y el texto "Abrir" hacen exactamente lo mismo.
  bindAction(envelopeBtn, openLetter);
  bindAction(openLetterBtn, openLetter);

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
    setTimeout(() => {
      finalMore.classList.add('show');
      setTimeout(() => finalMore.classList.add('invite'), 1700);
    }, 2600);
  }

  bindAction(finalMore, () => {
    finalMore.classList.remove('show', 'invite');

    const petal = finalFlower.querySelector('.outer-petals .petal');
    if (petal) {
      petal.classList.add('petal-fall');
      requestAnimationFrame(() => {
        setTimeout(() => petal.classList.add('falling'), 30);
      });
    }

    setTimeout(() => { finalMore.style.display = 'none'; }, 400);
    setTimeout(() => finalWhisper.classList.add('show'), reduceMotion ? 400 : 2200);
  });
})();
