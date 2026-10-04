# Backgammon

A simple two-player (hot-seat) backgammon game that runs in the browser with no build step or dependencies.

## Play

Open `index.html` directly in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

1. Click **Roll for first move**. Each side rolls one die; the higher roll moves first using both dice.
2. Checkers that can legally move are outlined. Click one, then click the highlighted destination point (or the bear-off tray).
3. When both dice are used (or no further move is possible) the turn passes automatically. Click **Roll dice** for the next player.
4. **Undo** reverts all moves made so far this turn.

Keyboard shortcuts: `R` roll, `U` undo, `Esc` deselect.

## Rules implemented

- Standard starting position; White moves 24 → 1, Black moves 1 → 24.
- Hitting blots, entering from the bar before any other move, blocked points (two or more opposing checkers).
- Doubles grant four moves.
- A player must use as many dice as possible; if only one die can be played, the higher one must be used.
- Bearing off only once all 15 checkers are in the home board, including the exact-roll and "furthest checker" overshoot rules.
- Win detection with single / gammon / backgammon result. No doubling cube.

## Files

- `game.js` – rules engine (pure logic, no DOM). Also loadable from Node via `require('./game.js')`.
- `ui.js` – rendering and click handling.
- `index.html`, `style.css` – page and board styling.
