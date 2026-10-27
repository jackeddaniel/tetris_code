// The spec for media/game-state.js: timing and scoring rules. Run with: npm test
//
// Time is passed in as `now`, so every test is deterministic. Boards and pieces are
// set up by assigning to the plain game object.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COLS, ROWS, createPiece, createBoard, rotateCCW, rotate, dropInterval } from '../media/engine.js';
import {
  createGame, step, press, release, releaseAll, togglePause, upcoming, level,
  LOCK_DELAY_MS, MAX_LOCK_RESETS, CLEAR_MS, DAS_MS, ARR_MS, NEXT_COUNT,
  HARD_DROP_POINTS, SOFT_DROP_POINTS,
} from '../media/game-state.js';

function pieceAt(type, x, y) {
  return { ...createPiece(type), x, y };
}

function newGame() {
  return createGame(Math.random, 0);
}

/** A game whose O piece rests on the floor at column 4. */
function groundedGame() {
  const game = newGame();
  game.piece = pieceAt('O', 4, ROWS - 2);
  return game;
}

/** Rows ROWS-2 and ROWS-1 full except columns 4-5, with an O ready to complete both. */
function twoRowsAlmostFull() {
  const game = newGame();
  for (const r of [ROWS - 2, ROWS - 1]) {
    for (let c = 0; c < COLS; c++) if (c !== 4 && c !== 5) game.board[r][c] = 'X';
  }
  game.piece = pieceAt('O', 4, ROWS - 2);
  return game;
}

function filledCells(board) {
  return board.flat().filter((cell) => cell !== 0).length;
}

describe('createGame', () => {
  it('starts with a piece on an empty board and a full preview', () => {
    const game = newGame();
    assert.ok(game.piece);
    assert.equal(filledCells(game.board), 0);
    assert.equal(upcoming(game).length, NEXT_COUNT);
    assert.equal(game.score, 0);
    assert.equal(level(game), 1);
  });

  it('deals pieces in 7-bags across the preview boundary', () => {
    const game = newGame();
    const dealt = [game.piece.type];
    for (let i = 0; i < 20; i++) {
      dealt.push(upcoming(game)[0]);
      game.piece = pieceAt('O', 4, ROWS - 2);
      press(game, 'hardDrop', 0);
      game.board = createBoard(); // keep the stack from reaching the top
      if (game.gameOver) break;
    }
    // Pieces 0-6 and 7-13 are each one full bag.
    assert.equal(new Set(dealt.slice(0, 7)).size, 7);
    assert.equal(new Set(dealt.slice(7, 14)).size, 7);
  });
});

describe('gravity', () => {
  it('drops one row once the level interval has passed, not before', () => {
    const game = newGame();
    const y = game.piece.y;
    step(game, dropInterval(1) - 1);
    assert.equal(game.piece.y, y);
    step(game, dropInterval(1));
    assert.equal(game.piece.y, y + 1);
  });

  it('does not score points', () => {
    const game = newGame();
    step(game, dropInterval(1));
    assert.equal(game.score, 0);
  });
});

describe('lock delay', () => {
  it('locks a grounded piece only after LOCK_DELAY_MS', () => {
    const game = groundedGame();
    step(game, 1000);
    step(game, 1000 + LOCK_DELAY_MS - 1);
    assert.equal(filledCells(game.board), 0, 'locked early');
    step(game, 1000 + LOCK_DELAY_MS);
    assert.equal(filledCells(game.board), 4);
    assert.equal(game.piece.y, 0, 'next piece should have spawned');
  });

  it('restarts when the piece moves on the ground', () => {
    const game = groundedGame();
    step(game, 0);
    press(game, 'left', 400);
    release(game, 'left', 400);
    step(game, LOCK_DELAY_MS); // 500 since landing, but only 100 since the move
    assert.equal(filledCells(game.board), 0);
    step(game, 400 + LOCK_DELAY_MS);
    assert.equal(filledCells(game.board), 4);
  });

  it('restarts when the piece rotates on the ground', () => {
    const game = newGame();
    game.piece = pieceAt('T', 4, ROWS - 2);
    step(game, 0);
    press(game, 'rotateCW', 400);
    step(game, LOCK_DELAY_MS);
    assert.equal(filledCells(game.board), 0);
  });

  it('stops restarting after MAX_LOCK_RESETS moves', () => {
    const game = groundedGame();
    step(game, 0);
    let now = 0;
    for (let i = 0; i < MAX_LOCK_RESETS + 3; i++) {
      now += 100;
      const action = i % 2 === 0 ? 'left' : 'right';
      press(game, action, now);
      release(game, action, now);
    }
    // The last reset happened at MAX_LOCK_RESETS * 100; the moves after it didn't count.
    const lastReset = MAX_LOCK_RESETS * 100;
    step(game, lastReset + LOCK_DELAY_MS - 1);
    assert.equal(filledCells(game.board), 0);
    step(game, lastReset + LOCK_DELAY_MS);
    assert.equal(filledCells(game.board), 4, 'moves past the cap must not extend the delay');
  });

  it('does not start while the piece can still fall', () => {
    const game = newGame();
    game.piece = pieceAt('O', 4, 5);
    game.lastDrop = 1_000_000; // keep gravity out of the way
    step(game, 10_000);
    assert.equal(filledCells(game.board), 0);
    assert.equal(game.lockStart, null);
  });
});

