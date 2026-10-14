// Pure game logic: no DOM, no timers, no Math.random. Everything is driven by
// step(state, dt, input) so it can be unit-tested deterministically.

export const PACKET_TYPES = {
  200: { points: 10, life: 0, weight: 60, good: true },
  201: { points: 25, life: 0, weight: 10, good: true },
  404: { points: -5, life: 0, weight: 15, good: false },
  500: { points: 0, life: -1, weight: 15, good: false },
};

export const CONFIG = {
  width: 480,
  height: 640,
  rackWidth: 84,
  rackHeight: 28,
  rackSpeed: 460, // px/s
  packetSize: 34,
  baseFall: 130, // px/s at level 1
  fallPerLevel: 24,
  baseSpawn: 1.0, // seconds between packets at level 1
  spawnPerLevel: 0.07,
  minSpawn: 0.33,
  goodCatchesPerLevel: 10,
  startLives: 3,
};

/** Small seedable PRNG (mulberry32) returning floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGame({ rng = Math.random, config = CONFIG } = {}) {
  return {
    config,
    rng,
    rack: {
      x: (config.width - config.rackWidth) / 2,
      y: config.height - config.rackHeight - 16,
      w: config.rackWidth,
      h: config.rackHeight,
    },
    packets: [],
    score: 0,
    lives: config.startLives,
    goodCatches: 0,
    level: 1,
    spawnTimer: 0.6,
    nextId: 1,
    over: false,
    events: [], // 'catch:200', 'miss', 'hit:500', 'level', 'over' ... cleared each step
  };
}

export function levelFor(goodCatches, config = CONFIG) {
  return 1 + Math.floor(goodCatches / config.goodCatchesPerLevel);
}

export function pickType(rng) {
  const entries = Object.entries(PACKET_TYPES);
  const total = entries.reduce((sum, [, t]) => sum + t.weight, 0);
  let roll = rng() * total;
  for (const [code, type] of entries) {
    roll -= type.weight;
    if (roll < 0) return code;
  }
  return entries[0][0];
}

function spawn(state) {
  const { config, rng } = state;
  const size = config.packetSize;
  const speedJitter = 0.85 + rng() * 0.3;
  state.packets.push({
    id: state.nextId++,
    code: pickType(rng),
    x: rng() * (config.width - size),
    y: -size,
    size,
    vy: (config.baseFall + config.fallPerLevel * (state.level - 1)) * speedJitter,
  });
}

function overlaps(p, rack) {
  return (
    p.x < rack.x + rack.w && p.x + p.size > rack.x && p.y < rack.y + rack.h && p.y + p.size > rack.y
  );
}

/**
 * Advance the game by dt seconds.
 * input: { move: -1 | 0 | 1 }  or  { targetX: number }  (rack centre, for pointer/touch)
 */
export function step(state, dt, input = {}) {
  state.events = [];
  if (state.over) return state;
  const { config, rack } = state;

  if (typeof input.targetX === "number") {
    const target = input.targetX - rack.w / 2;
    const maxMove = config.rackSpeed * dt;
    rack.x += Math.max(-maxMove, Math.min(maxMove, target - rack.x));
  } else if (input.move) {
    rack.x += input.move * config.rackSpeed * dt;
  }
  rack.x = Math.max(0, Math.min(config.width - rack.w, rack.x));

  state.spawnTimer -= dt;
  while (state.spawnTimer <= 0) {
    spawn(state);
    state.spawnTimer += Math.max(config.minSpawn, config.baseSpawn - config.spawnPerLevel * (state.level - 1));
  }

  const remaining = [];
  for (const p of state.packets) {
    p.y += p.vy * dt;
    const type = PACKET_TYPES[p.code];
    if (overlaps(p, rack)) {
      state.score = Math.max(0, state.score + type.points);
      state.lives += type.life;
      if (type.good) {
        state.goodCatches += 1;
        state.events.push(`catch:${p.code}`);
      } else {
        state.events.push(`hit:${p.code}`);
      }
    } else if (p.y > config.height) {
      if (type.good) state.events.push("miss");
    } else {
      remaining.push(p);
    }
  }
  state.packets = remaining;

  const level = levelFor(state.goodCatches, config);
  if (level > state.level) {
    state.level = level;
    state.events.push("level");
  }
  if (state.lives <= 0) {
    state.lives = 0;
    state.over = true;
    state.events.push("over");
  }
  return state;
}
