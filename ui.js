(function () {
  'use strict';

  const B = window.Backgammon;

  const els = {
    quads: {
      topLeft: document.getElementById('quad-top-left'),
      topRight: document.getElementById('quad-top-right'),
      bottomLeft: document.getElementById('quad-bottom-left'),
      bottomRight: document.getElementById('quad-bottom-right'),
    },
    bar: { white: document.getElementById('bar-white'), black: document.getElementById('bar-black') },
    off: { white: document.getElementById('off-white'), black: document.getElementById('off-black') },
    dice: document.getElementById('dice-area'),
    message: document.getElementById('message'),
    turn: document.getElementById('turn-indicator'),
    chips: { white: document.getElementById('chip-white'), black: document.getElementById('chip-black') },
    pips: { white: document.getElementById('pips-white'), black: document.getElementById('pips-black') },
    roll: document.getElementById('btn-roll'),
    undo: document.getElementById('btn-undo'),
    newGame: document.getElementById('btn-new'),
  };

  const pointEls = {};
  let game = B.createGame();
  let selected = null;

  const PIP_LAYOUT = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function buildBoard() {
    const layout = [
      { el: els.quads.topLeft, points: [13, 14, 15, 16, 17, 18], side: 'top' },
      { el: els.quads.topRight, points: [19, 20, 21, 22, 23, 24], side: 'top' },
      { el: els.quads.bottomLeft, points: [12, 11, 10, 9, 8, 7], side: 'bottom' },
      { el: els.quads.bottomRight, points: [6, 5, 4, 3, 2, 1], side: 'bottom' },
    ];
    for (const quad of layout) {
      for (const p of quad.points) {
        const el = document.createElement('div');
        el.className = 'point ' + quad.side + ' ' + (p % 2 === 0 ? 'light' : 'dark');
        el.dataset.point = String(p);
        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = p;
        el.appendChild(label);
        el.addEventListener('click', () => onLocationClick(p));
        quad.el.appendChild(el);
        pointEls[p] = el;
      }
    }
    for (const color of ['white', 'black']) {
      els.bar[color].addEventListener('click', () => onLocationClick('bar'));
      els.off[color].addEventListener('click', () => onLocationClick('off'));
    }
  }

  function makeChecker(color, count, showCount) {
    const c = document.createElement('div');
    c.className = 'checker ' + color;
    if (showCount) c.textContent = count;
    return c;
  }

  function renderStack(container, color, count, maxVisible, keepChildren) {
    const existing = keepChildren ? Array.from(container.children).filter(keepChildren) : [];
    container.innerHTML = '';
    existing.forEach((child) => container.appendChild(child));
    const visible = Math.min(count, maxVisible);
    for (let i = 0; i < visible; i++) {
      container.appendChild(makeChecker(color, count, i === visible - 1 && count > maxVisible));
    }
  }

  function renderDie(value, used) {
    const die = document.createElement('div');
    die.className = 'die' + (used ? ' used' : '');
    const on = PIP_LAYOUT[value];
    for (let i = 0; i < 9; i++) {
      const pip = document.createElement('span');
      pip.className = 'pip' + (on.includes(i) ? ' on' : '');
      die.appendChild(pip);
    }
    return die;
  }

  function renderDice() {
    els.dice.innerHTML = '';
    els.dice.classList.remove('on-left', 'on-right');
    if (game.phase !== 'move' || game.rolled.length !== 2) return;

    els.dice.classList.add(game.turn === 'white' ? 'on-right' : 'on-left');
    const [d1, d2] = game.rolled;
    if (d1 === d2) {
      const remaining = game.dice.length;
      for (let i = 0; i < 4; i++) els.dice.appendChild(renderDie(d1, i >= remaining));
    } else {
      const remaining = game.dice.slice();
      for (const d of [d1, d2]) {
        const idx = remaining.indexOf(d);
        const used = idx === -1;
        if (!used) remaining.splice(idx, 1);
        els.dice.appendChild(renderDie(d, used));
      }
    }
  }

  function renderTray(color) {
    const tray = els.off[color];
    const stack = tray.querySelector('.tray-stack');
    stack.innerHTML = '';
    const count = game.off[color];
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('div');
      piece.className = 'tray-piece ' + color;
      stack.appendChild(piece);
    }
    if (count > 0) {
      const label = document.createElement('div');
      label.className = 'tray-count';
      label.textContent = count;
      stack.appendChild(label);
    }
  }

  function clearHighlights() {
    for (let p = 1; p <= 24; p++) pointEls[p].classList.remove('movable', 'selected', 'target');
    for (const color of ['white', 'black']) {
      els.bar[color].classList.remove('movable', 'selected');
      els.off[color].classList.remove('target');
    }
  }

  function locationEl(loc) {
    if (loc === 'bar') return els.bar[game.turn];
    if (loc === 'off') return els.off[game.turn];
    return pointEls[loc];
  }

  function renderHighlights() {
    clearHighlights();
    if (game.phase !== 'move') return;
    const legal = B.legalMoves(game);

    if (selected !== null && legal.some((m) => m.from === selected)) {
      locationEl(selected).classList.add('selected');
      for (const m of legal) {
        if (m.from === selected) locationEl(m.to).classList.add('target');
      }
    } else {
      selected = null;
      for (const m of legal) locationEl(m.from).classList.add('movable');
    }
  }

  function render() {
    for (let p = 1; p <= 24; p++) {
      const n = game.points[p];
      const color = n > 0 ? 'white' : 'black';
      renderStack(pointEls[p], color, Math.abs(n), 5, (child) => child.classList.contains('label'));
    }
    for (const color of ['white', 'black']) {
      renderStack(els.bar[color], color, game.bar[color], 3);
      renderTray(color);
      els.pips[color].textContent = B.pipCount(game, color);
      els.chips[color].classList.toggle('active', game.turn === color && game.phase !== 'over');
    }

    renderDice();
    renderHighlights();

    els.message.textContent = game.message;
    els.message.classList.toggle('win', game.phase === 'over');

    if (game.phase === 'opening') els.turn.textContent = 'Roll to start';
    else if (game.phase === 'roll') els.turn.textContent = capitalize(game.turn) + ' to roll';
    else if (game.phase === 'move') {
      els.turn.textContent = capitalize(game.turn) + ' to move' +
        (game.bar[game.turn] > 0 ? ' (enter from the bar)' : '');
    }
    else els.turn.textContent = 'Game over';

    els.roll.disabled = !(game.phase === 'opening' || game.phase === 'roll');
    els.roll.textContent = game.phase === 'opening' ? 'Roll for first move' : 'Roll dice';
    els.undo.disabled = !(game.phase === 'move' && game.history.length > 0);
  }

  function onLocationClick(loc) {
    if (game.phase !== 'move') return;
    const legal = B.legalMoves(game);

    if (selected !== null) {
      const candidates = legal.filter((m) => m.from === selected && m.to === loc);
      if (candidates.length) {
        // Same origin and destination can be reached with different dice only
        // when bearing off; prefer spending the larger die on it.
        candidates.sort((a, b) => b.die - a.die);
        B.makeMove(game, candidates[0]);
        selected = null;
        render();
        return;
      }
    }

    if (legal.some((m) => m.from === loc)) {
      selected = selected === loc ? null : loc;
    } else {
      selected = null;
    }
    render();
  }

  function onRoll() {
    if (game.phase === 'opening') B.openingRoll(game);
    else if (game.phase === 'roll') B.roll(game);
    else return;
    selected = null;
    render();
  }

  function onUndo() {
    if (B.undoTurn(game)) {
      selected = null;
      render();
    }
  }

  function onNewGame() {
    const inProgress = game.phase === 'roll' || game.phase === 'move';
    if (inProgress && !window.confirm('Start a new game? The current game will be lost.')) return;
    game = B.createGame();
    selected = null;
    render();
  }

  els.roll.addEventListener('click', onRoll);
  els.undo.addEventListener('click', onUndo);
  els.newGame.addEventListener('click', onNewGame);
  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'r' || e.key === 'R') onRoll();
    if (e.key === 'u' || e.key === 'U') onUndo();
    if (e.key === 'Escape') {
      selected = null;
      render();
    }
  });

  buildBoard();
  render();
})();
