const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const uiLevel = document.getElementById('level-name');
const uiRunes = document.getElementById('rune-status');
const uiHint = document.getElementById('hint');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');

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
      '#............K...............#',
      '#.................####.......#',
      '#.............K..............#',
      '#....####....................#',
      '#............####............#',
      '#..P.....................E...#',
      '#............####............#',
      '#........K...................#',
      '#...............####.........#',
      '#......................^.....#',
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
      '#.....1..............####....#',
      '#............####............#',
      '#..P.....................E...#',
      '#............####............#',
      '#.................2..........#',
      '#..####......................#',
      '#...............####.........#',
      '#.....................3......#',
      '#............####............#',
      '#...............^............#',
      '#............####............#',
      '#.............................#',
      '##############################'
    ]
  },
  {
    name: 'Пещера Огня',
    hint: 'Подсказка: сначала 1, потом 2, затем 3. Шипы сбрасывают попытку.',
    orderRequired: true,
    map: [
      '##############################',
      '#....1...........####........#',
      '#............####...........E#',
      '#..P.........................#',
      '#............####............#',
      '#.................2..........#',
      '#..####......................#',
      '#...............####.........#',
      '#.....................3......#',
      '#............####............#',
      '#..........^.................#',
      '#............####............#',
      '#.............................#',
      '##############################'
    ]
  }
];

const input = {
  left: false,
  right: false,
  jump: false,
  jumpPressed: false
};

const player = {
  x: 0,
  y: 0,
  w: 22,
  h: 28,
  vx: 0,
  vy: 0,
  onGround: false,
  respawnX: 0,
  respawnY: 0
};

let levelIndex = 0;
let levelState = null;
let orderProgress = 0;
let gameRunning = false;
let lastTime = 0;

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
  if (fullReset) {
    orderProgress = 0;
  }
  updateHud();
}

function isSolid(tx, ty) {
  if (ty < 0 || ty >= levelState.grid.length || tx < 0 || tx >= levelState.grid[0].length) {
    return true;
  }
  return levelState.grid[ty][tx] === '#';
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

function update(dt) {
  const speed = 3.2;
  const gravity = 0.6;
  const jumpPower = -11;

  player.vx = 0;
  if (input.left) player.vx = -speed;
  if (input.right) player.vx = speed;

  if (input.jumpPressed && player.onGround) {
    player.vy = jumpPower;
    player.onGround = false;
  }
  input.jumpPressed = false;

  player.vy += gravity;
  if (player.vy > 14) player.vy = 14;

  player.x += player.vx;
  resolveCollisions('x');

  player.y += player.vy;
  resolveCollisions('y');

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
        levelIndex = 0;
      }
      resetLevel(true);
    }
  }
}

function drawTile(x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, TILE, TILE);
}

function draw() {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);

  const camX = Math.max(0, Math.min(player.x - VIEW_W / 2, levelState.width - VIEW_W));

  ctx.save();
  ctx.translate(-camX, 0);

  for (let y = 0; y < levelState.grid.length; y++) {
    for (let x = 0; x < levelState.grid[y].length; x++) {
      const cell = levelState.grid[y][x];
      if (cell === '#') {
        const shade = (x + y) % 2 === 0 ? '#3b3f55' : '#2f334a';
        drawTile(x * TILE, y * TILE, shade);
      }
      if (cell === '^') {
        ctx.fillStyle = '#ff5f6d';
        ctx.beginPath();
        ctx.moveTo(x * TILE + 4, y * TILE + TILE - 4);
        ctx.lineTo(x * TILE + TILE / 2, y * TILE + 4);
        ctx.lineTo(x * TILE + TILE - 4, y * TILE + TILE - 4);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  for (const rune of levelState.runes) {
    if (rune.collected) continue;
    const colorMap = { K: '#f7c948', 1: '#5ce1e6', 2: '#f7c948', 3: '#ff9f43' };
    ctx.fillStyle = colorMap[rune.type] || '#f7c948';
    ctx.beginPath();
    ctx.arc(rune.x + 8, rune.y + 8, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  const exit = levelState.exit;
  ctx.fillStyle = runesCollected() ? '#7bff83' : '#586089';
  ctx.fillRect(exit.x, exit.y, TILE, TILE);
  ctx.fillStyle = '#101422';
  ctx.fillRect(exit.x + 8, exit.y + 8, 6, 12);

  ctx.fillStyle = '#5ce1e6';
  ctx.fillRect(player.x, player.y, player.w, player.h);

  ctx.restore();
}

function loop(timestamp) {
  if (!gameRunning) return;
  const dt = (timestamp - lastTime) / 16.67;
  lastTime = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function startGame() {
  overlay.classList.add('hidden');
  gameRunning = true;
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function setupInput() {
  window.addEventListener('keydown', (event) => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') input.left = true;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') input.right = true;
    if (event.code === 'ArrowUp' || event.code === 'KeyW' || event.code === 'Space') {
      if (!input.jump) {
        input.jumpPressed = true;
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
        input.jumpPressed = true;
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

startBtn.addEventListener('click', startGame);

setupInput();
resetLevel(true);
