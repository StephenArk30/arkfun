"""pytest 共享配置：把 src/training/ 加入 sys.path（平铺模块互相 import 需要）。"""

import sys
from pathlib import Path

TRAINING_DIR = Path(__file__).resolve().parents[1]
if str(TRAINING_DIR) not in sys.path:
    sys.path.insert(0, str(TRAINING_DIR))
