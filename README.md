# Tetris Beside

Tetris in a VS Code panel that opens beside your editor, the way Markdown preview does.
Play while something else (like Claude Code) runs in another pane.

Closing the panel resets the game, on purpose.

## Install

```sh
npm install
npm run install-local
```

That builds `tetris-beside.vsix` and installs it into your normal VS Code (needs the
`code` command on your PATH). Then reload any open VS Code windows
(**Cmd+Shift+P** → **Developer: Reload Window**).

Run `npm run install-local` again after any change to update it.
To remove it: `code --uninstall-extension siddhant.tetris-beside`.

## Play

- Click **▶ Tetris** in the status bar (bottom right), or
- **Cmd+Shift+P** → **Tetris: Play Beside**.

Running it again while the game is open just brings the panel to the front.
If keys don't respond, click inside the panel.

| Key | Action |
|---|---|
| ← / → | Move |
| ↓ | Soft drop |
| ↑ | Rotate clockwise |
| Space | Hard drop |
| P (or the button) | Pause / resume |
| Enter (or the button) | Play again after game over |

**Speed:** you start at level 1 (one row every 0.8 s). Every 10 cleared lines is a new
level, about 10% faster, down to a minimum of 0.1 s per row.

**Score:** 100 / 300 / 500 / 800 points for clearing 1 / 2 / 3 / 4 rows at once,
multiplied by the current level.

## Settings

| Setting | Default | |
|---|---|---|
| `tetris.showStatusBarButton` | `true` | Show the ▶ Tetris status bar button |

## Development

**With F5:** open this folder in VS Code and press **F5** (**fn+F5** on most Mac keyboards),
or use **Run → Start Debugging**. This compiles the TypeScript and opens an
*Extension Development Host* window with the extension loaded and the debugger attached.

**From the terminal (no debugger):**

```sh
npm run compile
code --extensionDevelopmentPath="$PWD"
```

After editing `src/extension.ts`, recompile and reload that window
(**Cmd+Shift+P** → **Developer: Reload Window**). After editing files in `media/`,
just close and reopen the Tetris panel.

### Tests

The game rules live in `media/engine.js`; `test/engine.test.js` is their spec.

```sh
npm test
# one group only:
node --test --test-name-pattern="canMove" "test/**/*.test.js"
```

### Checking that the package installs cleanly

To test the `.vsix` like a fresh machine would, without touching your real VS Code,
install it into a throwaway profile:

```sh
npm run package
code --user-data-dir /tmp/tetris-test/data --extensions-dir /tmp/tetris-test/ext \
     --install-extension tetris-beside.vsix
code --user-data-dir /tmp/tetris-test/data --extensions-dir /tmp/tetris-test/ext \
     --list-extensions --show-versions          # should print siddhant.tetris-beside@<version>
code --user-data-dir /tmp/tetris-test/data --extensions-dir /tmp/tetris-test/ext   # opens a clean window
```

In that clean window, check the ▶ Tetris button appears and the game plays.
Delete `/tmp/tetris-test` when done.

## Layout

| Path | What it is |
|---|---|
| `src/extension.ts` | Registers `tetris.start` and the status bar button, opens or reveals the webview panel, builds the HTML and CSP |
| `media/engine.js` | Pure game logic (board, pieces, collisions, rotation, line clears, speed). No DOM |
| `media/game.js` | Canvas rendering, game loop, keyboard and pause handling, score |
| `media/style.css` | Panel styling, using your VS Code theme colors |
| `test/engine.test.js` | `node --test` spec for `engine.js` |
| `images/icon.png` | Extension and tab icon |
