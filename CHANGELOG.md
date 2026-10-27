# Changelog

## 0.3.0

- Hold piece (C or Shift), once per piece.
- Counter-clockwise rotation (Z); X also rotates clockwise.
- Holding left/right repeats after a short delay at a steady rate, instead of relying on the OS key repeat.
- Moves, rotations and hold pressed during the line-clear flash are applied to the next piece.
- Next-piece preview shows three pieces.
- Soft drop scores 1 point per row, hard drop 2 per row.
- Sharp canvas on high-DPI screens.
- Fix: holding Space no longer hard-drops piece after piece, and holding Enter no longer restarts repeatedly.
- Fix: pausing during the line-clear flash no longer skips the flash.
- Game state and timing moved into `media/game-state.js` and covered by tests.

## 0.2.0

- Ghost piece: an outline shows where the current piece will land.
- Next-piece preview beside the board.
- 7-bag randomizer: pieces come in shuffled sets of all seven, so no long droughts.
- Wall and floor kicks: rotating against a wall or the floor nudges the piece to fit.
- Lock delay: a grounded piece waits 0.5 s before locking; moving or rotating it
  restarts the wait (up to 15 times).
- Rows flash briefly before they clear.

## 0.1.0

- Playable Tetris: collisions, locking, rotation, line clears, game over and restart.
- Gradual speed-up: about 10% faster every 10 lines, from 800 ms down to 100 ms per row.
- Score, level and lines shown beside the board; line-clear points scale with level.
- Status bar button to open the game (setting: `tetris.showStatusBarButton`).
- Extension and tab icon.

## 0.0.1

- Scaffold: webview panel beside the editor, strict CSP, engine stubs and tests.
