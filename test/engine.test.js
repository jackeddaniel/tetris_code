// The spec for media/engine.js. Run with: npm test
//
// Boards are built with the local helpers below (not createBoard) so each test
// only depends on the one function it is testing.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLS, ROWS, PIECE_TYPES, createPiece,
  createBoard, canMove, lockPiece, rotate, clearLines, levelFor, dropInterval,
  dropPosition, rotateWithKicks, fullRows, createBag,
} from '../media/engine.js';

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function fullRow(type = 'X') {
  return Array(COLS).fill(type);
}

function pieceAt(type, x, y) {
  return { ...createPiece(type), x, y };
}

// I rotated once clockwise: filled cells in column 2 of its 4x4 shape.
const I_VERTICAL = [[0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]];

describe('createBoard', () => {
  it('is ROWS x COLS of zeros', () => {
    const board = createBoard();
    assert.equal(board.length, ROWS);
    for (const row of board) assert.deepEqual(row, Array(COLS).fill(0));
  });

  it('gives every row its own array', () => {
    const board = createBoard();
    board[0][0] = 'X';
    assert.equal(board[1][0], 0, 'changing row 0 also changed row 1: rows share one array');
  });

  it('returns a fresh board each call', () => {
    const a = createBoard();
    a[5][5] = 'X';
    assert.equal(createBoard()[5][5], 0);
  });
});

describe('canMove: walls', () => {
  it('blocks moving left from the left wall', () => {
    const o = pieceAt('O', 0, 5);
    assert.equal(canMove(emptyBoard(), o, -1, 0), false);
    assert.equal(canMove(emptyBoard(), o, 1, 0), true);
  });

  it('blocks moving right from the right wall', () => {
    const o = pieceAt('O', COLS - 2, 5);
    assert.equal(canMove(emptyBoard(), o, 1, 0), false);
    assert.equal(canMove(emptyBoard(), o, -1, 0), true);
  });

  it('ignores empty shape cells that hang off the board', () => {
    // Vertical I at x = -2: its filled column lands on board column 0.
    const i = { ...pieceAt('I', -2, 5), shape: I_VERTICAL };
    assert.equal(canMove(emptyBoard(), i, 0, 0), true);
    assert.equal(canMove(emptyBoard(), i, -1, 0), false);
  });

  it('blocks moving above the top', () => {
    assert.equal(canMove(emptyBoard(), pieceAt('O', 4, 0), 0, -1), false);
  });
});

describe('canMove: floor', () => {
  it('blocks moving down from the floor', () => {
    assert.equal(canMove(emptyBoard(), pieceAt('O', 4, ROWS - 2), 0, 1), false);
  });

  it('allows moving down one row above the floor', () => {
    assert.equal(canMove(emptyBoard(), pieceAt('O', 4, ROWS - 3), 0, 1), true);
  });

  it('uses filled cells, not the shape box, to find the floor', () => {
    // Horizontal I's filled row is shape row 1, so at y = ROWS - 2 it sits on the last row.
    const i = pieceAt('I', 3, ROWS - 2);
    assert.equal(canMove(emptyBoard(), i, 0, 0), true);
    assert.equal(canMove(emptyBoard(), i, 0, 1), false);
  });
});

describe('canMove: locked cells', () => {
  it('blocks moving down onto a locked cell', () => {
    const board = emptyBoard();
    board[ROWS - 1][4] = 'Z';
    assert.equal(canMove(board, pieceAt('O', 4, ROWS - 3), 0, 1), false);
  });

  it('blocks moving sideways into a locked cell', () => {
    const board = emptyBoard();
    board[10][3] = 'Z';
    assert.equal(canMove(board, pieceAt('O', 4, 9), -1, 0), false);
    assert.equal(canMove(board, pieceAt('O', 4, 9), 1, 0), true);
  });

  it('reports an overlapping position as invalid', () => {
    const board = emptyBoard();
    board[6][5] = 'Z';
    assert.equal(canMove(board, pieceAt('O', 4, 5), 0, 0), false);
  });

  it('lets empty shape cells overlap locked cells', () => {
    const board = emptyBoard();
    board[5][3] = 'Z'; // under the T's empty top-left corner
    assert.equal(canMove(board, pieceAt('T', 3, 5), 0, 0), true);
  });
});

