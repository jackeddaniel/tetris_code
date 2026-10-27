// Pure Tetris logic. No DOM access: this file runs in the webview *and* under `node --test`.
//
// Board: an array of ROWS rows, each an array of COLS cells, indexed board[row][col].
//   Row 0 is the top. A cell is 0 when empty, or a piece type letter ('I', 'O', ...)
//   once a piece has been locked there (the renderer uses the letter to pick a color).
//
// Piece: { type, shape, x, y }
//   type:  one of PIECE_TYPES.
//   shape: square matrix of 0/1, indexed shape[r][c]; 1 means the cell is filled.
//   x, y:  board column/row of the shape's top-left corner. The filled cell at
//          shape[r][c] sits on board[y + r][x + c]. x/y may be negative, since empty
//          rows/columns of the shape are allowed to hang off the board.
//
// All functions are pure: they return new values and never mutate their arguments.

export const COLS = 10;
export const ROWS = 20;

// Spawn orientations (SRS). I is 4x4, O is 2x2, the rest are 3x3.
export const PIECES = {
  I: { color: '#00c8e0', shape: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]] },
  O: { color: '#f0d000', shape: [[1, 1], [1, 1]] },
  T: { color: '#a040f0', shape: [[0, 1, 0], [1, 1, 1], [0, 0, 0]] },
  S: { color: '#30d040', shape: [[0, 1, 1], [1, 1, 0], [0, 0, 0]] },
  Z: { color: '#f03030', shape: [[1, 1, 0], [0, 1, 1], [0, 0, 0]] },
  J: { color: '#3060f0', shape: [[1, 0, 0], [1, 1, 1], [0, 0, 0]] },
  L: { color: '#f09000', shape: [[0, 0, 1], [1, 1, 1], [0, 0, 0]] },
};

export const PIECE_TYPES = Object.keys(PIECES);

/** New piece of `type` at its spawn position (top row, horizontally centred). Helper: already done. */
export function createPiece(type) {
  const shape = PIECES[type].shape.map((row) => [...row]);
  return { type, shape, x: Math.floor((COLS - shape.length) / 2), y: 0 };
}

// ---------------------------------------------------------------------------
// Core rules. The tests in test/engine.test.js are the spec.
// ---------------------------------------------------------------------------

/**
 * An empty board: ROWS arrays of COLS zeros.
 * Every row must be its own array (watch out for `new Array(ROWS).fill(row)`),
 * and every call must return a fresh board.
 *
 * @returns {(0|string)[][]}
 */
export function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

/**
 * Could `piece` move by (dx, dy) without colliding?
 * Return false if any FILLED cell of the shape (ignore the 0s) would land:
 *   - outside the board (left of column 0, right of column COLS-1,
 *     below row ROWS-1, or above row 0), or
 *   - on a board cell that is not 0.
 * Otherwise return true. canMove(board, piece, 0, 0) asks "is this position valid?".
 *
 * @param {(0|string)[][]} board
 * @param {{type: string, shape: number[][], x: number, y: number}} piece
 * @param {number} dx  columns to the right (negative = left)
 * @param {number} dy  rows down
 * @returns {boolean}
 */
export function canMove(board, piece, dx, dy) {
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue;
      const row = piece.y + r + dy;
      const col = piece.x + c + dx;
      if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
      if (board[row][col] !== 0) return false;
    }
  }
  return true;
}

/**
 * Returns a NEW board with the piece's filled cells written in as piece.type.
 * Do not mutate `board` (copy the rows you change, or all of them).
 * You can assume the piece is in a valid position.
 *
 * @param {(0|string)[][]} board
 * @param {{type: string, shape: number[][], x: number, y: number}} piece
 * @returns {(0|string)[][]}
 */
export function lockPiece(board, piece) {
  const next = board.map((row) => [...row]);
  piece.shape.forEach((shapeRow, r) => shapeRow.forEach((filled, c) => {
    if (filled) next[piece.y + r][piece.x + c] = piece.type;
  }));
  return next;
}

