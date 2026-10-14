import assert from "node:assert/strict";
import { test } from "node:test";

import { CONFIG, createGame, levelFor, mulberry32, pickType, step } from "../src/game.js";

const still = () => 0.5;

function gameWithPacket(code, { x, y } = {}) {
  const state = createGame({ rng: still });
  state.spawnTimer = 99; // no random spawns
  state.packets.push({
    id: 1,
    code,
    x: x ?? state.rack.x + 10,
    y: y ?? state.rack.y - 5,
    size: CONFIG.packetSize,
    vy: 100,
  });
  return state;
}

test("mulberry32 is deterministic and in [0, 1)", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const value = a();
    assert.equal(value, b());
    assert.ok(value >= 0 && value < 1);
  }
});

test("pickType follows the weights", () => {
  const rng = mulberry32(1);
  const counts = { 200: 0, 201: 0, 404: 0, 500: 0 };
  for (let i = 0; i < 20000; i++) counts[pickType(rng)]++;
  assert.ok(counts[200] > counts[404] && counts[200] > counts[500]);
  assert.ok(counts[201] < counts[404]);
});

test("catching a 200 adds 10 points and counts as a good catch", () => {
  const state = gameWithPacket("200");
  step(state, 0.016);
  assert.equal(state.score, 10);
  assert.equal(state.goodCatches, 1);
  assert.deepEqual(state.events, ["catch:200"]);
  assert.equal(state.packets.length, 0);
});

test("catching a 500 costs a life and a 404 costs points but never goes below zero", () => {
  const bad = gameWithPacket("500");
  step(bad, 0.016);
  assert.equal(bad.lives, CONFIG.startLives - 1);

  const soft = gameWithPacket("404");
  step(soft, 0.016);
  assert.equal(soft.score, 0);
  assert.equal(soft.lives, CONFIG.startLives);
});

test("missing a good packet emits 'miss' and removes it; missing a bad one is free", () => {
  const good = gameWithPacket("200", { x: 0, y: CONFIG.height - 1 });
  good.rack.x = CONFIG.width - good.rack.w;
  step(good, 0.1);
  assert.deepEqual(good.events, ["miss"]);
  assert.equal(good.packets.length, 0);

  const bad = gameWithPacket("500", { x: 0, y: CONFIG.height - 1 });
  bad.rack.x = CONFIG.width - bad.rack.w;
  step(bad, 0.1);
  assert.deepEqual(bad.events, []);
  assert.equal(bad.lives, CONFIG.startLives);
});

test("game ends when lives reach zero and stops advancing", () => {
  const state = gameWithPacket("500");
  state.lives = 1;
  step(state, 0.016);
  assert.equal(state.over, true);
  assert.ok(state.events.includes("over"));
  const score = state.score;
  step(state, 1);
  assert.equal(state.score, score);
  assert.deepEqual(state.events, []);
});

test("rack moves with keys and is clamped to the playfield", () => {
  const state = createGame({ rng: still });
  state.spawnTimer = 99;
  for (let i = 0; i < 200; i++) step(state, 0.05, { move: -1 });
  assert.equal(state.rack.x, 0);
  for (let i = 0; i < 200; i++) step(state, 0.05, { move: 1 });
  assert.equal(state.rack.x, CONFIG.width - state.rack.w);
});

test("pointer control follows targetX but is speed limited", () => {
  const state = createGame({ rng: still });
  state.spawnTimer = 99;
  state.rack.x = 0;
  step(state, 0.05, { targetX: 400 });
  assert.ok(state.rack.x > 0 && state.rack.x <= CONFIG.rackSpeed * 0.05 + 1e-9);
  for (let i = 0; i < 100; i++) step(state, 0.05, { targetX: 400 });
  assert.ok(Math.abs(state.rack.x + state.rack.w / 2 - 400) < 1e-6);
});

test("level rises every 10 good catches", () => {
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(9), 1);
  assert.equal(levelFor(10), 2);
  assert.equal(levelFor(25), 3);

  const state = gameWithPacket("200");
  state.goodCatches = 9;
  step(state, 0.016);
  assert.equal(state.level, 2);
  assert.ok(state.events.includes("level"));
});

test("packets spawn over time and fall faster at higher levels", () => {
  const state = createGame({ rng: mulberry32(7) });
  for (let i = 0; i < 40; i++) step(state, 0.05, {});
  assert.ok(state.nextId > 1);

  const slow = createGame({ rng: still });
  const fast = createGame({ rng: still });
  fast.level = 5;
  step(slow, 1);
  step(fast, 1);
  assert.ok(fast.packets[0].vy > slow.packets[0].vy);
});

test("same seed produces the same game", () => {
  const run = () => {
    const state = createGame({ rng: mulberry32(2026) });
    for (let i = 0; i < 300; i++) step(state, 1 / 60, { move: i % 120 < 60 ? 1 : -1 });
    return [state.score, state.lives, state.goodCatches, state.packets.length];
  };
  assert.deepEqual(run(), run());
});
