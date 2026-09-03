import { SnakeGameEnv, SnakeRelativeAction } from '@arkfun/snakegame';
import type { WindowObservation } from '@arkfun/snakegame';
import {
  createAStarStrategy,
  createOnnxPlayer,
  createOnnxSnakePlayer,
  createOnnxStrategy,
  getStrategy,
  listStrategies,
  registerStrategy,
} from '../src/index';
import type { StrategyPlayer, OrtLike } from '../src/index';

// onnxruntime-web 以 UMD 全局脚本按需从 CDN 加载（wasm 同目录自动拉取），
// 避免 rollup 打包 ~MB 级运行时
const ORT_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.0/dist/ort.min.js';
const WINDOW_SIZE = 15;

// 键盘模式作为特殊策略 id，不进注册表（无异步加载过程）
const HUMAN = 'human';

type CompareCell = { score: number; steps: number };
type ComparePolicy = {
  name: string;
  label: string;
  cells: Record<string, Record<string, CompareCell>>;
};
type CompareReport = {
  meta: { episodes: number; sizes: string[]; barriers: number[] };
  policies: ComparePolicy[];
};

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const input = (id: string) => $(id) as HTMLInputElement;

let env: SnakeGameEnv | null = null;
let observation: WindowObservation | null = null;
let mapCol = 10;
let mapRow = 10;
let player: StrategyPlayer | null = null;
let strategyId = 'astar';
let pendingAction: SnakeRelativeAction | null = null;
let running = false;
let frameTimer: number | null = null;
let ortLoading: Promise<OrtLike> | null = null;

function status(text: string) {
  $('status').textContent = text;
}

function readConfig() {
  return {
    col: Number(input('col').value),
    row: Number(input('row').value),
    barriers: [0, Number(input('barriers').value)] as [number, number],
    barrierPlacement: 'reachable' as const,
    actionMode: 'relative' as const,
    observationType: 'window' as const,
    windowSize: WINDOW_SIZE,
    maxSteps: 2000,
    foodReward: 1,
    stepReward: -0.01,
    deathReward: -1,
    winReward: 10,
  };
}

function scheduleFrame(delay: number) {
  frameTimer = window.setTimeout(() => {
    frameTimer = null;
    // frame 为函数声明（提升），相互引用无法通过定义顺序消除
    // eslint-disable-next-line no-use-before-define
    window.requestAnimationFrame(() => { frame(); });
  }, delay);
}

function stopGame() {
  running = false;
  if (frameTimer !== null) {
    window.clearTimeout(frameTimer);
    frameTimer = null;
  }
}

function startGame() {
  stopGame();
  const cfg = readConfig();
  mapCol = cfg.col;
  mapRow = cfg.row;
  env = new SnakeGameEnv('snake_container', cfg);
  const { observation: obs } = env.reset(Math.floor(Math.random() * 2 ** 31));
  observation = obs as WindowObservation;
  running = true;
  scheduleFrame(0);
}

async function frame() {
  if (!running || env === null || observation === null) return;
  env.render();

  let action: SnakeRelativeAction;
  if (strategyId === HUMAN) {
    action = pendingAction ?? SnakeRelativeAction.Forward;
    pendingAction = null;
  } else if (player !== null) {
    action = await player({
      env,
      window: observation.window,
      scalars: observation.scalars,
      col: mapCol,
      row: mapRow,
    });
  } else {
    status('策略未加载成功：请选择其他策略，或用下方文件选择器加载 .onnx');
    stopGame();
    return;
  }

  const out = env.step(action);
  observation = out.observation as WindowObservation;
  if (out.done) {
    running = false;
    status(`本局结束（${out.info.cause ?? 'unknown'}），得分 ${out.info.score}`);
    return;
  }
  scheduleFrame(Number(input('speed').value));
}

async function loadOrt(): Promise<OrtLike> {
  if (ortLoading === null) {
    ortLoading = new Promise<OrtLike>((resolve, reject) => {
      const existing = (window as unknown as { ort?: OrtLike }).ort;
      if (existing != null) {
        resolve(existing);
        return;
      }
      const script = document.createElement('script');
      script.setAttribute('src', ORT_CDN);
      script.onload = () => {
        const { ort } = window as unknown as { ort?: OrtLike };
        if (ort == null) reject(new Error('onnxruntime-web 加载后全局 ort 不存在'));
        else resolve(ort);
      };
      script.onerror = () => reject(new Error(`加载 onnxruntime-web 失败：${ORT_CDN}`));
      document.head.appendChild(script);
    });
  }
  return ortLoading;
}

