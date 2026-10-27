# Tetris Beside

Tetris in a VS Code panel that opens beside your editor, the way Markdown preview does.
Play while something else (like Claude Code) runs in another pane.

Closing the panel resets the game, on purpose.

Works on macOS, Windows and Linux. Shortcuts below are written as **Ctrl+Shift+P**;
on macOS use **Cmd** instead of **Ctrl**.

## Requirements

- VS Code 1.90 or newer.
- Node.js 22 or newer, to build, test and package.
- The `code` command on your PATH, for the install and development commands:
  - **Windows:** the VS Code installer adds it by default.
  - **Linux:** the `.deb`/`.rpm`/Snap packages add it.
  - **macOS:** in VS Code, open the Command Palette (**Cmd+Shift+P**) and run
    **Shell Command: Install 'code' command in PATH**.

## Install

```sh
npm install
npm run install-local
```

That builds `tetris-beside.vsix` and installs it into your normal VS Code.
Then reload any open VS Code windows (**Ctrl+Shift+P** → **Developer: Reload Window**).

You can also install a `.vsix` by hand: in the Extensions view, open the **⋯** menu and
choose **Install from VSIX...**.

Run `npm run install-local` again after any change to update it.
To remove it: `code --uninstall-extension siddhant.tetris-beside`.

## Play

- Click **▶ Tetris** in the status bar (bottom right), or
- **Ctrl+Shift+P** → **Tetris: Play Beside**.

Running it again while the game is open just brings the panel to the front.
If keys don't respond, click inside the panel.

| Key | Action |
|---|---|
| ← / → | Move (hold to repeat) |
| ↓ | Soft drop |
| ↑ or X | Rotate clockwise |
| Z | Rotate counter-clockwise |
| Space | Hard drop |
| C or Shift | Hold piece (once per piece) |
| P (or the button) | Pause / resume |
| Enter (or the button) | Play again after game over |

**What's in the game:** a ghost outline where the piece will land, a hold slot, a preview of
the next three pieces, the "7-bag" randomizer (every set of seven pieces has one of each),
wall and floor kicks when you rotate, half a second of lock delay on the ground (moving or
rotating restarts it, up to 15 times), and a short flash when rows clear. Moves, rotations
and hold pressed during that flash are remembered and applied to the next piece.

**Speed:** you start at level 1 (one row every 0.8 s). Every 10 cleared lines is a new
level, about 10% faster, down to a minimum of 0.1 s per row.

**Score:** 100 / 300 / 500 / 800 points for clearing 1 / 2 / 3 / 4 rows at once,
multiplied by the current level. Dropping a piece yourself also pays: 1 point per row for
a soft drop, 2 per row for a hard drop.

## Settings

| Setting | Default | |
|---|---|---|
| `tetris.showStatusBarButton` | `true` | Show the ▶ Tetris status bar button |

## Development

**With F5:** open this folder in VS Code and press **F5** (on laptops where F5 controls
brightness or volume, hold **Fn**), or use **Run → Start Debugging**. This compiles the TypeScript and opens an
*Extension Development Host* window with the extension loaded and the debugger attached.

**From the terminal (no debugger)**, in the project folder:

```sh
npm run compile
code --extensionDevelopmentPath="$PWD"     # macOS, Linux, PowerShell
code --extensionDevelopmentPath="%CD%"     # Windows Command Prompt
```

After editing `src/extension.ts`, recompile and reload that window
(**Ctrl+Shift+P** → **Developer: Reload Window**). After editing files in `media/`,
just close and reopen the Tetris panel.

### Tests

The rules live in `media/engine.js` (spec: `test/engine.test.js`) and the timing and
scoring in `media/game-state.js` (spec: `test/game-state.test.js`). Only drawing and key
wiring in `media/game.js` are untested.

```sh
npm test
# one group only:
node --test --test-name-pattern="canMove" "test/**/*.test.js"
```

### Checking that the package installs cleanly

To test the `.vsix` like a fresh machine would, without touching your real VS Code,
install it into a throwaway profile:

macOS / Linux:

```sh
npm run package
T=/tmp/tetris-test
code --user-data-dir "$T/data" --extensions-dir "$T/ext" --install-extension tetris-beside.vsix
code --user-data-dir "$T/data" --extensions-dir "$T/ext" --list-extensions --show-versions
code --user-data-dir "$T/data" --extensions-dir "$T/ext"
```

Windows (PowerShell):

```powershell
npm run package
$T = "$env:TEMP\tetris-test"
code --user-data-dir "$T\data" --extensions-dir "$T\ext" --install-extension tetris-beside.vsix
code --user-data-dir "$T\data" --extensions-dir "$T\ext" --list-extensions --show-versions
code --user-data-dir "$T\data" --extensions-dir "$T\ext"
```

The second command should print `siddhant.tetris-beside@<version>`; the third opens a
clean VS Code window with only this extension. Check the ▶ Tetris button appears and the
game plays, then close the window and delete the `tetris-test` folder.

## Layout

| Path | What it is |
|---|---|
| `src/extension.ts` | Registers `tetris.start` and the status bar button, opens or reveals the webview panel, builds the HTML and CSP |
| `media/engine.js` | Pure game logic (board, pieces, collisions, rotation and kicks, line clears, drop position, 7-bag, speed). No DOM |
| `media/game-state.js` | Pure game state and timing (spawn, gravity, lock delay, key repeat, hold, scoring, clear flash, pause). Time is passed in, no DOM |
| `media/game.js` | Canvas rendering (hi-DPI), keyboard and button handling, animation loop. Feeds keys and timestamps to `game-state.js` |
| `media/style.css` | Panel styling, using your VS Code theme colors |
| `test/engine.test.js` | `node --test` spec for `engine.js` |
| `test/game-state.test.js` | `node --test` spec for `game-state.js` |
| `images/icon.png` | Extension and tab icon |
| `CONTEXT.md` | Project history, decisions and conventions |
