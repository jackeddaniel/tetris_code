// Rendering and input. Rules live in engine.js, state and timing in game-state.js.
import { COLS, ROWS, PIECES, dropPosition } from './engine.js';
import {
  createGame, step, press, release, releaseAll, togglePause, level, upcoming,
  NEXT_COUNT, CLEAR_MS,
} from './game-state.js';

const CELL = 30;
const BOARD_W = COLS * CELL;
const BOARD_H = ROWS * CELL;
const PREVIEW_W = 110;
const PREVIEW_SLOT_H = 46;
const PREVIEW_CELL = 18;
const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ']);

// Key -> action. Letters are matched lower-case. Shift is a hold key too.
const KEY_ACTIONS = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'softDrop',
  ArrowUp: 'rotateCW',
  x: 'rotateCW',
  z: 'rotateCCW',
  ' ': 'hardDrop',
  c: 'hold',
  Shift: 'hold',
};
// Only these may fire again from the OS key repeat. Left/right repeat through the
// game's own delay (DAS/ARR); everything else is once per key press.
const OS_REPEATABLE = new Set(['softDrop']);

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const holdCanvas = document.getElementById('hold');
const holdCtx = holdCanvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const pauseBtn = document.getElementById('pause');

// Backing stores are scaled by devicePixelRatio so Retina screens stay sharp;
// drawing code keeps using CSS pixels.
let dpr = 0;
function sizeCanvas(cv, c, width, height) {
  cv.width = Math.round(width * dpr);
  cv.height = Math.round(height * dpr);
  cv.style.width = `${width}px`; // height follows from the aspect ratio
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function applyDpr() {
  const ratio = window.devicePixelRatio || 1;
  if (ratio === dpr) return;
  dpr = ratio;
  sizeCanvas(canvas, ctx, BOARD_W, BOARD_H);
  sizeCanvas(holdCanvas, holdCtx, PREVIEW_W, PREVIEW_SLOT_H);
  sizeCanvas(nextCanvas, nextCtx, PREVIEW_W, PREVIEW_SLOT_H * NEXT_COUNT);
}

applyDpr();
window.addEventListener('resize', applyDpr); // page zoom or moving to another screen changes the ratio

let game = createGame(Math.random, performance.now());

function restart() {
  game = createGame(Math.random, performance.now());
}

// --- Rendering -------------------------------------------------------------

const BOARD_BG = '#141418';
const GRID = '#1e1e24';
const FONT = getComputedStyle(document.body).fontFamily || 'sans-serif';

function drawBlock(c, x, y, size, color) {
  c.fillStyle = color;
  c.fillRect(x, y, size, size);
  // Light top/left edge and dark bottom/right edge give each block a slight bevel.
  c.fillStyle = 'rgba(255, 255, 255, 0.28)';
  c.fillRect(x, y, size, 3);
  c.fillRect(x, y, 3, size);
  c.fillStyle = 'rgba(0, 0, 0, 0.25)';
  c.fillRect(x, y + size - 3, size, 3);
  c.fillRect(x + size - 3, y, 3, size);
}

function drawCell(col, row, color) {
  drawBlock(ctx, col * CELL + 1, row * CELL + 1, CELL - 2, color);
}

function drawGhostCell(col, row, color) {
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = color;
  ctx.fillRect(col * CELL + 1, row * CELL + 1, CELL - 2, CELL - 2);
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = color;
  ctx.strokeRect(col * CELL + 2.5, row * CELL + 2.5, CELL - 5, CELL - 5);
  ctx.globalAlpha = 1;
}

function forEachFilled(p, fn) {
  p.shape.forEach((row, r) => row.forEach((filled, c) => {
    if (filled) fn(p.x + c, p.y + r);
  }));
}

function drawOverlay(title, lines) {
  const cx = BOARD_W / 2;
  const cy = BOARD_H / 2;
  ctx.fillStyle = 'rgba(10, 10, 14, 0.75)';
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText(title, cx, cy - 24);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = `14px ${FONT}`;
  lines.forEach((line, i) => ctx.fillText(line, cx, cy + 14 + i * 22));
}

function drawBoard(now) {
  ctx.fillStyle = BOARD_BG;
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);

  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < COLS; c++) { ctx.moveTo(c * CELL + 0.5, 0); ctx.lineTo(c * CELL + 0.5, BOARD_H); }
  for (let r = 1; r < ROWS; r++) { ctx.moveTo(0, r * CELL + 0.5); ctx.lineTo(BOARD_W, r * CELL + 0.5); }
  ctx.stroke();

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = game.board[r]?.[c];
      if (cell) drawCell(c, r, PIECES[cell]?.color ?? '#888');
    }
  }

  if (game.clearing) {
    // Full rows flash white and fade out before they're removed.
    const t = Math.min(1, (now - game.clearing.start) / CLEAR_MS);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * (1 - t)})`;
    for (const r of game.clearing.rows) ctx.fillRect(0, r * CELL, BOARD_W, CELL);
  } else if (!game.gameOver) {
    const color = PIECES[game.piece.type].color;
    forEachFilled(dropPosition(game.board, game.piece), (c, r) => drawGhostCell(c, r, color));
    forEachFilled(game.piece, (c, r) => drawCell(c, r, color));
  }

  if (game.gameOver) {
    drawOverlay('Game over', [
      `Score ${game.score.toLocaleString()} · Level ${level(game)}`,
      'Press Enter to play again',
    ]);
  } else if (game.paused) {
    drawOverlay('Paused', ['Press P to resume']);
  }
}

// A piece centred on its filled cells inside the slot at (0, slotY) of a preview canvas.
function drawPreview(c, type, slotY, alpha = 1) {
  const cells = [];
  PIECES[type].shape.forEach((row, r) => row.forEach((filled, col) => {
    if (filled) cells.push([col, r]);
  }));
  const minC = Math.min(...cells.map(([col]) => col));
  const maxC = Math.max(...cells.map(([col]) => col));
  const minR = Math.min(...cells.map(([, r]) => r));
  const maxR = Math.max(...cells.map(([, r]) => r));
  const ox = (PREVIEW_W - (maxC - minC + 1) * PREVIEW_CELL) / 2;
  const oy = slotY + (PREVIEW_SLOT_H - (maxR - minR + 1) * PREVIEW_CELL) / 2;
  c.globalAlpha = alpha;
  for (const [col, r] of cells) {
    drawBlock(c, ox + (col - minC) * PREVIEW_CELL + 1, oy + (r - minR) * PREVIEW_CELL + 1,
      PREVIEW_CELL - 2, PIECES[type].color);
  }
  c.globalAlpha = 1;
}

function drawSidePreviews() {
  holdCtx.clearRect(0, 0, PREVIEW_W, PREVIEW_SLOT_H);
  // Dimmed once you've used this piece's hold.
  if (game.hold) drawPreview(holdCtx, game.hold, 0, game.holdUsed ? 0.35 : 1);

  nextCtx.clearRect(0, 0, PREVIEW_W, PREVIEW_SLOT_H * NEXT_COUNT);
  upcoming(game).forEach((type, i) => drawPreview(nextCtx, type, i * PREVIEW_SLOT_H));
}

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

function render(now) {
  drawBoard(now);
  drawSidePreviews();
  setText(scoreEl, game.score.toLocaleString());
  setText(levelEl, String(level(game)));
  setText(linesEl, String(game.lines));
  setText(pauseBtn, game.gameOver ? 'Play again' : game.paused ? 'Resume' : 'Pause');
}

// --- Loop and input --------------------------------------------------------

function frame(now) {
  step(game, now);
  render(now);
  requestAnimationFrame(frame);
}

function keyOf(e) {
  const key = e.key ?? ''; // some synthetic events (autofill) have no key
  return key.length === 1 ? key.toLowerCase() : key;
}

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return; // leave editor shortcuts alone
  const key = keyOf(e);
  // Stop arrows/space from scrolling or "clicking" a focused button.
  if (GAME_KEYS.has(e.key)) e.preventDefault();

  if (key === 'p') {
    if (!e.repeat) togglePause(game, performance.now());
    return;
  }
  if (key === 'Enter') {
    if (!e.repeat && game.gameOver) restart();
    return;
  }

  const action = KEY_ACTIONS[key];
  if (!action) return;
  if (e.repeat && !OS_REPEATABLE.has(action)) return;
  press(game, action, performance.now());
});

window.addEventListener('keyup', (e) => {
  const action = KEY_ACTIONS[keyOf(e)];
  if (action) release(game, action, performance.now());
});

// Key-up events are lost when focus leaves the panel mid-press.
window.addEventListener('blur', () => releaseAll(game));

pauseBtn.addEventListener('click', () => {
  if (game.gameOver) restart();
  else togglePause(game, performance.now());
  pauseBtn.blur(); // keep keyboard input going to the game, not the button
});

requestAnimationFrame(frame);