/**
 * Returns a NEW piece rotated 90 degrees clockwise: same type, x and y,
 * new shape matrix. For a square N x N matrix, clockwise rotation is
 *   rotated[r][c] = shape[N - 1 - c][r]
 * Does not mutate `piece.shape`. (O is 2x2, so it comes out unchanged.)
 * No wall kicks: see rotateWithKicks.
 *
 * @param {{type: string, shape: number[][], x: number, y: number}} piece
 * @returns {{type: string, shape: number[][], x: number, y: number}}
 */
export function rotate(piece) {
  const n = piece.shape.length;
  const shape = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => piece.shape[n - 1 - c][r]));
  return { ...piece, shape };
}

/**
 * Same as `rotate` but 90 degrees counter-clockwise:
 *   rotated[r][c] = shape[c][N - 1 - r]
 */
export function rotateCCW(piece) {
  const n = piece.shape.length;
  const shape = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => piece.shape[c][n - 1 - r]));
  return { ...piece, shape };
}

/**
 * Removes every full row (no 0 cells), shift the rows above it down,
 * and add empty rows at the top so the board is still ROWS tall.
 * Return the new board and how many rows were cleared. Do not mutate `board`.
 *
 * @param {(0|string)[][]} board
 * @returns {{board: (0|string)[][], cleared: number}}
 */
export function clearLines(board) {
  const kept = board.filter((row) => row.some((cell) => cell === 0)).map((row) => [...row]);
  const cleared = ROWS - kept.length;
  const empty = Array.from({ length: cleared }, () => Array(COLS).fill(0));
  return { board: [...empty, ...kept], cleared };
}

// ---------------------------------------------------------------------------
// Speed. Level 1 drops a row every 800 ms; each level (10 lines) is ~10% faster,
// bottoming out at 100 ms so it stays playable.
// ---------------------------------------------------------------------------

export const LINES_PER_LEVEL = 10;

/** Level for a total number of cleared lines, starting at 1. */
export function levelFor(lines) {
  return 1 + Math.floor(lines / LINES_PER_LEVEL);
}

/** Milliseconds between automatic one-row drops at `level`. */
export function dropInterval(level) {
  return Math.max(100, Math.round(800 * 0.9 ** (level - 1)));
}

// ---------------------------------------------------------------------------
// Helpers for the game loop: hard drop / ghost, wall kicks, line-clear effect
// and the piece randomizer.
// ---------------------------------------------------------------------------

/** The piece moved straight down as far as it can go. Used for hard drop and the ghost. */
export function dropPosition(board, piece) {
  let dy = 0;
  while (canMove(board, piece, 0, dy + 1)) dy++;
  return { ...piece, y: piece.y + dy };
}

// Offsets tried, in order, when a rotation collides: stay, nudge left/right one
// then two cells (two is needed for the I piece), then up one (floor kick).
const KICKS = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]];

/**
 * Rotate (clockwise by default, or `'ccw'`), shifting the piece if that's what it
 * takes to fit. Null if nothing fits.
 */
export function rotateWithKicks(board, piece, direction = 'cw') {
  const rotated = direction === 'ccw' ? rotateCCW(piece) : rotate(piece);
  for (const [dx, dy] of KICKS) {
    if (canMove(board, rotated, dx, dy)) return { ...rotated, x: rotated.x + dx, y: rotated.y + dy };
  }
  return null;
}

/** Indices of the rows that are full, top to bottom. */
export function fullRows(board) {
  const rows = [];
  board.forEach((row, r) => {
    if (row.every((cell) => cell !== 0)) rows.push(r);
  });
  return rows;
}

/**
 * "7-bag" randomizer: all seven piece types in a random order (Fisher-Yates
 * shuffle). Dealing pieces bag by bag means you never wait more than 12 pieces
 * for any type. `random` is injectable so tests can make it deterministic.
 */
export function createBag(random = Math.random) {
  const bag = [...PIECE_TYPES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}
