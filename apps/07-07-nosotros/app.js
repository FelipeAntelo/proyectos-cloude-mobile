(() => {
  'use strict';

  const SLUG = '07-07-nosotros';
  const NS = `pwa-lab:${SLUG}:`;

  /* ---------------------------------------------------------------
     Almacenamiento (namespaced, con defaults seguros)
     --------------------------------------------------------------- */
  const storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(NS + key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(NS + key, JSON.stringify(value));
      } catch (e) {
        /* almacenamiento no disponible: la experiencia sigue funcionando sin persistencia */
      }
    },
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  function bloomInstant(svg) {
    // abre la flor sin transición (para restaurar estado ya visto)
    svg.classList.add('no-anim');
    svg.classList.add('bloom');
    // eslint-disable-next-line no-unused-expressions
    svg.getBoundingClientRect();
    requestAnimationFrame(() => svg.classList.remove('no-anim'));
  }

  const styleNoAnim = document.createElement('style');
  styleNoAnim.textContent = '.flower.no-anim, .flower.no-anim * { transition: none !important; }';
  document.head.appendChild(styleNoAnim);

  /* ---------------------------------------------------------------
     Construcción de flores en pantalla
     --------------------------------------------------------------- */
  const portadaFlowerHost = document.getElementById('portada-flower');
  const portadaFlower = createFlower({ size: 108 });
  portadaFlowerHost.appendChild(portadaFlower);

  const finalFlowerHost = document.getElementById('final-flower');
  const finalFlower = createFlower({ size: 132 });
  finalFlowerHost.appendChild(finalFlower);
  if (!reduceMotion) finalFlower.classList.add('sway');

  const gardenPalettes = [
    { outerColor: '#e7c3c8', innerColor: '#f6efe2', centerColor: '#c6a15b' },
    { outerColor: '#c98f96', innerColor: '#f4dde1', centerColor: '#c6a15b' },
    { outerColor: '#f2e6d8', innerColor: '#f4dde1', centerColor: '#d8bd8a' },
    { outerColor: '#d9a9ad', innerColor: '#f6efe2', centerColor: '#c6a15b' },
    { outerColor: '#f4dde1', innerColor: '#d9a9ad', centerColor: '#c6a15b' },
  ];

  const gardenFlowers = Array.from(document.querySelectorAll('.garden-flower')).map((wrap, i) => {
    const host = wrap.querySelector('.flower-host');
    const svg = createFlower({ size: 62, ...gardenPalettes[i] });
    host.appendChild(svg);
    return svg;
  });

  const herFlowerHost = document.getElementById('her-flower');
  const herFlower = createFlower({ size: 40, outerCount: 5, innerCount: 4 });
  herFlowerHost.appendChild(herFlower);

  const meFlowerHost = document.getElementById('me-flower');
  const meFlower = createFlower({ size: 40, outerCount: 5, innerCount: 4 });
  meFlowerHost.appendChild(meFlower);

  const envelopeFlowerHost = document.getElementById('envelope-flower');
  const envelopeFlower = createFlower({ size: 46, outerCount: 6, innerCount: 5 });
  envelopeFlowerHost.appendChild(envelopeFlower);
  bloomInstant(envelopeFlower);

  /* ---------------------------------------------------------------
     Revelado de escenas al hacer scroll
     --------------------------------------------------------------- */
  const scenes = document.querySelectorAll('.scene');
  // rootMargin en lugar de threshold: algunas escenas (la carta) son mucho
  // más altas que la pantalla, así que un umbral por proporción de área
  // nunca se cumpliría. Se dispara al cruzar la franja central del viewport.
  const sceneObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          onSceneEnter(entry.target.id);
        }
      });
    },
    { threshold: 0, rootMargin: '-35% 0px -35% 0px' }
  );
  scenes.forEach((scene) => sceneObserver.observe(scene));

  const enteredScenes = new Set();
  function onSceneEnter(id) {
    if (enteredScenes.has(id)) return;
    enteredScenes.add(id);
    if (id === 'scene-tiempo') runTimeSequence();
    if (id === 'scene-distancia') runDistanceSequence();
    if (id === 'scene-final') runFinalIntro();
  }

  function scrollToScene(id) {
    const target = document.getElementById(id);
    if (target) target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  /* ---------------------------------------------------------------
     Escena 1 — Portada
     --------------------------------------------------------------- */
  const portadaWrap = document.getElementById('portada-flower-wrap');
  const portadaHint = document.getElementById('portada-hint');

  function openPortada(fromRestore) {
    portadaFlower.classList.add('bloom');
    if (!reduceMotion) {
      setTimeout(() => portadaFlower.classList.add('sway'), 2200);
    }
    portadaHint.classList.remove('show');
    if (!fromRestore) {
      storage.set('portadaBloomed', true);
      setTimeout(() => scrollToScene('scene-tiempo'), reduceMotion ? 300 : 2100);
    }
  }

  portadaWrap.addEventListener('click', () => {
    if (portadaFlower.classList.contains('bloom')) return;
    portadaWrap.classList.add('pressed');
    setTimeout(() => portadaWrap.classList.remove('pressed'), 250);
    openPortada(false);
  });

  setTimeout(() => portadaHint.classList.add('show'), 900);

  if (storage.get('portadaBloomed', false)) {
    bloomInstant(portadaFlower);
    portadaHint.classList.remove('show');
  }

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
  let openedFlowers = new Set(storage.get('gardenOpened', []));

  function showGardenMessage(i) {
    gardenMessage.classList.remove('show');
    requestAnimationFrame(() => {
      gardenMsgTitle.textContent = gardenData[i].title;
      gardenMsgText.textContent = gardenData[i].text;
      requestAnimationFrame(() => gardenMessage.classList.add('show'));
    });
  }

  function maybeShowContinue() {
    if (openedFlowers.size >= gardenData.length) {
      gardenContinue.classList.add('show');
    }
  }

  document.querySelectorAll('.garden-flower').forEach((wrap, i) => {
    const svg = gardenFlowers[i];
    if (openedFlowers.has(i)) {
      bloomInstant(svg);
      wrap.dataset.open = 'true';
    }
    wrap.addEventListener('click', () => {
      if (!svg.classList.contains('bloom')) {
        svg.classList.add('bloom');
        wrap.dataset.open = 'true';
        openedFlowers.add(i);
        storage.set('gardenOpened', Array.from(openedFlowers));
        maybeShowContinue();
      }
      showGardenMessage(i);
    });
  });

  maybeShowContinue();

  gardenContinue.addEventListener('click', () => scrollToScene('scene-distancia'));

  /* ---------------------------------------------------------------
     Escena 4 — La distancia
     --------------------------------------------------------------- */
  const distanceStage = document.getElementById('distance-stage');
  const distanceLines = document.querySelectorAll('.distance-line-text');

  function runDistanceSequence() {
    const already = storage.get('distanceSeen', false);
    if (already || reduceMotion) {
      distanceLines.forEach((l) => l.classList.add('show'));
      distanceStage.classList.add('together');
      storage.set('distanceSeen', true);
      return;
    }
    setTimeout(() => distanceLines[0].classList.add('show'), 200);
    setTimeout(() => distanceStage.classList.add('apart'), 1200);
    setTimeout(() => distanceLines[1].classList.add('show'), 2400);
    setTimeout(() => {
      distanceStage.classList.remove('apart');
      distanceStage.classList.add('together');
    }, 4400);
    setTimeout(() => {
      distanceLines[2].classList.add('show');
      storage.set('distanceSeen', true);
    }, 6600);
  }

  /* ---------------------------------------------------------------
     Escena 5 — La carta
     --------------------------------------------------------------- */
  const envelope = document.getElementById('envelope');
  const envelopeWrap = document.getElementById('envelope-wrap');
  const openButton = document.getElementById('open-letter');
  const letter = document.getElementById('letter');

  function openLetter(fromRestore) {
    envelope.classList.add('open');
    letter.classList.add('show');
    if (fromRestore) {
      envelopeWrap.style.display = 'none';
      openButton.style.display = 'none';
    } else {
      storage.set('letterOpened', true);
      setTimeout(() => {
        envelopeWrap.style.display = 'none';
        openButton.style.display = 'none';
      }, 900);
    }
  }

  openButton.addEventListener('click', () => openLetter(false));

  if (storage.get('letterOpened', false)) {
    openLetter(true);
  }

  /* ---------------------------------------------------------------
     Escena 6 — Final
     --------------------------------------------------------------- */
  const finalLine1 = document.getElementById('final-line-1');
  const finalDate = document.getElementById('final-date');
  const finalMore = document.getElementById('final-more');
  const finalWhisper = document.getElementById('final-whisper');
  let finalPetal = null;

  function runFinalIntro() {
    bloomInstant(finalFlower);
    setTimeout(() => finalLine1.classList.add('show'), 300);
    setTimeout(() => finalDate.classList.add('show'), 1200);
    if (!storage.get('finalReached', false)) {
      setTimeout(() => finalMore.classList.add('show'), 2600);
    } else {
      revealWhisper(true);
    }
  }

  function pickFinalPetal() {
    const petals = finalFlower.querySelectorAll('.outer-petals .petal');
    return petals[0];
  }

  function revealWhisper(instant) {
    finalMore.style.display = 'none';
    if (instant) {
      finalWhisper.classList.add('show');
    } else {
      setTimeout(() => finalWhisper.classList.add('show'), 2200);
    }
  }

  finalMore.addEventListener('click', () => {
    if (storage.get('finalReached', false)) return;
    finalMore.classList.remove('show');
    finalPetal = pickFinalPetal();
    finalPetal.classList.add('petal-fall');
    requestAnimationFrame(() => {
      setTimeout(() => finalPetal.classList.add('falling'), 30);
    });
    storage.set('finalReached', true);
    revealWhisper(false);
  });

  if (storage.get('finalReached', false)) {
    setTimeout(() => {
      const p = pickFinalPetal();
      p.classList.add('petal-fall', 'falling');
    }, 50);
  }

  /* ---------------------------------------------------------------
     Audio — arquitectura opcional, discreta
     --------------------------------------------------------------- */
  const audioToggle = document.getElementById('audio-toggle');
  const bgAudio = document.getElementById('bg-audio');

  bgAudio.addEventListener(
    'error',
    () => {
      audioToggle.classList.remove('available');
    },
    true
  );

  bgAudio.addEventListener('canplaythrough', () => {
    audioToggle.classList.add('available');
  });

  audioToggle.addEventListener('click', () => {
    if (bgAudio.paused) {
      bgAudio.play().catch(() => {});
      audioToggle.dataset.playing = 'true';
    } else {
      bgAudio.pause();
      audioToggle.dataset.playing = 'false';
    }
  });

  bgAudio.load();
})();