// 切换策略：内置策略（A*）秒开；ONNX 策略失败时给出可操作的提示
async function selectStrategy(id: string) {
  strategyId = id;
  player = null;
  if (id === HUMAN) {
    status('键盘模式：← 左转 / ↑ 直行 / → 右转');
    return;
  }
  const strategy = getStrategy(id);
  if (strategy == null) {
    status(`未知策略 ${id}`);
    return;
  }
  status(`加载策略「${strategy.label}」...`);
  try {
    player = await strategy.load();
    status(`策略「${strategy.label}」就绪，点击「开始」`);
  } catch (err) {
    strategyId = HUMAN;
    status(`策略「${strategy.label}」加载失败：${err instanceof Error ? err.message : String(err)}`
      + '（先运行训练与 export.py，或用文件选择器上传 .onnx）');
  }
}

function bindControls() {
  $('start').addEventListener('click', startGame);
  $('stop').addEventListener('click', () => {
    stopGame();
    status('已停止');
  });
  $('strategy').addEventListener('change', () => {
    selectStrategy(input('strategy').value);
  });
  input('file').addEventListener('change', async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file == null) return;
    try {
      // 上传模型注册为自定义策略并立即选中（可反复上传替换）
      player = createOnnxPlayer(
        await createOnnxSnakePlayer(await loadOrt(), await file.arrayBuffer(), WINDOW_SIZE),
      );
      strategyId = 'custom';
      input('strategy').value = 'custom';
      status(`已加载自定义模型 ${file.name}，点击「开始」`);
    } catch (err) {
      status(`模型加载失败：${err instanceof Error ? err.message : String(err)}`);
    }
  });
  window.addEventListener('keydown', (event) => {
    if (strategyId !== HUMAN) return;
    if (event.key === 'ArrowLeft') pendingAction = SnakeRelativeAction.TurnLeft;
    else if (event.key === 'ArrowUp') pendingAction = SnakeRelativeAction.Forward;
    else if (event.key === 'ArrowRight') pendingAction = SnakeRelativeAction.TurnRight;
    else return;
    event.preventDefault();
  });
}

// 对比数据区块：src/training/compare.py 产出 models/compare.json 后自动渲染；
// 不存在时整个区块隐藏（纯本地游玩不受影响）
async function loadCompare() {
  let report: CompareReport;
  try {
    const resp = await fetch('compare.json');
    if (!resp.ok) return;
    report = await resp.json();
  } catch {
    return;
  }
  const host = $('compare');
  const title = document.createElement('h3');
  title.textContent = '策略对比（来自 src/training/compare.py）';
  host.appendChild(title);
  report.meta.sizes.forEach((size) => {
    const table = document.createElement('table');
    const header = table.insertRow();
    header.insertCell().textContent = `${size} \\ 障碍数`;
    report.meta.barriers.forEach((b) => {
      header.insertCell().textContent = `b=${b}`;
    });
    report.policies.forEach((policy) => {
      const row = table.insertRow();
      row.insertCell().textContent = policy.label;
      report.meta.barriers.forEach((b) => {
        const cell = policy.cells[size]?.[String(b)];
        row.insertCell().textContent = cell == null ? '-' : `${cell.score} (${cell.steps})`;
      });
    });
    host.appendChild(table);
  });
  host.style.display = 'block';
}

function registerBuiltinStrategies() {
  registerStrategy(createAStarStrategy('astar', 'A* 启发式（老师）'));
  // 模型从包内 models/ 目录提供（rollup dev server 的第二静态根），
  // 训练后 export.py 直接写入 models/，无需拷贝
  registerStrategy(createOnnxStrategy('ppo', 'PPO（从零训练）', loadOrt, 'ppo.onnx', WINDOW_SIZE));
  registerStrategy(createOnnxStrategy('bc_ppo', 'BC+PPO（A* 预训练）', loadOrt, 'bc_ppo.onnx', WINDOW_SIZE));
}

async function bootstrap() {
  registerBuiltinStrategies();
  const select = $('strategy') as unknown as HTMLSelectElement;
  listStrategies().forEach((strategy) => {
    const option = document.createElement('option');
    option.value = strategy.id;
    option.textContent = strategy.label;
    select.appendChild(option);
  });
  const humanOption = document.createElement('option');
  humanOption.value = HUMAN;
  humanOption.textContent = '键盘（自己玩）';
  select.appendChild(humanOption);
  select.value = strategyId;

  bindControls();
  await selectStrategy(strategyId);
  loadCompare();
}

bootstrap();
