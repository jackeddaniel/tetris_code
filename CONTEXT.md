# Project context

Background for anyone (human or AI assistant) picking this project up: what it is, how it
got here, and why things are the way they are. The README covers how to install and play.

## What this is

**Tetris Beside** is a VS Code extension that opens a Tetris game in a webview panel next to
the editor (like Markdown preview), so you can play while something else, such as Claude Code,
runs in another pane.

The author is a CS student. The project started as a learning exercise: the scaffold was
generated, and the core game logic was left as stubs with failing tests for the author to
write. Later the author asked for the logic to be implemented, then for extra features.

## Ground rules from the original brief

These still apply unless the author says otherwise.

- **Dependencies:** `typescript`, `@types/vscode` and `@vscode/vsce` only (all dev dependencies).
  No runtime dependencies, no bundler, no test framework beyond Node's built-in `node --test`.
  (`@types/node` was tried once and removed for this reason, so `getNonce()` uses
  `Math.random` instead of `crypto`.)
- **Panel:** opens in `ViewColumn.Beside`. Running the command again reveals the existing
  panel instead of opening a second one.
- **No `retainContextWhenHidden`:** closing or hiding the panel resets the game. Intended.
- **Strict CSP:** `default-src 'none'`, scripts need the per-load nonce, and everything loads
  from `media/` through `webview.asWebviewUri`. No inline scripts, no external resources.
- **Pause is manual only** (P or the button). The game does not auto-pause when the panel
  loses focus.
- **Teaching mode:** the original rule was "don't implement the engine unless asked; give a
  hint or point at the failing test first". The author has since asked for everything to be
  implemented. If they want to practise again, offer stubs plus failing tests, not answers.

## Architecture

```
src/extension.ts     Extension host: command, status bar button, webview HTML + CSP
media/engine.js      Pure rules, no DOM: runs in the webview and under node --test
media/game.js        Webview: canvas rendering, game loop, input, timing-based behaviour
media/style.css      Panel layout, uses VS Code theme variables
test/engine.test.js  Spec for engine.js
```

- **One codebase for browser and tests:** `engine.js` is an ES module.
  `media/package.json` and `test/package.json` each contain `{"type": "module"}`, so Node
  treats those `.js` files as ESM, while the root package (and the compiled `out/extension.js`)
  stays CommonJS. `game.js` is loaded with `<script type="module">` and imports `./engine.js`.
- **CSP and modules:** nonces don't carry over to statically imported modules, so `script-src`
  allows `webview.cspSource` as well as the nonce. `localResourceRoots` limits that to `media/`.
- **Pure vs timed logic:** anything testable as a pure function goes in `engine.js` with tests.
  Behaviour that depends on time or input (gravity, lock delay, the clear flash, pause) lives
  in `game.js`.
- **Data model:** board is `board[row][col]`, row 0 at the top, cells are `0` or a piece
  letter. A piece is `{ type, shape, x, y }` with a square 0/1 `shape` matrix, and `x`/`y`
  give the top-left of the matrix (may be negative). Engine functions never mutate inputs.

## Game rules as implemented

| Rule | Where | Details |
|---|---|---|
| Pieces | `PIECES` | SRS spawn orientations; I is 4×4, O 2×2, the rest 3×3 |
| Rotation | `rotate` | Clockwise only: `rotated[r][c] = shape[N-1-c][r]` |
| Wall kicks | `rotateWithKicks` | Tries offsets (0,0), (−1,0), (+1,0), (−2,0), (+2,0), (0,−1). Simplified, not full SRS kick tables |
| Randomizer | `createBag` | 7-bag via Fisher-Yates; `random` is injectable for tests |
| Ghost / hard drop | `dropPosition` | Same function for both |
| Speed | `levelFor`, `dropInterval` | Level = 1 + lines/10; interval = max(100, 800 × 0.9^(level−1)) ms |
| Scoring | `game.js` | 100/300/500/800 for 1–4 rows, × current level |
| Lock delay | `game.js` | 500 ms once grounded; a successful move/rotate restarts it, max 15 times |
| Clear flash | `game.js` | Full rows flash white and fade over 220 ms; input is ignored meanwhile |
| Game over | `game.js` | A new piece can't spawn; Enter or the button restarts |

## How it was built (history)

1. **Scaffold (stage 1):** TypeScript extension, `tetris.start`, panel beside the editor,
   CSP with nonce. Verified with a placeholder `game.js` that printed "loaded".
2. **Webview shell (stage 2):** canvas (10×20 cells, 30 px), score, pause button,
   `engine.js` with the five core functions as stubs returning placeholder values so the
   game ran without crashing (pieces fell through the floor until `canMove` existed).
3. **Tests (stage 3):** 29 failing-first specs for the stubs (walls, floor, overlaps,
   single and multiple line clears, I/O/T rotation, no mutation).
4. **Packaging (stage 4):** README, `.vscodeignore`, `vsce package` script.
5. **Engine implemented** at the author's request; all tests passing.
6. **Polish (0.1.0):** gradual speed-up, level/lines display, status bar button and setting,
   icon, fixed `.vsix` name, `npm run install-local`, side-panel and canvas styling.
7. **Gameplay (0.2.0):** ghost piece, next preview, 7-bag, wall/floor kicks, lock delay,
   line-clear flash.

## How changes are verified

- `npm test` for engine rules (45 tests at 0.2.0).
- `npm run compile` for the extension.
- Install check without touching the real VS Code: install the `.vsix` into a throwaway
  `--user-data-dir`/`--extensions-dir` and list or open it (README has the commands).
- UI and timing: during development the panel was rendered in headless Chrome with mocked
  VS Code theme variables, and `game.js` was driven with a fake `performance.now()` to check
  lock delay, kicks, the clear flash, the bag and game over. Those harnesses were throwaway
  and are not in the repo.

## Environment notes (author's machine)

- macOS, zsh, Node 24. The `code` CLI was added to PATH via `~/.zshrc`
  (`/Applications/Visual Studio Code.app/Contents/Resources/app/bin`).
- The author prefers running the dev host from the terminal
  (`code --extensionDevelopmentPath="$PWD"`) over F5.
- npm blocks the install script of `@vscode/vsce-sign`; it's only needed for publishing.

## Open items and ideas

- License: `package.json` says MIT (an unconfirmed default) and there is no LICENSE file,
  hence `--skip-license`. Same for `--allow-missing-repository`.
- Not published to the Marketplace; publisher id `siddhant` is a placeholder.
- Ideas not done yet: high score saved via `globalState` (webview `localStorage` isn't
  reliable here), hold piece, full SRS kick tables, counter-clockwise rotation.
