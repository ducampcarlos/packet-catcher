import { CONFIG, PACKET_TYPES, createGame, step } from "./game.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const COLORS = { 200: "#3ddc84", 201: "#5ec8ff", 404: "#ffc857", 500: "#ff5d5d" };
const HIGH_SCORE_KEY = "packet-catcher:high-score";

let game = createGame();
let paused = false;
let highScore = readHighScore();
let flash = 0;
let lastTime = performance.now();
const keys = new Set();
let pointerX = null;

function readHighScore() {
  try {
    return Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
  } catch {
    return 0; // storage can be blocked (private mode, sandboxed iframe)
  }
}

function saveHighScore(value) {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(value));
  } catch {
    /* ignore */
  }
}

function restart() {
  game = createGame();
  paused = false;
  flash = 0;
}

function currentInput() {
  if (pointerX !== null) return { targetX: pointerX };
  const left = keys.has("arrowleft") || keys.has("a");
  const right = keys.has("arrowright") || keys.has("d");
  return { move: (right ? 1 : 0) - (left ? 1 : 0) };
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
  if (key === "p" || (key === " " && !game.over)) paused = !paused;
  else if ((key === "enter" || key === " ") && game.over) restart();
  else {
    keys.add(key);
    pointerX = null; // keyboard takes over from the pointer
  }
});
window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener("blur", () => {
  keys.clear();
  if (!game.over) paused = true;
});

function toGameX(event) {
  const rect = canvas.getBoundingClientRect();
  return ((event.clientX - rect.left) / rect.width) * CONFIG.width;
}
canvas.addEventListener("pointerdown", (event) => {
  if (game.over) return restart();
  pointerX = toGameX(event);
});
canvas.addEventListener("pointermove", (event) => {
  if (event.pointerType === "mouse" && event.buttons === 0 && pointerX === null) return;
  if (!game.over) pointerX = toGameX(event);
});
canvas.addEventListener("pointerleave", () => {
  pointerX = null;
});

function drawPacket(p) {
  const color = COLORS[p.code];
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(p.x, p.y, p.size, p.size, 7);
  ctx.fill();
  ctx.fillStyle = "#0b1320";
  ctx.font = "bold 13px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(p.code, p.x + p.size / 2, p.y + p.size / 2 + 1);
}

function drawRack(rack) {
  ctx.fillStyle = "#2c5364";
  ctx.beginPath();
  ctx.roundRect(rack.x, rack.y, rack.w, rack.h, 6);
  ctx.fill();
  ctx.fillStyle = "#36bcf7";
  for (let i = 0; i < 4; i++) ctx.fillRect(rack.x + 10 + i * 18, rack.y + 9, 10, 4);
}

function drawHud() {
  ctx.fillStyle = "#e6edf7";
  ctx.font = "bold 16px ui-monospace, monospace";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(`Score ${game.score}`, 12, 10);
  ctx.textAlign = "center";
  ctx.fillText(`Lv ${game.level}`, CONFIG.width / 2, 10);
  ctx.textAlign = "right";
  ctx.fillText("♥".repeat(game.lives) || "—", CONFIG.width - 12, 10);
  ctx.fillStyle = "#8da2c0";
  ctx.font = "12px ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.fillText(`Best ${highScore}`, 12, 32);
}

function drawOverlay(title, subtitle) {
  ctx.fillStyle = "rgba(11, 19, 32, 0.78)";
  ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
  ctx.fillStyle = "#e6edf7";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 34px ui-monospace, monospace";
  ctx.fillText(title, CONFIG.width / 2, CONFIG.height / 2 - 18);
  ctx.fillStyle = "#8da2c0";
  ctx.font = "15px ui-monospace, monospace";
  ctx.fillText(subtitle, CONFIG.width / 2, CONFIG.height / 2 + 20);
}

function render() {
  ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);
  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 93, 93, ${flash * 0.35})`;
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
  }
  game.packets.forEach(drawPacket);
  drawRack(game.rack);
  drawHud();
  if (game.over) drawOverlay("Server down", `Score ${game.score}. Press Enter or tap to restart`);
  else if (paused) drawOverlay("Paused", "Press P to resume");
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000); // clamp so a background tab can't tunnel packets
  lastTime = now;
  if (!paused && !game.over) {
    step(game, dt, currentInput());
    if (game.events.some((e) => e.startsWith("hit:") && PACKET_TYPES[e.slice(4)].life < 0)) flash = 1;
    if (game.over && game.score > highScore) {
      highScore = game.score;
      saveHighScore(highScore);
    }
  }
  flash = Math.max(0, flash - dt * 3);
  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Exposed for automated browser checks only.
window.__packetCatcher = { state: () => game };
