const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const uiLevel = document.getElementById('level-name');
const uiRunes = document.getElementById('rune-status');
const uiTime = document.getElementById('time-status');
const uiBest = document.getElementById('best-status');
const uiHint = document.getElementById('hint');
const overlay = document.getElementById('overlay');
const winOverlay = document.getElementById('win-overlay');
const winTime = document.getElementById('win-time');
const winBest = document.getElementById('win-best');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const pauseBtn = document.getElementById('pause-btn');
const resumeBtn = document.getElementById('resume-btn');
const menuBtn = document.getElementById('menu-btn');
const pauseMenuBtn = document.getElementById('pause-menu-btn');
const gameWrap = document.getElementById('game-wrap');
const playerNameInput = document.getElementById('player-name');
const nameError = document.getElementById('name-error');
const leaderboardStart = document.getElementById('leaderboard-start');
const leaderboardWin = document.getElementById('leaderboard-win');
const pauseOverlay = document.getElementById('pause-overlay');

const TILE = 32;
const VIEW_W = canvas.width;
const VIEW_H = canvas.height;

const levels = [
  {
    name: 'Пещера Ветра',
    hint: 'Собери все руны, чтобы открыть ворота.',
    orderRequired: false,
    map: [
      '##############################',
      '#...........K................#',
      '#.........#####..............#',
      '#..................####..B...#',
      '#....####.......#....B.......#',
      '#............#..#........K...#',
      '#..P........#^^^^#...B...E...#',
      '#............####......^^^^^.#',
      '#........K...................#',
      '#...............####.........#',
      '#............................#',
      '#............####............#',
      '#.....................####...#',
      '#.............................#',
      '##############################'
    ]
  },
  {
    name: 'Пещера Эха',
    hint: 'Табличка: руны нужно брать в порядке 1 → 2 → 3.',
    orderRequired: true,
    map: [
      '##############################',
      '#.....1......................#',
      '#............####^^^^^^^^^...#',
      '#..P.....................E...#',
      '#......###...BBBBBBBBBBB..#..#',
      '#.................2..B.......#',
      '#..BBBB...BB.................#',
      '#...............####.........#',
      '#.....................3......#',
      '#............#..#............#',
      '#...............^............#',
      '#.....###....####............#',
      '#............................#',
      '##############################'
    ]
  },
  {
    name: 'Пещера Огня',
    hint: 'Подсказка: сначала 1, потом 2, затем 3. Шипы сбрасывают попытку.',
    orderRequired: true,
    map: [
      '##############################',
      '#....1.......................#',
      '#............####.....B......#',
      '#..P..####...........B..E....#',
      '#............####............#',
      '#.................2...#..B...#',
      '#..####......................#',
      '#.......###.....####.........#',
      '#.....................3......#',
      '#............####.....#......#',
      '#............................#',
      '#............####............#',
      '#^^^^^^^^^^^^^^^^^^^^^^^^^^^^#',
      '##############################'
    ]
  }
];

const input = {
  left: false,
  right: false,
  jump: false
};

const JUMP_BUFFER_FRAMES = 6;
const COYOTE_FRAMES = 6;
let jumpBuffer = 0;
let coyoteTime = 0;

const player = {
  x: 0,
  y: 0,
  w: 26,
  h: 26,
  vx: 0,
  vy: 0,
  onGround: false,
  respawnX: 0,
  respawnY: 0,
  rotation: 0,
  targetRotation: 0,
  spinDirection: 1,
  spinning: false
};

let levelIndex = 0;
let levelState = null;
let orderProgress = 0;
let gameRunning = false;
let lastTime = 0;
let animationFrameId = null;
let frameAccumulator = 0;
let globalTime = 0;
let pauseStarted = 0;
let stars = [];
let decorations = [];
let runStart = 0;
let currentTime = 0;
let bestTime = null;
let currentPlayerName = '';
const BEST_KEY = 'caves_best_time';
const LEADERBOARD_KEY = 'caves_leaderboard';
const PLAYER_NAME_KEY = 'caves_player_name';
const MAX_LEADERS = 7;
const FRAME_MS = 1000 / 60;
const MAX_FRAME_ACCUMULATOR = FRAME_MS * 5;

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildStars(seed, width, height) {
  const rand = mulberry32(seed);
  const count = 140;
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push({
      x: rand() * width,
      y: rand() * height,
      r: 0.6 + rand() * 1.6,
      a: 0.25 + rand() * 0.5
    });
  }
  return result;
}

