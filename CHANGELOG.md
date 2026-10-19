# Changelog

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
