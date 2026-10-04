/*
 * Backgammon rules engine.
 *
 * Board model:
 *   points[1..24]  signed checker counts: positive = white, negative = black.
 *   White travels 24 -> 1 and bears off from points 1-6.
 *   Black travels 1 -> 24 and bears off from points 19-24.
 *
 * The engine is UI-agnostic and works both in the browser (window.Backgammon)
 * and in Node (module.exports) so the rules can be exercised without a DOM.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Backgammon = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WHITE = 'white';
  const BLACK = 'black';
  const DIR = { white: -1, black: 1 };

  function sign(color) {
    return color === WHITE ? 1 : -1;
  }

  function opponent(color) {
    return color === WHITE ? BLACK : WHITE;
  }

  function rollDie(rng) {
    return 1 + Math.floor(rng() * 6);
  }

  function startingPoints() {
    const points = new Array(25).fill(0);
    points[24] = 2;
    points[13] = 5;
    points[8] = 3;
    points[6] = 5;
    points[1] = -2;
    points[12] = -5;
    points[17] = -3;
    points[19] = -5;
    return points;
  }

  function createGame() {
    return {
      points: startingPoints(),
      bar: { white: 0, black: 0 },
      off: { white: 0, black: 0 },
      turn: null,
      // Dice still available to play this turn (doubles expand to four entries).
      dice: [],
      // The two dice as rolled, for display.
      rolled: [],
      phase: 'opening', // 'opening' | 'roll' | 'move' | 'over'
      winner: null,
      result: null, // 'single' | 'gammon' | 'backgammon'
      history: [],
      turnStart: null,
      message: 'Roll to decide who moves first.',
    };
  }

  function snapshot(state) {
    return {
      points: state.points.slice(),
      bar: { white: state.bar.white, black: state.bar.black },
      off: { white: state.off.white, black: state.off.black },
    };
  }

  function restore(state, snap) {
    state.points = snap.points.slice();
    state.bar = { white: snap.bar.white, black: snap.bar.black };
    state.off = { white: snap.off.white, black: snap.off.black };
  }

  function isHomePoint(color, p) {
    return color === WHITE ? p <= 6 : p >= 19;
  }

  function allInHome(board, color) {
    if (board.bar[color] > 0) return false;
    const s = sign(color);
    for (let p = 1; p <= 24; p++) {
      if (board.points[p] * s > 0 && !isHomePoint(color, p)) return false;
    }
    return true;
  }

  // True when no checker of `color` sits further from the bear-off edge than `p`.
  function isFurthestBack(board, color, p) {
    const s = sign(color);
    if (color === WHITE) {
      for (let q = p + 1; q <= 6; q++) if (board.points[q] * s > 0) return false;
    } else {
      for (let q = 19; q < p; q++) if (board.points[q] * s > 0) return false;
    }
    return true;
  }

  function singleMoves(board, color, die) {
    const s = sign(color);
    const dir = DIR[color];
    const pts = board.points;
    const moves = [];
    const canLand = (p) => pts[p] * s >= -1;

    if (board.bar[color] > 0) {
      const to = color === WHITE ? 25 - die : die;
      if (canLand(to)) moves.push({ from: 'bar', to, die, hit: pts[to] * s === -1 });
      return moves;
    }

    const home = allInHome(board, color);
    for (let p = 1; p <= 24; p++) {
      if (pts[p] * s <= 0) continue;
      const to = p + dir * die;
      if (to >= 1 && to <= 24) {
        if (canLand(to)) moves.push({ from: p, to, die, hit: pts[to] * s === -1 });
      } else if (home) {
        const exact = to === 0 || to === 25;
        if (exact || isFurthestBack(board, color, p)) {
          moves.push({ from: p, to: 'off', die, hit: false });
        }
      }
    }
    return moves;
  }

  function applyRaw(board, color, m) {
    const s = sign(color);
    if (m.from === 'bar') board.bar[color]--;
    else board.points[m.from] -= s;

    if (m.to === 'off') {
      board.off[color]++;
    } else {
      if (board.points[m.to] * s === -1) {
        board.points[m.to] = 0;
        board.bar[opponent(color)]++;
      }
      board.points[m.to] += s;
    }
  }

  // Enumerate every playable sequence for the given dice. Returns [[]] when
  // nothing can be played.
  function sequences(board, color, dice) {
    const results = [];
    const distinct = Array.from(new Set(dice));
    let any = false;
    for (const die of distinct) {
      for (const m of singleMoves(board, color, die)) {
        any = true;
        const next = snapshot(board);
        applyRaw(next, color, m);
        const rest = dice.slice();
        rest.splice(rest.indexOf(die), 1);
        for (const seq of sequences(next, color, rest)) results.push([m].concat(seq));
      }
    }
    if (!any) results.push([]);
    return results;
  }

  function moveKey(m) {
    return m.from + '>' + m.to + '#' + m.die;
  }

  // Legal first moves for the current player, honouring the rules that a
  // player must use as many dice as possible and, when only one die can be
  // played, must play the higher one if able.
  function legalMoves(state) {
    if (state.phase !== 'move' || !state.turn || state.dice.length === 0) return [];
    const seqs = sequences(state, state.turn, state.dice);
    let maxLen = 0;
    for (const s of seqs) if (s.length > maxLen) maxLen = s.length;
    if (maxLen === 0) return [];

    let best = seqs.filter((s) => s.length === maxLen);
    if (maxLen === 1 && state.dice.length === 2 && state.dice[0] !== state.dice[1]) {
      const hi = Math.max(state.dice[0], state.dice[1]);
      const hiOnly = best.filter((s) => s[0].die === hi);
      if (hiOnly.length) best = hiOnly;
    }

    const seen = new Map();
    for (const s of best) {
      const m = s[0];
      const key = moveKey(m);
      if (!seen.has(key)) seen.set(key, m);
    }
    return Array.from(seen.values());
  }

  function winType(state, winner) {
    const loser = opponent(winner);
    if (state.off[loser] > 0) return 'single';
    if (state.bar[loser] > 0) return 'backgammon';
    const s = sign(loser);
    for (let p = 1; p <= 24; p++) {
      if (state.points[p] * s > 0 && isHomePoint(winner, p)) return 'backgammon';
    }
    return 'gammon';
  }

  function capitalize(c) {
    return c.charAt(0).toUpperCase() + c.slice(1);
  }

  function endTurn(state) {
    state.turn = opponent(state.turn);
    state.dice = [];
    state.history = [];
    state.turnStart = null;
    state.phase = 'roll';
  }

  function beginMovePhase(state, d1, d2) {
    state.rolled = [d1, d2];
    state.dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    state.history = [];
    state.turnStart = snapshot(state);
    state.phase = 'move';
    if (legalMoves(state).length === 0) {
      const mover = capitalize(state.turn);
      endTurn(state);
      state.message = mover + ' rolled ' + d1 + '-' + d2 + ' but has no legal move. ' +
        capitalize(state.turn) + ' to roll.';
      return false;
    }
    state.message = capitalize(state.turn) + ' rolled ' + d1 + '-' + d2 + '.';
    return true;
  }

  // Each side rolls one die; higher roll moves first using both dice.
  function openingRoll(state, rng) {
    if (state.phase !== 'opening') throw new Error('Not in opening phase');
    rng = rng || Math.random;
    let w, b;
    do {
      w = rollDie(rng);
      b = rollDie(rng);
    } while (w === b);
    state.turn = w > b ? WHITE : BLACK;
    const first = capitalize(state.turn);
    const played = beginMovePhase(state, w, b);
    state.message = 'White rolled ' + w + ', Black rolled ' + b + '. ' + first + ' moves first.' +
      (played ? '' : ' ' + state.message);
    return { white: w, black: b };
  }

  function roll(state, rng) {
    if (state.phase !== 'roll') throw new Error('Not in roll phase');
    rng = rng || Math.random;
    const d1 = rollDie(rng);
    const d2 = rollDie(rng);
    beginMovePhase(state, d1, d2);
    return [d1, d2];
  }

  function makeMove(state, move) {
    const legal = legalMoves(state).find(
      (m) => m.from === move.from && m.to === move.to && (move.die == null || m.die === move.die)
    );
    if (!legal) throw new Error('Illegal move');

    const mover = state.turn;
    applyRaw(state, mover, legal);
    state.dice.splice(state.dice.indexOf(legal.die), 1);
    state.history.push(legal);

    if (state.off[mover] === 15) {
      state.phase = 'over';
      state.winner = mover;
      state.result = winType(state, mover);
      const label = state.result === 'single' ? '' : ' with a ' + state.result;
      state.message = capitalize(mover) + ' wins' + label + '!';
      return legal;
    }

    if (state.dice.length === 0 || legalMoves(state).length === 0) {
      const unused = state.dice.length;
      endTurn(state);
      state.message = capitalize(opponent(state.turn)) + ' moved.' +
        (unused ? ' No further moves were possible.' : '') +
        ' ' + capitalize(state.turn) + ' to roll.';
    }
    return legal;
  }

  function undoTurn(state) {
    if (state.phase !== 'move' || !state.turnStart || state.history.length === 0) return false;
    restore(state, state.turnStart);
    const [d1, d2] = state.rolled;
    state.dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    state.history = [];
    state.message = 'Move undone.';
    return true;
  }

  function pipCount(state, color) {
    const s = sign(color);
    let pips = state.bar[color] * 25;
    for (let p = 1; p <= 24; p++) {
      const n = state.points[p] * s;
      if (n > 0) pips += n * (color === WHITE ? p : 25 - p);
    }
    return pips;
  }

  return {
    WHITE,
    BLACK,
    createGame,
    openingRoll,
    roll,
    legalMoves,
    makeMove,
    undoTurn,
    pipCount,
    opponent,
  };
});