function buildDecorations(seed, grid) {
  const rand = mulberry32(seed);
  const result = [];
  for (let y = 1; y < grid.length - 1; y++) {
    for (let x = 1; x < grid[y].length - 1; x++) {
      if (grid[y][x] !== '#') continue;
      if (grid[y - 1][x] !== '.') continue;
      if (rand() < 0.08) {
        result.push({
          x: x * TILE,
          y: y * TILE,
          type: rand() < 0.5 ? 'crystal' : 'mushroom',
          size: 0.7 + rand() * 0.6
        });
      }
    }
  }
  return result;
}

function buildLevel(index) {
  const base = levels[index];
  const grid = base.map.map((row) => row.split(''));
  const runes = [];
  let startX = 0;
  let startY = 0;
  let exit = { x: 0, y: 0 };

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const cell = grid[y][x];
      if (cell === 'P') {
        startX = x * TILE + 5;
        startY = y * TILE + 2;
        grid[y][x] = '.';
      }
      if (cell === 'E') {
        exit = { x: x * TILE, y: y * TILE };
      }
      if (cell === 'K' || cell === '1' || cell === '2' || cell === '3') {
        runes.push({
          x: x * TILE + 8,
          y: y * TILE + 8,
          type: cell,
          collected: false
        });
        grid[y][x] = '.';
      }
    }
  }

  return {
    grid,
    runes,
    exit,
    startX,
    startY,
    width: grid[0].length * TILE,
    height: grid.length * TILE
  };
}

function resetLevel(fullReset) {
  levelState = buildLevel(levelIndex);
  player.x = levelState.startX;
  player.y = levelState.startY;
  player.vx = 0;
  player.vy = 0;
  player.respawnX = levelState.startX;
  player.respawnY = levelState.startY;
  player.onGround = false;
  player.rotation = 0;
  player.targetRotation = 0;
  player.spinning = false;
  if (fullReset) {
    orderProgress = 0;
  }
  const seedBase = (levelIndex + 1) * 1337;
  stars = buildStars(seedBase, Math.max(levelState.width, VIEW_W), VIEW_H);
  decorations = buildDecorations(seedBase + 42, levelState.grid);
  updateHud();
}

function isSolid(tx, ty) {
  if (ty < 0 || ty >= levelState.grid.length || tx < 0 || tx >= levelState.grid[0].length) {
    return true;
  }
  const cell = levelState.grid[ty][tx];
  return cell === '#' || cell === 'B';
}

function isSpike(tx, ty) {
  if (ty < 0 || ty >= levelState.grid.length || tx < 0 || tx >= levelState.grid[0].length) {
    return false;
  }
  return levelState.grid[ty][tx] === '^';
}

function collectRune(rune) {
  if (rune.collected) return;
  if (levels[levelIndex].orderRequired) {
    const expected = String(orderProgress + 1);
    if (rune.type === expected) {
      rune.collected = true;
      orderProgress += 1;
    } else {
      orderProgress = 0;
      levelState.runes.forEach((r) => (r.collected = false));
    }
  } else {
    rune.collected = true;
  }
  updateHud();
}

function runesCollected() {
  if (levels[levelIndex].orderRequired) {
    return orderProgress === 3;
  }
  return levelState.runes.every((r) => r.collected);
}

function updateHud() {
  const level = levels[levelIndex];
  uiLevel.textContent = level.name;
  const total = level.orderRequired ? 3 : levelState.runes.length;
  const current = level.orderRequired ? orderProgress : levelState.runes.filter((r) => r.collected).length;
  uiRunes.textContent = `Руны: ${current}/${total}`;
  uiHint.textContent = level.hint;
  uiTime.textContent = `Время: ${formatTime(currentTime)}`;
  uiBest.textContent = `Рекорд: ${bestTime !== null ? formatTime(bestTime) : '--'}`;
}

function cleanPlayerName(name) {
  return name.trim().replace(/\s+/g, ' ').slice(0, 16);
}

function getLeaderboardNameKey(name) {
  return cleanPlayerName(name).toLocaleLowerCase('ru-RU');
}

function clearInput() {
  input.left = false;
  input.right = false;
  input.jump = false;
  jumpBuffer = 0;
}

