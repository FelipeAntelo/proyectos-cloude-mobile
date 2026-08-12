// Helper mínimo para construir DOM sin plantillas ni frameworks.
// h(tag, attrs, children) crea un elemento; attrs soporta className, dataset,
// atributos normales, y listeners `on*`. children acepta strings, nodos o arrays.

export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'className') {
      el.className = value;
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'html') {
      el.innerHTML = value;
    } else if (typeof value === 'boolean') {
      if (value) el.setAttribute(key, '');
    } else {
      el.setAttribute(key, value);
    }
  }

  appendChildren(el, children);
  return el;
}

// Exportado para reemplazar el `.append()` nativo del DOM en el resto de la app:
// a diferencia de `Element.append()`, este filtra `null`/`false`/`undefined` en
// vez de convertirlos en el texto literal "null" (una trampa fácil de pisar con
// children condicionales como `cond ? h(...) : null`).
export function appendChildren(el, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) {
      appendChildren(el, child);
    } else if (child instanceof Node) {
      el.appendChild(child);
    } else {
      el.appendChild(document.createTextNode(String(child)));
    }
  }
}

export function clear(el) {
  el.replaceChildren();
}

export function mount(root, node) {
  clear(root);
  root.appendChild(node);
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}
