import { h } from '../../utils/dom.js';
import { colorForSeed, initialsFor } from '../../utils/avatar.js';

export function avatarNode(person, { size = '' } = {}) {
  const classes = ['avatar', size, person.active === false ? 'inactive' : ''].filter(Boolean).join(' ');
  return h(
    'span',
    { className: classes, style: { background: colorForSeed(person.color || person.id) }, 'aria-hidden': 'true' },
    initialsFor(person.name)
  );
}