function requirePlayerName() {
  const name = cleanPlayerName(playerNameInput.value);
  if (!name) {
    nameError.textContent = 'Сначала введи ник';
    playerNameInput.classList.add('invalid');
    playerNameInput.focus();
    return null;
  }

  nameError.textContent = '';
  playerNameInput.classList.remove('invalid');
  currentPlayerName = name;
  playerNameInput.value = name;
  localStorage.setItem(PLAYER_NAME_KEY, name);
  return name;
}

function loadLeaderboard() {
  const raw = localStorage.getItem(LEADERBOARD_KEY);
  if (!raw) return [];

  try {
    const records = JSON.parse(raw);
    if (!Array.isArray(records)) return [];
    const bestByPlayer = new Map();
    for (const record of records) {
      if (!record || typeof record.name !== 'string' || !Number.isFinite(record.time)) continue;
      const name = cleanPlayerName(record.name);
      const key = getLeaderboardNameKey(name);
      if (!key) continue;

      const existing = bestByPlayer.get(key);
      if (!existing || record.time < existing.time) {
        bestByPlayer.set(key, {
          name,
          time: record.time,
          date: typeof record.date === 'string' ? record.date : ''
        });
      }
    }

    return [...bestByPlayer.values()].sort((a, b) => a.time - b.time).slice(0, MAX_LEADERS);
  } catch (error) {
    return [];
  }
}

function saveLeaderboard(records) {
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(records.sort((a, b) => a.time - b.time).slice(0, MAX_LEADERS)));
}

function addLeaderboardResult(name, time) {
  const records = loadLeaderboard();
  const cleanName = cleanPlayerName(name);
  const playerKey = getLeaderboardNameKey(cleanName);
  const existing = records.find((record) => getLeaderboardNameKey(record.name) === playerKey);

  if (!existing) {
    records.push({
      name: cleanName,
      time,
      date: new Date().toISOString()
    });
  } else if (time < existing.time) {
    existing.name = cleanName;
    existing.time = time;
    existing.date = new Date().toISOString();
  }

  saveLeaderboard(records);
  return records.slice(0, MAX_LEADERS);
}

function renderLeaderboard(list) {
  const records = loadLeaderboard();
  list.innerHTML = '';

  if (records.length === 0) {
    const item = document.createElement('li');
    item.className = 'leaderboard-empty';
    item.textContent = 'Пока нет результатов';
    list.appendChild(item);
    return;
  }

  for (const record of records) {
    const item = document.createElement('li');
    const row = document.createElement('div');
    const name = document.createElement('span');
    const time = document.createElement('span');

    row.className = 'leaderboard-row';
    name.className = 'leaderboard-name';
    time.className = 'leaderboard-time';
    name.textContent = record.name;
    time.textContent = formatTime(record.time);

    row.append(name, time);
    item.appendChild(row);
    list.appendChild(item);
  }
}

function renderLeaderboards() {
  renderLeaderboard(leaderboardStart);
  renderLeaderboard(leaderboardWin);
}

function resolveCollisions(axis) {
  const left = Math.floor(player.x / TILE);
  const right = Math.floor((player.x + player.w - 1) / TILE);
  const top = Math.floor(player.y / TILE);
  const bottom = Math.floor((player.y + player.h - 1) / TILE);

  if (axis === 'x') {
    if (player.vx > 0) {
      for (let y = top; y <= bottom; y++) {
        if (isSolid(right, y)) {
          player.x = right * TILE - player.w;
          player.vx = 0;
          break;
        }
      }
    } else if (player.vx < 0) {
      for (let y = top; y <= bottom; y++) {
        if (isSolid(left, y)) {
          player.x = (left + 1) * TILE;
          player.vx = 0;
          break;
        }
      }
    }
  } else {
    if (player.vy > 0) {
      player.onGround = false;
      for (let x = left; x <= right; x++) {
        if (isSolid(x, bottom)) {
          player.y = bottom * TILE - player.h;
          player.vy = 0;
          player.onGround = true;
          break;
        }
      }
    } else if (player.vy < 0) {
      for (let x = left; x <= right; x++) {
        if (isSolid(x, top)) {
          player.y = (top + 1) * TILE;
          player.vy = 0;
          break;
        }
      }
    }
  }
}

function checkSpikes() {
  const left = Math.floor(player.x / TILE);
  const right = Math.floor((player.x + player.w - 1) / TILE);
  const top = Math.floor(player.y / TILE);
  const bottom = Math.floor((player.y + player.h - 1) / TILE);

  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (isSpike(x, y)) {
        resetLevel(true);
        return;
      }
    }
  }
}