describe('drops', () => {
  it('hard drop lands at once and scores 2 per row', () => {
    const game = newGame();
    game.piece = pieceAt('O', 4, 0);
    press(game, 'hardDrop', 0);
    assert.equal(game.score, (ROWS - 2) * HARD_DROP_POINTS);
    assert.equal(filledCells(game.board), 4);
    assert.equal(game.board[ROWS - 1][4], 'O');
  });

  it('hard drop on the ground scores nothing', () => {
    const game = groundedGame();
    press(game, 'hardDrop', 0);
    assert.equal(game.score, 0);
  });

  it('soft drop moves one row, scores 1 and delays gravity', () => {
    const game = newGame();
    const y = game.piece.y;
    press(game, 'softDrop', 700);
    assert.equal(game.piece.y, y + 1);
    assert.equal(game.score, SOFT_DROP_POINTS);
    step(game, 700 + dropInterval(1) - 1);
    assert.equal(game.piece.y, y + 1, 'gravity should wait a full interval after a soft drop');
  });

  it('soft drop on the ground scores nothing', () => {
    const game = groundedGame();
    press(game, 'softDrop', 0);
    assert.equal(game.score, 0);
  });
});

describe('line clear', () => {
  it('flashes first, then removes the rows and scores', () => {
    const game = twoRowsAlmostFull();
    press(game, 'hardDrop', 1000);
    assert.deepEqual(game.clearing.rows, [ROWS - 2, ROWS - 1]);
    assert.equal(game.piece, null);
    assert.equal(game.lines, 0, 'nothing is counted until the flash ends');

    step(game, 1000 + CLEAR_MS - 1);
    assert.ok(game.clearing);
    assert.equal(filledCells(game.board), 2 * COLS);

    step(game, 1000 + CLEAR_MS);
    assert.equal(game.clearing, null);
    assert.equal(filledCells(game.board), 0);
    assert.equal(game.lines, 2);
    assert.equal(game.score, 300);
    assert.ok(game.piece);
  });

  it('multiplies by the level the clear started at', () => {
    const game = twoRowsAlmostFull();
    game.lines = 9; // level 1, but this clear takes it to level 2
    press(game, 'hardDrop', 0);
    step(game, CLEAR_MS);
    assert.equal(game.score, 300 * 1);
    assert.equal(level(game), 2);

    const game2 = twoRowsAlmostFull();
    game2.lines = 10; // already level 2
    press(game2, 'hardDrop', 0);
    step(game2, CLEAR_MS);
    assert.equal(game2.score, 300 * 2);
  });

  it('ignores drops pressed during the flash', () => {
    const game = twoRowsAlmostFull();
    press(game, 'hardDrop', 0);
    press(game, 'hardDrop', 50);
    press(game, 'softDrop', 60);
    step(game, CLEAR_MS);
    assert.equal(game.piece.y, 0, 'the new piece must not have been dropped');
    assert.equal(game.score, 300);
  });

  it('replays moves, rotations and hold pressed during the flash on the new piece', () => {
    const game = twoRowsAlmostFull();
    press(game, 'hardDrop', 0);
    press(game, 'left', 50);
    release(game, 'left', 60);
    press(game, 'hold', 70);
    assert.equal(game.hold, null, 'nothing happens until the flash ends');
    step(game, CLEAR_MS);
    assert.notEqual(game.hold, null);
    assert.equal(game.holdUsed, true);

    const game2 = twoRowsAlmostFull();
    press(game2, 'hardDrop', 0);
    press(game2, 'left', 50);
    release(game2, 'left', 60);
    step(game2, CLEAR_MS);
    assert.equal(game2.piece.x, createPiece(game2.piece.type).x - 1);
  });

  it('replays a rotation pressed during the flash', () => {
    const game = twoRowsAlmostFull();
    press(game, 'hardDrop', 0);
    press(game, 'rotateCCW', 50);
    step(game, CLEAR_MS);
    const spawned = createPiece(game.piece.type);
    assert.deepEqual(game.piece.shape, rotateCCW(spawned).shape);
  });
});

