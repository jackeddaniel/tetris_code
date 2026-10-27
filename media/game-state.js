// Game state and timing, with no DOM and no clock of its own: every function that
// cares about time takes `now` (milliseconds, any origin, must not go backwards).
// That makes lock delay, the clear flash, key repeat and pause testable with
// `node --test`; game.js only draws this state and feeds it keys and timestamps.
//
// engine.js stays pure (returns new values). Here a `game` object is mutated in place.
//
// game = {
//   board, piece (null while rows are flashing), queue (upcoming types), hold (type|null),
//   holdUsed, score, lines, paused, gameOver,
//   lastDrop, lockStart (null while falling), lockResets,
//   clearing: { rows, start } | null, buffer: actions pressed during the flash,
//   held: [-1|1] directions currently held, newest last, nextRepeat (ms|null), pausedAt,
//   random
// }
import {
  createBoard, createPiece, canMove, lockPiece, clearLines, levelFor, dropInterval,
  dropPosition, rotateWithKicks, fullRows, createBag,
} from './engine.js';

export const LINE_SCORES = [0, 100, 300, 500, 800];
export const SOFT_DROP_POINTS = 1; // per row, for rows you drop yourself
export const HARD_DROP_POINTS = 2; // per row
export const LOCK_DELAY_MS = 500; // time a grounded piece waits before locking
export const MAX_LOCK_RESETS = 15; // moves/rotations on the ground that restart that wait
export const CLEAR_MS = 220; // length of the line-clear flash
export const DAS_MS = 150; // holding left/right: wait this long before repeating...
export const ARR_MS = 40; // ...then move one column this often
export const NEXT_COUNT = 3; // pieces shown in the preview
export const MAX_BUFFERED = 8; // inputs remembered during the clear flash

/** Actions accepted by `press`. */
export const ACTIONS = ['left', 'right', 'softDrop', 'hardDrop', 'rotateCW', 'rotateCCW', 'hold'];
// Remembered during the flash and replayed on the next piece. Drops are not:
// a buffered hard drop would slam the new piece down before you've seen it.
const BUFFERED = new Set(['left', 'right', 'rotateCW', 'rotateCCW', 'hold']);
const DIRECTION = { left: -1, right: 1 };

export function createGame(random = Math.random, now = 0) {
  const game = {
    board: createBoard(),
    piece: null,
    queue: [],
    hold: null,
    holdUsed: false,
    score: 0,
    lines: 0,
    paused: false,
    gameOver: false,
    lastDrop: now,
    lockStart: null,
    lockResets: 0,
    clearing: null,
    buffer: [],
    held: [],
    nextRepeat: null,
    pausedAt: 0,
    random,
  };
  spawnNext(game, now);
  return game;
}

export function level(game) {
  return levelFor(game.lines);
}

/** The next NEXT_COUNT piece types, soonest first. */
export function upcoming(game) {
  return game.queue.slice(0, NEXT_COUNT);
}

// --- Spawning --------------------------------------------------------------

function refill(game) {
  while (game.queue.length < NEXT_COUNT + 1) game.queue.push(...createBag(game.random));
}

function spawnNext(game, now) {
  refill(game);
  const type = game.queue.shift();
  refill(game);
  spawnPiece(game, type, now);
}

function spawnPiece(game, type, now) {
  game.piece = createPiece(type);
  game.lockStart = null;
  game.lockResets = 0;
  game.lastDrop = now;
  if (!canMove(game.board, game.piece, 0, 0)) game.gameOver = true;
}

// --- Actions ---------------------------------------------------------------

// A successful move or rotation on the ground buys the player more time,
// up to MAX_LOCK_RESETS times so a piece can't be stalled forever.
function onPieceMoved(game, now) {
  if (game.lockStart !== null && game.lockResets < MAX_LOCK_RESETS) {
    game.lockStart = now;
    game.lockResets++;
  }
}

function tryMove(game, dx, dy, now) {
  if (!canMove(game.board, game.piece, dx, dy)) return false;
  game.piece = { ...game.piece, x: game.piece.x + dx, y: game.piece.y + dy };
  onPieceMoved(game, now);
  return true;
}

function tryRotate(game, direction, now) {
  const rotated = rotateWithKicks(game.board, game.piece, direction);
  if (!rotated) return;
  game.piece = rotated;
  onPieceMoved(game, now);
}

function hardDrop(game, now) {
  const landed = dropPosition(game.board, game.piece);
  game.score += (landed.y - game.piece.y) * HARD_DROP_POINTS;
  game.piece = landed;
  lock(game, now);
}

function softDrop(game, now) {
  if (!tryMove(game, 0, 1, now)) return;
  game.score += SOFT_DROP_POINTS;
  game.lastDrop = now;
}