function update() {
  const speed = 3.2;
  const gravity = 0.6;
  const jumpPower = -11;
  const spinSpeed = 0.22;

  player.vx = 0;
  if (input.left) player.vx = -speed;
  if (input.right) player.vx = speed;

  if (player.onGround) {
    coyoteTime = COYOTE_FRAMES;
  } else {
    coyoteTime = Math.max(0, coyoteTime - 1);
  }

  if (jumpBuffer > 0) {
    jumpBuffer -= 1;
  }

  if (jumpBuffer > 0 && coyoteTime > 0) {
    player.vy = jumpPower;
    player.onGround = false;
    player.spinDirection = player.vx < 0 ? -1 : 1;
    player.targetRotation += player.spinDirection * Math.PI / 2;
    player.spinning = true;
    jumpBuffer = 0;
    coyoteTime = 0;
  }

  if (player.spinning) {
    const remaining = player.targetRotation - player.rotation;
    const step = Math.sign(remaining) * Math.min(Math.abs(remaining), spinSpeed);
    player.rotation += step;
  }

  player.vy += gravity;
  if (player.vy > 14) player.vy = 14;

  player.x += player.vx;
  resolveCollisions('x');

  player.y += player.vy;
  resolveCollisions('y');
  if (player.onGround && player.spinning) {
    player.rotation = player.targetRotation;
    player.spinning = false;
  }

  checkSpikes();

  for (const rune of levelState.runes) {
    if (rune.collected) continue;
    if (
      player.x < rune.x + 16 &&
      player.x + player.w > rune.x &&
      player.y < rune.y + 16 &&
      player.y + player.h > rune.y
    ) {
      collectRune(rune);
    }
  }

  if (runesCollected()) {
    const exit = levelState.exit;
    if (
      player.x < exit.x + TILE &&
      player.x + player.w > exit.x &&
      player.y < exit.y + TILE &&
      player.y + player.h > exit.y
    ) {
      levelIndex += 1;
      if (levelIndex >= levels.length) {
        showWin();
        return;
      }
      resetLevel(true);
    }
  }
}

function drawTile(x, y, color, dark) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(x + 2, y + 2, TILE - 4, 4);
  ctx.fillStyle = dark;
  ctx.fillRect(x + TILE - 4, y + 3, 3, TILE - 6);
}