describe('game over', () => {
  /** Rows 2..bottom full except the last column, so a piece dropped from the top locks at rows 0-1. */
  function stackedGame() {
    const game = newGame();
    for (let r = 2; r < ROWS; r++) for (let c = 0; c < COLS - 1; c++) game.board[r][c] = 'X';
    return game;
  }

  it('ends when a new piece has no room to spawn', () => {
    const game = stackedGame();
    press(game, 'hardDrop', 0);
    assert.equal(game.gameOver, true);
  });

  it('ignores input and time afterwards', () => {
    const game = stackedGame();
    press(game, 'hardDrop', 0);
    const { piece, board, score } = game;
    press(game, 'left', 10);
    press(game, 'hardDrop', 20);
    step(game, 100_000);
    assert.deepEqual(game.piece, piece);
    assert.deepEqual(game.board, board);
    assert.equal(game.score, score);
  });

  it('is not triggered while the stack is below the spawn rows', () => {
    const game = newGame();
    press(game, 'hardDrop', 0);
    assert.equal(game.gameOver, false);
  });
});

describe('pause', () => {
  it('freezes gravity, lock delay and input', () => {
    const game = newGame();
    const y = game.piece.y;
    togglePause(game, 0);
    step(game, 100_000);
    press(game, 'left', 100_000);
    press(game, 'hardDrop', 100_000);
    assert.equal(game.piece.y, y);
    assert.equal(game.piece.x, createPiece(game.piece.type).x);
    assert.equal(filledCells(game.board), 0);
  });

  it('does not drop or lock the moment you resume', () => {
    const game = newGame();
    const y = game.piece.y;
    togglePause(game, 0);
    togglePause(game, 60_000);
    step(game, 60_000);
    assert.equal(game.piece.y, y);
    step(game, 60_000 + dropInterval(1));
    assert.equal(game.piece.y, y + 1);

    const grounded = groundedGame();
    step(grounded, 0);
    togglePause(grounded, 300);
    togglePause(grounded, 60_000);
    step(grounded, 60_000 + LOCK_DELAY_MS - 1);
    assert.equal(filledCells(grounded.board), 0);
    step(grounded, 60_000 + LOCK_DELAY_MS);
    assert.equal(filledCells(grounded.board), 4);
  });

  it('does not eat the line-clear flash', () => {
    const game = twoRowsAlmostFull();
    press(game, 'hardDrop', 0);
    togglePause(game, 100); // 120 ms of flash left
    togglePause(game, 5100);
    step(game, 5100 + 119);
    assert.ok(game.clearing, 'flash ended early');
    step(game, 5100 + 120);
    assert.equal(game.clearing, null);
    assert.equal(game.lines, 2);
  });

  it('does nothing after game over', () => {
    const game = newGame();
    game.gameOver = true;
    togglePause(game, 0);
    assert.equal(game.paused, false);
  });
});

describe('hold', () => {
  it('stashes the piece and brings the next one', () => {
    const game = newGame();
    const first = game.piece.type;
    const next = upcoming(game)[0];
    press(game, 'hold', 0);
    assert.equal(game.hold, first);
    assert.equal(game.piece.type, next);
    assert.equal(game.piece.y, 0);
    assert.equal(upcoming(game).length, NEXT_COUNT);
  });

  it('only works once per piece', () => {
    const game = newGame();
    press(game, 'hold', 0);
    const { hold, piece } = game;
    press(game, 'hold', 1);
    assert.equal(game.hold, hold);
    assert.equal(game.piece.type, piece.type);
  });

  it('swaps with the held piece after the next one locks', () => {
    const game = newGame();
    const first = game.piece.type;
    press(game, 'hold', 0);
    press(game, 'hardDrop', 1);
    game.board = createBoard();
    const second = game.piece.type;
    press(game, 'hold', 2);
    assert.equal(game.piece.type, first);
    assert.equal(game.hold, second);
  });

  it('puts the swapped-in piece back at the spawn position', () => {
    const game = newGame();
    press(game, 'hold', 0);
    press(game, 'hardDrop', 1);
    game.board = createBoard();
    game.piece = { ...game.piece, x: 0, y: 9 };
    press(game, 'hold', 2);
    assert.equal(game.piece.y, 0);
    assert.equal(game.piece.x, createPiece(game.piece.type).x);
  });
});

