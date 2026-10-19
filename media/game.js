// Rendering, input and the game loop. All rules live in engine.js.
import {
  COLS, ROWS, PIECES,
  createBoard, createPiece, canMove, lockPiece, clearLines, levelFor, dropInterval,
  dropPosition, rotateWithKicks, fullRows, createBag,
} from './engine.js';

const CELL = 30;
const NEXT_CELL = 22;
const LINE_SCORES = [0, 100, 300, 500, 800];
const LOCK_DELAY_MS = 500; // time a grounded piece waits before locking
const MAX_LOCK_RESETS = 15; // moves/rotations on the ground that restart that wait
const CLEAR_MS = 220; // length of the line-clear flash
const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ']);

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const pauseBtn = document.getElementById('pause');

canvas.width = COLS * CELL;
canvas.height = ROWS * CELL;

let board, piece, queue, score, lines, paused, gameOver, lastDrop;
let lockStart; // when the current piece touched down, or null while it's falling
let lockResets;
let clearing; // { rows, start } while full rows are flashing, else null

function reset() {
  board = createBoard();
  queue = [];
  score = 0;
  lines = 0;
  paused = false;
  gameOver = false;
  clearing = null;
  pauseBtn.textContent = 'Pause';
  updateStats();
  spawn();
}

function updateStats() {
  scoreEl.textContent = score.toLocaleString();
  levelEl.textContent = String(levelFor(lines));
  linesEl.textContent = String(lines);
}

function spawn() {
  if (queue.length < 2) queue.push(...createBag());
  piece = createPiece(queue.shift());
  lockStart = null;
  lockResets = 0;
  lastDrop = performance.now();
  drawNext();
  if (!canMove(board, piece, 0, 0)) {
    gameOver = true;
    pauseBtn.textContent = 'Play again';
  }
}

// --- Actions ---------------------------------------------------------------

// A successful move or rotation on the ground buys the player more time,
// up to MAX_LOCK_RESETS times so a piece can't be stalled forever.
function onPieceMoved() {
  if (lockStart !== null && lockResets < MAX_LOCK_RESETS) {
    lockStart = performance.now();
    lockResets++;
  }
}

function tryMove(dx, dy) {
  if (!canMove(board, piece, dx, dy)) return false;
  piece = { ...piece, x: piece.x + dx, y: piece.y + dy };
  onPieceMoved();
  return true;
}

function tryRotate() {
  const rotated = rotateWithKicks(board, piece);
  if (!rotated) return;
  piece = rotated;
  onPieceMoved();
}

function hardDrop() {
  piece = dropPosition(board, piece);
  lock();
}

function lock() {
  board = lockPiece(board, piece);
  const rows = fullRows(board);
  if (rows.length > 0) {
    clearing = { rows, start: performance.now() }; // finishClear() runs when the flash ends
  } else {
    spawn();
  }
}

function finishClear() {
  const result = clearLines(board);
  board = result.board;
  // Classic scoring: clearing more rows at once, and at higher levels, pays more.
  score += (LINE_SCORES[result.cleared] ?? 0) * levelFor(lines);
  lines += result.cleared;
  clearing = null;
  updateStats();
  spawn();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  if (!paused) {
    // Don't drop or lock the moment we resume.
    lastDrop = performance.now();
    if (lockStart !== null) lockStart = performance.now();
  }
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
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.fillStyle = 'rgba(10, 10, 14, 0.75)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText(title, cx, cy - 24);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = `14px ${FONT}`;
  lines.forEach((line, i) => ctx.fillText(line, cx, cy + 14 + i * 22));
}

function draw(now) {
  ctx.fillStyle = BOARD_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < COLS; c++) { ctx.moveTo(c * CELL + 0.5, 0); ctx.lineTo(c * CELL + 0.5, canvas.height); }
  for (let r = 1; r < ROWS; r++) { ctx.moveTo(0, r * CELL + 0.5); ctx.lineTo(canvas.width, r * CELL + 0.5); }
  ctx.stroke();

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = board[r]?.[c];
      if (cell) drawCell(c, r, PIECES[cell]?.color ?? '#888');
    }
  }

  if (clearing) {
    // Full rows flash white and fade out before they're removed.
    const t = Math.min(1, (now - clearing.start) / CLEAR_MS);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * (1 - t)})`;
    for (const r of clearing.rows) ctx.fillRect(0, r * CELL, canvas.width, CELL);
  } else if (!gameOver) {
    const color = PIECES[piece.type].color;
    forEachFilled(dropPosition(board, piece), (c, r) => drawGhostCell(c, r, color));
    forEachFilled(piece, (c, r) => drawCell(c, r, color));
  }

  if (gameOver) {
    drawOverlay('Game over', [`Score ${score.toLocaleString()} · Level ${levelFor(lines)}`, 'Press Enter to play again']);
  } else if (paused) {
    drawOverlay('Paused', ['Press P to resume']);
  }
}

// Next piece, centred on its filled cells in the small side canvas.
function drawNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const type = queue[0];
  const cells = [];
  PIECES[type].shape.forEach((row, r) => row.forEach((filled, c) => {
    if (filled) cells.push([c, r]);
  }));
  const minC = Math.min(...cells.map(([c]) => c));
  const maxC = Math.max(...cells.map(([c]) => c));
  const minR = Math.min(...cells.map(([, r]) => r));
  const maxR = Math.max(...cells.map(([, r]) => r));
  const ox = (nextCanvas.width - (maxC - minC + 1) * NEXT_CELL) / 2;
  const oy = (nextCanvas.height - (maxR - minR + 1) * NEXT_CELL) / 2;
  for (const [c, r] of cells) {
    drawBlock(nextCtx, ox + (c - minC) * NEXT_CELL + 1, oy + (r - minR) * NEXT_CELL + 1, NEXT_CELL - 2, PIECES[type].color);
  }
}

// --- Loop and input --------------------------------------------------------

function update(now) {
  if (clearing) {
    if (now - clearing.start >= CLEAR_MS) finishClear();
    return;
  }
  if (!canMove(board, piece, 0, 1)) {
    if (lockStart === null) lockStart = now;
    if (now - lockStart >= LOCK_DELAY_MS) lock();
    return;
  }
  lockStart = null; // slid off a ledge: falling again
  if (now - lastDrop >= dropInterval(levelFor(lines))) {
    piece = { ...piece, y: piece.y + 1 };
    lastDrop = now;
  }
}

function frame(now) {
  if (!paused && !gameOver) update(now);
  draw(now);
  requestAnimationFrame(frame);
}

window.addEventListener('keydown', (e) => {
  // Stop arrows/space from scrolling or "clicking" a focused button.
  if (GAME_KEYS.has(e.key)) e.preventDefault();

  if (e.key === 'p' || e.key === 'P') {
    if (!e.repeat) togglePause();
    return;
  }
  if (gameOver) {
    if (e.key === 'Enter') reset();
    return;
  }
  if (paused || clearing) return;

  switch (e.key) {
    case 'ArrowLeft': tryMove(-1, 0); break;
    case 'ArrowRight': tryMove(1, 0); break;
    case 'ArrowDown': if (tryMove(0, 1)) lastDrop = performance.now(); break;
    case 'ArrowUp': tryRotate(); break;
    case ' ': hardDrop(); break;
  }
});

pauseBtn.addEventListener('click', () => {
  if (gameOver) reset();
  else togglePause();
  pauseBtn.blur(); // keep keyboard input going to the game, not the button
});

reset();
requestAnimationFrame(frame);