function draw() {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);

  const camX = Math.max(0, Math.min(player.x - VIEW_W / 2, levelState.width - VIEW_W));

  ctx.save();
  ctx.translate(-camX, 0);

  drawBackground(camX);

  drawDecorations();

  for (let y = 0; y < levelState.grid.length; y++) {
    for (let x = 0; x < levelState.grid[y].length; x++) {
      const cell = levelState.grid[y][x];
      if (cell === '#') {
        const shade = (x + y) % 2 === 0 ? '#3b3f55' : '#2f334a';
        const dark = (x + y) % 2 === 0 ? '#2a2e43' : '#24283c';
        drawTile(x * TILE, y * TILE, shade, dark);
      }
      if (cell === 'B') {
        const base = (x + y) % 2 === 0 ? '#4a576e' : '#3e4a63';
        const dark = (x + y) % 2 === 0 ? '#2c354a' : '#273041';
        drawTile(x * TILE, y * TILE, base, dark);
        ctx.fillStyle = 'rgba(92, 225, 230, 0.3)';
        ctx.fillRect(x * TILE + 6, y * TILE + 6, TILE - 12, TILE - 12);
      }
      if (cell === '^') {
        const spikeX = x * TILE;
        const spikeY = y * TILE;
        ctx.fillStyle = '#ff5f6d';
        ctx.beginPath();
        ctx.moveTo(spikeX + 4, spikeY + TILE - 4);
        ctx.lineTo(spikeX + TILE / 2, spikeY + 4);
        ctx.lineTo(spikeX + TILE - 4, spikeY + TILE - 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.fillRect(spikeX + TILE / 2 - 2, spikeY + 7, 4, 10);
      }
    }
  }

  for (const rune of levelState.runes) {
    if (rune.collected) continue;
    const colorMap = { K: '#f7c948', 1: '#5ce1e6', 2: '#f7c948', 3: '#ff9f43' };
    const runeColor = colorMap[rune.type] || '#f7c948';
    ctx.save();
    ctx.shadowColor = runeColor;
    ctx.shadowBlur = 12;
    ctx.fillStyle = runeColor;
    ctx.beginPath();
    ctx.arc(rune.x + 8, rune.y + 8, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const exit = levelState.exit;
  const portalOpen = runesCollected();
  ctx.save();
  ctx.fillStyle = portalOpen ? '#7bff83' : '#586089';
  ctx.fillRect(exit.x, exit.y, TILE, TILE);
  const pulse = portalOpen ? 0.5 + Math.sin(globalTime / 200) * 0.5 : 0.15;
  ctx.globalAlpha = 0.6 + pulse * 0.4;
  ctx.fillStyle = portalOpen ? '#b2ffd0' : '#2a2f45';
  ctx.beginPath();
  ctx.ellipse(exit.x + 16, exit.y + 16, 8 + pulse * 4, 12 + pulse * 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawPlayer();

  ctx.restore();
  drawVignette();
}

function loop(timestamp) {
  if (!gameRunning) return;
  globalTime = timestamp;
  currentTime = (timestamp - runStart) / 1000;
  const elapsed = lastTime ? timestamp - lastTime : FRAME_MS;
  lastTime = timestamp;

  frameAccumulator += Math.min(elapsed, MAX_FRAME_ACCUMULATOR);
  while (frameAccumulator >= FRAME_MS) {
    update();
    frameAccumulator -= FRAME_MS;
  }

  draw();
  updateHud();
  animationFrameId = requestAnimationFrame(loop);
}

function startGame() {
  if (!requirePlayerName()) return;
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  clearInput();
  overlay.classList.add('hidden');
  winOverlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  gameRunning = true;
  runStart = performance.now();
  currentTime = 0;
  lastTime = performance.now();
  frameAccumulator = 0;
  updateHud();
  animationFrameId = requestAnimationFrame(loop);
}

function showWin() {
  gameRunning = false;
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  clearInput();
  currentTime = (performance.now() - runStart) / 1000;
  if (bestTime === null || currentTime < bestTime) {
    bestTime = currentTime;
    localStorage.setItem(BEST_KEY, String(bestTime));
  }
  addLeaderboardResult(currentPlayerName, currentTime);
  renderLeaderboards();
  winTime.textContent = `Время: ${formatTime(currentTime)}`;
  winBest.textContent = `Рекорд: ${formatTime(bestTime)}`;
  winOverlay.classList.remove('hidden');
}

function restartGame() {
  enterFullscreen();
  levelIndex = 0;
  resetLevel(true);
  startGame();
}

function pauseGame() {
  if (!gameRunning) return;
  gameRunning = false;
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  pauseStarted = performance.now();
  clearInput();
  pauseOverlay.classList.remove('hidden');
}

function resumeGame() {
  if (gameRunning || pauseOverlay.classList.contains('hidden')) return;
  runStart += performance.now() - pauseStarted;
  lastTime = performance.now();
  frameAccumulator = 0;
  gameRunning = true;
  pauseOverlay.classList.add('hidden');
  animationFrameId = requestAnimationFrame(loop);
}

function showMainMenu() {
  gameRunning = false;
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  clearInput();
  levelIndex = 0;
  currentTime = 0;
  resetLevel(true);
  winOverlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  overlay.classList.remove('hidden');
  renderLeaderboards();
  updateHud();
}

function enterFullscreen() {
  if (!document.fullscreenElement && gameWrap.requestFullscreen) {
    gameWrap.requestFullscreen().catch(() => {});
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    enterFullscreen();
  }
}

function setupInput() {
  const requestJump = () => {
    jumpBuffer = JUMP_BUFFER_FRAMES;
  };

  window.addEventListener('keydown', (event) => {
    if (event.target === playerNameInput) {
      if (event.code === 'Enter' && requirePlayerName()) {
        enterFullscreen();
        startGame();
      }
      return;
    }
    if (event.code === 'Escape') {
      if (gameRunning) {
        pauseGame();
      } else if (!pauseOverlay.classList.contains('hidden')) {
        resumeGame();
      }
      return;
    }
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') input.left = true;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') input.right = true;
    if (event.code === 'ArrowUp' || event.code === 'KeyW' || event.code === 'Space') {
      if (!input.jump) {
        requestJump();
      }
      input.jump = true;
    }
  });

  window.addEventListener('keyup', (event) => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') input.left = false;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') input.right = false;
    if (event.code === 'ArrowUp' || event.code === 'KeyW' || event.code === 'Space') input.jump = false;
  });

  const btnLeft = document.getElementById('btn-left');
  const btnRight = document.getElementById('btn-right');
  const btnJump = document.getElementById('btn-jump');

  const bindButton = (button, key) => {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (key === 'jump') {
        jumpBuffer = JUMP_BUFFER_FRAMES;
        input.jump = true;
      } else {
        input[key] = true;
      }
    });
    button.addEventListener('pointerup', (event) => {
      event.preventDefault();
      if (key === 'jump') {
        input.jump = false;
      } else {
        input[key] = false;
      }
    });
    button.addEventListener('pointerleave', () => {
      if (key === 'jump') {
        input.jump = false;
      } else {
        input[key] = false;
      }
    });
  };

  bindButton(btnLeft, 'left');
  bindButton(btnRight, 'right');
  bindButton(btnJump, 'jump');
}