describe('lockPiece', () => {
  it('writes the piece type into its filled cells', () => {
    const result = lockPiece(emptyBoard(), pieceAt('O', 4, ROWS - 2));
    const expected = emptyBoard();
    expected[ROWS - 2][4] = expected[ROWS - 2][5] = 'O';
    expected[ROWS - 1][4] = expected[ROWS - 1][5] = 'O';
    assert.deepEqual(result, expected);
  });

  it('skips empty shape cells, even ones off the board', () => {
    // T at y = ROWS - 2: its empty third shape row would be below the board.
    const result = lockPiece(emptyBoard(), pieceAt('T', 3, ROWS - 2));
    const expected = emptyBoard();
    expected[ROWS - 2][4] = 'T';
    expected[ROWS - 1][3] = expected[ROWS - 1][4] = expected[ROWS - 1][5] = 'T';
    assert.deepEqual(result, expected);
  });

  it('keeps existing locked cells', () => {
    const board = emptyBoard();
    board[ROWS - 1][0] = 'Z';
    assert.equal(lockPiece(board, pieceAt('O', 4, ROWS - 2))[ROWS - 1][0], 'Z');
  });

  it('does not mutate the original board', () => {
    const board = emptyBoard();
    lockPiece(board, pieceAt('O', 4, ROWS - 2));
    assert.deepEqual(board, emptyBoard());
  });
});

describe('rotate', () => {
  it('turns a horizontal I vertical (clockwise)', () => {
    assert.deepEqual(rotate(createPiece('I')).shape, I_VERTICAL);
  });

  it('brings I back to the start after four rotations', () => {
    const start = createPiece('I');
    assert.deepEqual(rotate(rotate(rotate(rotate(start)))).shape, start.shape);
  });

  it('leaves O unchanged', () => {
    assert.deepEqual(rotate(createPiece('O')).shape, [[1, 1], [1, 1]]);
  });

  it('rotates T clockwise', () => {
    assert.deepEqual(rotate(createPiece('T')).shape, [[0, 1, 0], [0, 1, 1], [0, 1, 0]]);
  });

  it('keeps type and position', () => {
    const r = rotate(pieceAt('I', 2, 7));
    assert.equal(r.type, 'I');
    assert.equal(r.x, 2);
    assert.equal(r.y, 7);
  });

  it('does not mutate the original piece', () => {
    const piece = createPiece('I');
    const before = piece.shape.map((row) => [...row]);
    rotate(piece);
    assert.deepEqual(piece.shape, before);
  });
});

describe('clearLines', () => {
  it('clears nothing when no row is full', () => {
    const board = emptyBoard();
    board[ROWS - 1][0] = 'Z';
    const { board: result, cleared } = clearLines(board);
    assert.equal(cleared, 0);
    assert.deepEqual(result, board);
  });

  it('clears a full row and drops the rows above it', () => {
    const board = emptyBoard();
    board[ROWS - 1] = fullRow();
    board[ROWS - 2][3] = 'T';
    const { board: result, cleared } = clearLines(board);

    const expected = emptyBoard();
    expected[ROWS - 1][3] = 'T';
    assert.equal(cleared, 1);
    assert.deepEqual(result, expected);
  });

  it('clears multiple non-adjacent rows', () => {
    const board = emptyBoard();
    board[ROWS - 1] = fullRow();
    board[ROWS - 2][0] = 'J';
    board[ROWS - 3] = fullRow();
    board[ROWS - 4][9] = 'L';
    const { board: result, cleared } = clearLines(board);

    const expected = emptyBoard();
    expected[ROWS - 1][0] = 'J';
    expected[ROWS - 2][9] = 'L';
    assert.equal(cleared, 2);
    assert.deepEqual(result, expected);
  });

  it('clears four rows at once (a Tetris)', () => {
    const board = emptyBoard();
    for (let r = ROWS - 4; r < ROWS; r++) board[r] = fullRow();
    board[ROWS - 5][2] = 'S';
    const { board: result, cleared } = clearLines(board);

    const expected = emptyBoard();
    expected[ROWS - 1][2] = 'S';
    assert.equal(cleared, 4);
    assert.deepEqual(result, expected);
  });

  it('does not mutate the original board', () => {
    const board = emptyBoard();
    board[ROWS - 1] = fullRow();
    const copy = board.map((row) => [...row]);
    clearLines(board);
    assert.deepEqual(board, copy);
  });
});