// One hold per piece: swap with the held piece, or stash this one and take the next.
function holdPiece(game, now) {
  if (game.holdUsed) return;
  const type = game.piece.type;
  if (game.hold === null) {
    game.hold = type;
    spawnNext(game, now);
  } else {
    const swapped = game.hold;
    game.hold = type;
    spawnPiece(game, swapped, now);
  }
  game.holdUsed = true;
}

function lock(game, now) {
  game.board = lockPiece(game.board, game.piece);
  game.holdUsed = false;
  const rows = fullRows(game.board);
  if (rows.length > 0) {
    game.piece = null;
    game.clearing = { rows, start: now }; // finishClear() runs when the flash ends
  } else {
    spawnNext(game, now);
  }
}

function finishClear(game, now) {
  const result = clearLines(game.board);
  game.board = result.board;
  // Classic scoring: clearing more rows at once, and at higher levels, pays more.
  game.score += (LINE_SCORES[result.cleared] ?? 0) * level(game);
  game.lines += result.cleared;
  game.clearing = null;
  spawnNext(game, now);

  // A direction held through the flash keeps repeating; one pressed during it starts its delay now.
  if (game.nextRepeat === null) {
    if (game.held.length > 0) game.nextRepeat = now + DAS_MS;
  } else {
    game.nextRepeat = Math.max(game.nextRepeat, now);
  }

  const replay = game.buffer;
  game.buffer = [];
  for (const action of replay) {
    if (game.gameOver) break;
    perform(game, action, now);
  }
}

function perform(game, action, now) {
  switch (action) {
    case 'left': tryMove(game, -1, 0, now); break;
    case 'right': tryMove(game, 1, 0, now); break;
    case 'softDrop': softDrop(game, now); break;
    case 'hardDrop': hardDrop(game, now); break;
    case 'rotateCW': tryRotate(game, 'cw', now); break;
    case 'rotateCCW': tryRotate(game, 'ccw', now); break;
    case 'hold': holdPiece(game, now); break;
  }
}

/** A key went down (ignore OS auto-repeat: left/right repeat here via DAS/ARR). */
export function press(game, action, now) {
  if (game.gameOver || game.paused) return;

  const dir = DIRECTION[action];
  if (dir !== undefined) {
    game.held = game.held.filter((d) => d !== dir);
    game.held.push(dir);
    game.nextRepeat = game.clearing ? null : now + DAS_MS;
  }

  if (game.clearing) {
    if (BUFFERED.has(action) && game.buffer.length < MAX_BUFFERED) game.buffer.push(action);
    return;
  }
  perform(game, action, now);
}

/** A left/right key came up. Works while paused or after game over too. */
export function release(game, action, now) {
  const dir = DIRECTION[action];
  if (dir === undefined) return;
  const wasActive = game.held[game.held.length - 1] === dir;
  game.held = game.held.filter((d) => d !== dir);
  if (game.held.length === 0) {
    game.nextRepeat = null;
  } else if (wasActive) {
    // The other key is still down: it takes over, after its own delay.
    game.nextRepeat = game.clearing ? null : now + DAS_MS;
  }
}

/** Window lost focus: key-up events may never arrive, so forget what's held. */
export function releaseAll(game) {
  game.held = [];
  game.nextRepeat = null;
}

export function togglePause(game, now) {
  if (game.gameOver) return;
  if (!game.paused) {
    game.paused = true;
    game.pausedAt = now;
    return;
  }
  game.paused = false;
  const away = now - game.pausedAt;
  // Don't drop or lock the moment we resume...
  game.lastDrop = now;
  if (game.lockStart !== null) game.lockStart = now;
  // ...but the flash and key repeat carry on from where they stopped.
  if (game.clearing) game.clearing.start += away;
  if (game.nextRepeat !== null) game.nextRepeat += away;
}

// --- Time ------------------------------------------------------------------

function repeatHeldDirection(game, now) {
  if (game.held.length === 0 || game.nextRepeat === null) return;
  const dx = game.held[game.held.length - 1];
  while (game.nextRepeat <= now) {
    if (!tryMove(game, dx, 0, now)) {
      game.nextRepeat = now + ARR_MS; // against a wall: don't save up moves for later
      return;
    }
    game.nextRepeat += ARR_MS;
  }
}

/** Advance the game to time `now`: key repeat, gravity, lock delay, the clear flash. */
export function step(game, now) {
  if (game.paused || game.gameOver) return;

  if (game.clearing) {
    if (now - game.clearing.start >= CLEAR_MS) finishClear(game, now);
    return;
  }

  repeatHeldDirection(game, now);

  if (!canMove(game.board, game.piece, 0, 1)) {
    if (game.lockStart === null) game.lockStart = now;
    if (now - game.lockStart >= LOCK_DELAY_MS) lock(game, now);
    return;
  }
  game.lockStart = null; // slid off a ledge: falling again
  if (now - game.lastDrop >= dropInterval(level(game))) {
    game.piece = { ...game.piece, y: game.piece.y + 1 };
    game.lastDrop = now;
  }
}
