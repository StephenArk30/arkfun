# snakegame-ai

Train a generalist snake AI with PPO on [@arkfun/snakegame](../snakegame),
and show it off in the browser.

> 📖 New to the model? [docs/MODEL.md](./docs/MODEL.md)（中文）explains the observation
> encoding, network architecture, PPO setup, and how to read eval results.
> Zero-RL-background? Start with [docs/RL-TUTORIAL.md](./docs/RL-TUTORIAL.md)（中文）,
> a from-scratch walkthrough of RL and PPO using snake as the running example.

- **Any map size, any barrier count**: training uses domain randomization
  (map size / barrier count / initial snake length resampled every episode),
  and size-invariant observations (`window` mode: 15×15×3 NHWC around the
  head + 11 global scalars).
- **Two training recipes**: plain PPO from scratch (`train.py`), and
  BC+PPO (`imitate.py`) — the built-in A* teacher first bootstraps the
  policy via behavioral cloning, then PPO fine-tunes beyond the teacher
  (the AlphaGo recipe, snake edition).
- **Zero drift between training and demo**: observations are produced by the
  *same* `observation.ts` on both sides — in training via a
  [PyMiniRacer](https://github.com/sqreen/py-mini-racer) (embedded V8) bridge,
  in the browser demo directly. The model is just a pure function over those
  tensors (ONNX).
- **No Node.js workers**: all headless envs live inside a single V8 isolate in
  the Python process; each vectorized step is one cross-boundary call with
  binary (ArrayBuffer) payloads.

## Layout

```
packages/snakegame-ai/
├── src/               # TS: strategy registry + ONNX inference player
│   └── training/      # Python (uv workspace member, root pyproject.toml)
│       ├── bridge.py  # PyMiniRacer bridge + JS batch rollout + A* teacher helpers
│       ├── env.py     # SB3 VecEnv with episode-boundary domain randomization
│       ├── policy.py  # CNN (window) + MLP (scalars) feature extractor
│       ├── train.py   # PPO training entry
│       ├── imitate.py # BC (A* teacher) + PPO fine-tune
│       ├── export.py  # PyTorch → ONNX (defaults into models/)
│       ├── eval.py    # single-model generalization matrix
│       ├── compare.py # multi-policy comparison → models/compare.json
│       └── tests/
├── example/           # web demo: canvas rendering + strategy picker + compare table
└── models/            # demo-facing artifacts (onnx + compare.json, committed)
```

## Train

```bash
# 1. build the JS env (headless bundle)
npx lerna run build --scope=@arkfun/snakegame

# 2. sync the python workspace (root .venv)
uv sync

# 3a. plain PPO (defaults: 8×8 ~ 20×20 maps, 0 ~ 30 barriers, 1M steps)
uv run --package snakegame-ai python \
  packages/snakegame-ai/src/training/train.py --total-timesteps 1_000_000

# 3b. BC+PPO: A* teacher bootstrap + same PPO fine-tune
#     (keep --total-timesteps equal to 3a for a fair comparison)
uv run --package snakegame-ai python \
  packages/snakegame-ai/src/training/imitate.py --total-timesteps 1_000_000

# 4. compare all policies (prints a matrix, writes models/compare.json)
uv run --package snakegame-ai python \
  packages/snakegame-ai/src/training/compare.py

# 5. export each policy to ONNX — straight into models/ (demo loads from there)
uv run --package snakegame-ai python packages/snakegame-ai/src/training/export.py
uv run --package snakegame-ai python packages/snakegame-ai/src/training/export.py \
  --model packages/snakegame-ai/src/training/output/bc_ppo_snake.zip \
  --output packages/snakegame-ai/models/bc_ppo.onnx

# tests
uv run --package snakegame-ai pytest packages/snakegame-ai/src/training/tests
```

Artifacts:

- `src/training/output/` — training state (PPO zips, tensorboard), gitignored;
- `models/` — the demo-facing home for exported `.onnx` files and
  `compare.json` (small, committed to git so a fresh clone can run the demo
  out of the box).

## Web demo

```bash
npx lerna run dev --scope=@arkfun/snakegame-ai
# open http://localhost:10001 (see rollup-plugin-serve output)
```

The strategy picker ships with:

- **A\* heuristic** — the built-in teacher, zero dependencies, always available;
- **PPO / BC+PPO** — fetched from `models/` (the dev server serves it as a
  second static root, see step 5 above). Missing files degrade gracefully:
  pick another strategy or upload any `.onnx` via the file input;
- **Keyboard** — play yourself (← turn left, ↑ forward, → turn right — the
  same relative action space the policies are trained on).

If `dist/compare.json` exists, the page renders the comparison table from
`compare.py` at the bottom.

Adding a new strategy later = one `registerStrategy(...)` call in
`example/index.ts` (see `src/strategy.ts`); the picker and the game loop
need no changes.

The demo loads `onnxruntime-web` from a CDN on demand.

## How the bridge works

`SnakeGameEnv(null, ...)` is fully headless (logic/render decoupled), so
`bridge.py` loads `packages/snakegame/dist/index.cjs` into an embedded V8
isolate and injects batch helpers:

```
python:  actions[N]  ──────────►  js: stepBatch  (one V8 call)
python:  windows/scalars/rewards/done ◄──────────  ArrayBuffer (binary)
```

The same helpers also expose `aStarSync` (the built-in A*, sync-extracted for
the V8 bridge) as a teacher for `imitate.py` and as a baseline for
`compare.py`.

A single isolate comfortably hosts thousands of envs (~2–5 KB each); the real
training bottleneck is PyTorch, not the env.