describe('speed', () => {
  it('starts at level 1 and goes up every 10 lines', () => {
    assert.equal(levelFor(0), 1);
    assert.equal(levelFor(9), 1);
    assert.equal(levelFor(10), 2);
    assert.equal(levelFor(25), 3);
  });

  it('starts at 800 ms and speeds up gradually', () => {
    assert.equal(dropInterval(1), 800);
    assert.equal(dropInterval(2), 720);
    for (let level = 1; level < 30; level++) {
      assert.ok(dropInterval(level + 1) <= dropInterval(level), `level ${level + 1} is slower than ${level}`);
    }
  });

  it('never drops faster than every 100 ms', () => {
    assert.equal(dropInterval(1000), 100);
  });
});

describe('dropPosition', () => {
  it('drops to the floor on an empty board', () => {
    assert.equal(dropPosition(emptyBoard(), pieceAt('O', 4, 0)).y, ROWS - 2);
  });

  it('stops on top of locked cells', () => {
    const board = emptyBoard();
    board[10][5] = 'Z';
    assert.equal(dropPosition(board, pieceAt('O', 4, 0)).y, 8);
  });

  it('stays put when already resting', () => {
    const o = pieceAt('O', 4, ROWS - 2);
    assert.deepEqual(dropPosition(emptyBoard(), o), o);
  });

  it('does not mutate the piece', () => {
    const o = pieceAt('O', 4, 0);
    dropPosition(emptyBoard(), o);
    assert.equal(o.y, 0);
  });
});

describe('rotateWithKicks', () => {
  it('rotates in place when there is room', () => {
    const t = pieceAt('T', 4, 5);
    assert.deepEqual(rotateWithKicks(emptyBoard(), t), rotate(t));
  });

  it('kicks a vertical I away from the left wall', () => {
    // Filled column on board column 0; turning horizontal needs x >= 0.
    const i = { ...pieceAt('I', -2, 5), shape: I_VERTICAL };
    const result = rotateWithKicks(emptyBoard(), i);
    assert.equal(result.x, 0);
    assert.deepEqual(result.shape, rotate(i).shape);
    assert.equal(canMove(emptyBoard(), result, 0, 0), true);
  });

  it('kicks up off the floor', () => {
    // T resting on the floor; its vertical form is one row taller.
    const t = pieceAt('T', 4, ROWS - 2);
    const result = rotateWithKicks(emptyBoard(), t);
    assert.equal(result.x, 4);
    assert.equal(result.y, ROWS - 3);
  });

  it('returns null when no kick fits', () => {
    // Everything full except the cells the horizontal I occupies.
    const board = Array.from({ length: ROWS }, () => fullRow());
    const i = pieceAt('I', 3, 5);
    for (let c = 3; c < 7; c++) board[6][c] = 0;
    assert.equal(rotateWithKicks(board, i), null);
  });
});

describe('fullRows', () => {
  it('is empty when no row is full', () => {
    assert.deepEqual(fullRows(emptyBoard()), []);
  });

  it('lists full rows top to bottom', () => {
    const board = emptyBoard();
    board[ROWS - 1] = fullRow();
    board[ROWS - 3] = fullRow();
    board[ROWS - 2][0] = 'J';
    assert.deepEqual(fullRows(board), [ROWS - 3, ROWS - 1]);
  });
});

describe('createBag', () => {
  it('contains each piece type exactly once', () => {
    for (let n = 0; n < 20; n++) {
      assert.deepEqual([...createBag()].sort(), [...PIECE_TYPES].sort());
    }
  });

  it('uses the random function it is given', () => {
    assert.deepEqual(createBag(() => 0), createBag(() => 0));
    assert.notDeepEqual(createBag(() => 0), createBag(() => 0.999));
  });

  it('does not reorder PIECE_TYPES', () => {
    const before = [...PIECE_TYPES];
    createBag();
    assert.deepEqual(PIECE_TYPES, before);
  });
});
