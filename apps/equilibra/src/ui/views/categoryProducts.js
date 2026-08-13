import { h } from '../../utils/dom.js';
import { getState, addCategory, setCategoryArchived, addProduct, setProductArchived } from '../../state/store.js';
import { openSheet } from '../components/sheet.js';
import { showToast } from '../components/toast.js';

export function openCategoryProductManager() {
  const container = h('div', {});

  function draw() {
    const state = getState();
    container.replaceChildren(
      h('div', { className: 'section-title' }, 'Categorías'),
      categoryList(state),
      addRow('Nueva categoría', async (name) => { await addCategory(name); showToast('Categoría creada'); draw(); }),

      h('div', { className: 'section-title' }, 'Productos frecuentes'),
      productList(state),
      addRow('Nuevo producto', async (name) => { await addProduct(name, null); showToast('Producto creado'); draw(); })
    );
  }

  function categoryList(state) {
    const cats = state.categories;
    if (cats.length === 0) return h('p', { className: 'faint' }, 'Sin categorías todavía.');
    return h(
      'div',
      { className: 'card' },
      [
        h(
          'div',
          { className: 'list' },
          cats.map((cat) =>
            h('div', { className: 'list-item' }, [
              h('div', { className: 'list-main' }, [h('div', { className: 'list-title' }, cat.name)]),
              h('button', {
                className: 'btn btn-secondary',
                style: { minHeight: '36px', padding: '0 12px', fontSize: '0.82rem' },
                onClick: async () => { await setCategoryArchived(cat.id, !cat.archived); draw(); },
              }, cat.archived ? 'Reactivar' : 'Archivar'),
            ])
          )
        ),
      ]
    );
  }

  function productList(state) {
    const products = state.products;
    if (products.length === 0) return h('p', { className: 'faint' }, 'Sin productos todavía.');
    return h(
      'div',
      { className: 'card' },
      [
        h(
          'div',
          { className: 'list' },
          products.map((product) => {
            const cat = state.categories.find((c) => c.id === product.categoryId);
            return h('div', { className: 'list-item' }, [
              h('div', { className: 'list-main' }, [
                h('div', { className: 'list-title' }, product.name),
                h('div', { className: 'list-sub' }, cat ? cat.name : 'Sin categoría'),
              ]),
              h('button', {
                className: 'btn btn-secondary',
                style: { minHeight: '36px', padding: '0 12px', fontSize: '0.82rem' },
                onClick: async () => { await setProductArchived(product.id, !product.archived); draw(); },
              }, product.archived ? 'Reactivar' : 'Archivar'),
            ]);
          })
        ),
      ]
    );
  }

  function addRow(placeholder, onAdd) {
    const input = h('input', { type: 'text', placeholder, 'aria-label': placeholder });
    return h('div', { className: 'row gap-8', style: { margin: '10px 0 20px' } }, [
      h('div', { style: { flex: 1 } }, input),
      h('button', {
        className: 'btn btn-secondary',
        onClick: async () => {
          const value = input.value.trim();
          if (!value) return;
          input.value = '';
          await onAdd(value);
        },
      }, 'Agregar'),
    ]);
  }

  draw();
  openSheet('Categorías y productos', container);
}