startBtn.addEventListener('click', () => {
  if (requirePlayerName()) {
    enterFullscreen();
    startGame();
  }
});
restartBtn.addEventListener('click', restartGame);
fullscreenBtn.addEventListener('click', toggleFullscreen);
pauseBtn.addEventListener('click', pauseGame);
resumeBtn.addEventListener('click', resumeGame);
menuBtn.addEventListener('click', showMainMenu);
pauseMenuBtn.addEventListener('click', showMainMenu);
playerNameInput.addEventListener('input', () => {
  if (cleanPlayerName(playerNameInput.value)) {
    nameError.textContent = '';
    playerNameInput.classList.remove('invalid');
  }
});

setupInput();
bestTime = loadBestTime();
playerNameInput.value = localStorage.getItem(PLAYER_NAME_KEY) || '';
renderLeaderboards();
resetLevel(true);
updateHud();

function drawBackground(camX) {
  ctx.save();
  ctx.translate(camX, 0);
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, '#0e1228');
  grad.addColorStop(0.5, '#141b3b');
  grad.addColorStop(1, '#0b1022');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.translate(-camX * 0.25, 0);
  for (const star of stars) {
    ctx.fillStyle = `rgba(205, 220, 255, ${star.a})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawDecorations() {
  for (const deco of decorations) {
    if (deco.type === 'crystal') {
      const baseX = deco.x + TILE / 2;
      const baseY = deco.y;
      ctx.save();
      ctx.fillStyle = 'rgba(92, 225, 230, 0.5)';
      ctx.beginPath();
      ctx.moveTo(baseX, baseY - 6 * deco.size);
      ctx.lineTo(baseX - 6 * deco.size, baseY - 2 * deco.size);
      ctx.lineTo(baseX + 5 * deco.size, baseY - 1 * deco.size);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      const capX = deco.x + TILE / 2;
      const capY = deco.y - 2;
      ctx.fillStyle = '#ff9f43';
      ctx.beginPath();
      ctx.ellipse(capX, capY, 6 * deco.size, 4 * deco.size, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6b4a2a';
      ctx.fillRect(capX - 2 * deco.size, capY, 4 * deco.size, 6 * deco.size);
    }
  }
}

function drawPlayer() {
  const cx = player.x + player.w / 2;
  const cy = player.y + player.h / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(player.rotation);
  ctx.fillStyle = '#5ce1e6';
  ctx.fillRect(-player.w / 2, -player.h / 2, player.w, player.h);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(-player.w / 2 + 1, -player.h / 2 + 1, player.w - 2, player.h - 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.fillRect(-player.w / 2 + 4, -player.h / 2 + 4, player.w - 8, 4);
  ctx.fillStyle = '#f7c948';
  ctx.fillRect(-3, -player.h / 2 + 2, 6, 5);
  ctx.fillStyle = '#0b1022';
  ctx.fillRect(-player.w / 2 + 6, -player.h / 2 + 8, 4, 4);
  ctx.fillRect(player.w / 2 - 10, -player.h / 2 + 8, 4, 4);
  ctx.restore();
}

function drawVignette() {
  const gradient = ctx.createRadialGradient(
    VIEW_W / 2,
    VIEW_H / 2,
    VIEW_H / 4,
    VIEW_W / 2,
    VIEW_H / 2,
    VIEW_H / 1.05
  );
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function formatTime(seconds) {
  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  const tenths = Math.floor((total * 10) % 10);
  return `${minutes}:${String(secs).padStart(2, '0')}.${tenths}`;
}

function loadBestTime() {
  const raw = localStorage.getItem(BEST_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}