describe('rotation keys', () => {
  it('rotate both ways', () => {
    const game = newGame();
    game.piece = pieceAt('T', 4, 5);
    press(game, 'rotateCW', 0);
    assert.deepEqual(game.piece.shape, rotate(pieceAt('T', 4, 5)).shape);
    press(game, 'rotateCCW', 1);
    assert.deepEqual(game.piece.shape, createPiece('T').shape);
  });
});

describe('key repeat (DAS/ARR)', () => {
  function atLeftWall() {
    const game = newGame();
    game.piece = pieceAt('O', 0, 5);
    game.lastDrop = 1_000_000; // keep gravity out of the way
    return game;
  }

  it('moves once on press, waits DAS_MS, then repeats every ARR_MS', () => {
    const game = atLeftWall();
    press(game, 'right', 0);
    assert.equal(game.piece.x, 1);
    step(game, DAS_MS - 1);
    assert.equal(game.piece.x, 1, 'repeated before the delay');
    step(game, DAS_MS);
    assert.equal(game.piece.x, 2);
    step(game, DAS_MS + 3 * ARR_MS);
    assert.equal(game.piece.x, 5);
  });

  it('catches up on a slow frame', () => {
    const game = atLeftWall();
    press(game, 'right', 0);
    step(game, DAS_MS + 2 * ARR_MS + 1);
    assert.equal(game.piece.x, 4); // 1 + repeats at DAS, +ARR, +2*ARR
  });

  it('stops on release', () => {
    const game = atLeftWall();
    press(game, 'right', 0);
    release(game, 'right', 100);
    step(game, 1000);
    assert.equal(game.piece.x, 1);
  });

  it('stops at the wall without saving up moves', () => {
    const game = newGame();
    game.piece = pieceAt('O', COLS - 2, 5);
    game.lastDrop = 1_000_000;
    press(game, 'right', 0);
    step(game, 5000);
    assert.equal(game.piece.x, COLS - 2);
    // Moving away and back must not fire a burst of banked repeats.
    game.piece = pieceAt('O', 3, 5);
    step(game, 5000 + ARR_MS);
    assert.ok(game.piece.x <= 4, `jumped to ${game.piece.x}`);
  });

  it('lets the newest direction win and hands back to the older one after a delay', () => {
    const game = newGame();
    game.piece = pieceAt('O', 4, 5);
    game.lastDrop = 1_000_000;
    press(game, 'right', 0); // x 5
    press(game, 'left', 10); // x 4
    step(game, 10 + DAS_MS);
    assert.equal(game.piece.x, 3, 'should repeat left');
    release(game, 'left', 200);
    step(game, 200 + DAS_MS - 1);
    assert.equal(game.piece.x, 3, 'right must wait its own delay');
    step(game, 200 + DAS_MS);
    assert.equal(game.piece.x, 4);
  });

  it('forgets held keys on releaseAll (window lost focus)', () => {
    const game = atLeftWall();
    press(game, 'right', 0);
    releaseAll(game);
    step(game, 1000);
    assert.equal(game.piece.x, 1);
  });

  it('pausing does not make repeat fire in a burst', () => {
    const game = atLeftWall();
    press(game, 'right', 0);
    togglePause(game, 50);
    togglePause(game, 10_000);
    step(game, 10_000);
    assert.equal(game.piece.x, 1);
    step(game, 10_000 + DAS_MS - 50);
    assert.equal(game.piece.x, 2);
  });

  it('a direction pressed during the flash starts repeating after it', () => {
    const game = twoRowsAlmostFull();
    press(game, 'hardDrop', 0);
    press(game, 'right', 50);
    step(game, CLEAR_MS);
    const spawnX = createPiece(game.piece.type).x;
    assert.equal(game.piece.x, spawnX + 1, 'buffered move');
    step(game, CLEAR_MS + DAS_MS - 1);
    assert.equal(game.piece.x, spawnX + 1);
    step(game, CLEAR_MS + DAS_MS);
    assert.equal(game.piece.x, spawnX + 2);
  });

  it('moving on the ground restarts the lock delay on every repeat', () => {
    const game = newGame();
    game.piece = pieceAt('O', 0, ROWS - 2);
    step(game, 0);
    press(game, 'right', 0);
    step(game, 600); // 600 ms after landing, but repeats keep sliding it right
    assert.equal(filledCells(game.board), 0);
    assert.ok(game.piece.x > 1);
  });
});
