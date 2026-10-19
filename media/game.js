// Rendering, input and the game loop. All rules live in engine.js.
import {
  COLS, ROWS, PIECES, PIECE_TYPES,
  createBoard, createPiece, canMove, lockPiece, rotate, clearLines, levelFor, dropInterval,
} from './engine.js';

const CELL = 30;
const LINE_SCORES = [0, 100, 300, 500, 800];
const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ']);

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const pauseBtn = document.getElementById('pause');

canvas.width = COLS * CELL;
canvas.height = ROWS * CELL;

let board, piece, score, lines, paused, gameOver, lastDrop;

function reset() {
  board = createBoard();
  piece = randomPiece();
  score = 0;
  lines = 0;
  paused = false;
  gameOver = false;
  lastDrop = performance.now();
  pauseBtn.textContent = 'Pause';
  updateStats();
}

function updateStats() {
  scoreEl.textContent = score.toLocaleString();
  levelEl.textContent = String(levelFor(lines));
  linesEl.textContent = String(lines);
}

function randomPiece() {
  return createPiece(PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)]);
}

// --- Actions ---------------------------------------------------------------

function tryMove(dx, dy) {
  if (!canMove(board, piece, dx, dy)) return false;
  piece = { ...piece, x: piece.x + dx, y: piece.y + dy };
  return true;
}

function tryRotate() {
  const rotated = rotate(piece);
  if (canMove(board, rotated, 0, 0)) piece = rotated;
}

function hardDrop() {
  // No real drop is longer than the board, so this bound also stops a
  // canMove that always returns true from hanging the webview.
  for (let i = 0; i < ROWS + 4 && tryMove(0, 1); i++) {}
  lock();
}

function lock() {
  const result = clearLines(lockPiece(board, piece));
  board = result.board;
  // Classic scoring: clearing more rows at once, and at higher levels, pays more.
  score += (LINE_SCORES[result.cleared] ?? 0) * levelFor(lines);
  lines += result.cleared;
  updateStats();
  piece = randomPiece();
  if (!canMove(board, piece, 0, 0)) {
    gameOver = true;
    pauseBtn.textContent = 'Play again';
  }
  lastDrop = performance.now();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  if (!paused) lastDrop = performance.now(); // don't drop the moment we resume
}

// --- Rendering -------------------------------------------------------------

const BOARD_BG = '#141418';
const GRID = '#1e1e24';
const FONT = getComputedStyle(document.body).fontFamily || 'sans-serif';

function drawCell(col, row, color) {
  const x = col * CELL + 1;
  const y = row * CELL + 1;
  const size = CELL - 2;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, size, size);
  // Light top/left edge and dark bottom/right edge give each block a slight bevel.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.fillRect(x, y, size, 3);
  ctx.fillRect(x, y, 3, size);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(x, y + size - 3, size, 3);
  ctx.fillRect(x + size - 3, y, 3, size);
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

function draw() {
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

  if (!gameOver) {
    const color = PIECES[piece.type].color;
    piece.shape.forEach((row, r) => row.forEach((filled, c) => {
      if (filled) drawCell(piece.x + c, piece.y + r, color);
    }));
  }

  if (gameOver) {
    drawOverlay('Game over', [`Score ${score.toLocaleString()} \u00b7 Level ${levelFor(lines)}`, 'Press Enter to play again']);
  } else if (paused) {
    drawOverlay('Paused', ['Press P to resume']);
  }
}

// --- Loop and input --------------------------------------------------------

function frame(now) {
  if (!paused && !gameOver && now - lastDrop >= dropInterval(levelFor(lines))) {
    if (!tryMove(0, 1)) lock();
    lastDrop = now;
  }
  draw();
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
  if (paused) return;

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
