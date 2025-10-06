# Canvas 渲染目录

- 封装 Canvas/WebGL/WebGPU 渲染逻辑。
- 建议按模块划分：
- `renderer.ts`：渲染控制器入口。
- `systems/`：动画、粒子等渲染系统。
- `geometry/`：布局与命中测试工具。
- 与 React 层通过消息接口或控制器实例交互，不直接依赖具体 UI 组件。
- `Renderer.ts` 提供 60FPS 渲染循环、图层系统、Camera 缩放/平移、高 DPI 适配以及批量渲染优化；可选择 WebGL 模式。

## Animation System

- `AnimationSystem` 与渲染循环自动同步（`Renderer` 默认内置，可通过 `renderer.getAnimationSystem()` 取得实例）。
- `Tween` 支持位置、旋转、缩放、透明度插值，默认使用线性缓动，可选 `easing.ts` 中的预设函数。
- `Delay`、`Sequence`、`Parallel` 组合构建串行/并行动画，`AnimationQueue` 用于管理复杂时序。
- 每个动画句柄 (`AnimationQueueHandle`) 暴露 `finished` Promise，便于与游戏逻辑同步，并支持 `interrupt()`、`reset()`、`clear()` 等控制。
- 动画在完成或被中断后根据配置自动清理，可通过 `QueueOptions` 控制自动移除或中断行为。

```ts
import { EASING_PRESETS } from "@/canvas/animation";

const renderer = new Renderer(canvas);
const animations = renderer.getAnimationSystem();

const handle = animations.play(cardTransform, (timeline) => {
  timeline
    .tween({
      to: { position: { x: 220, y: 180 } },
      duration: 0.35,
      easing: EASING_PRESETS.easeOutCubic,
    })
    .tweenParallel([
      { to: { scale: 1.12 }, duration: 0.25, easing: EASING_PRESETS.easeOutBack },
      { to: { rotation: Math.PI / 16 }, duration: 0.25 },
    ])
    .wait(0.1)
    .tween({ to: { opacity: 0 }, duration: 0.2, easing: EASING_PRESETS.easeInQuad });
});

await handle.finished; // 与游戏事件同步
```

## FX Systems

- `Renderer` 默认挂载 `EffectComposer`，可通过 `renderer.getEffectComposer()` 访问。
- `EffectComposer.particles` 提供对象池粒子系统，支持伤害数字、法术爆炸、死亡残骸等效果。
- `EffectComposer.screen` 管理屏幕震动与闪光，自动注入至非 UI 图层的渲染矩阵。
- `EffectComposer.cards` 内置卡牌出牌轨迹、攻击冲刺、死亡收缩、悬停升起等动画 Preset。
- `UIEffects` 面向 DOM 按钮与状态提示的细节反馈（按压缩放、状态高亮、闪烁提示）。
- 所有特效均复用内部对象池与批量绘制，减少频繁 GC，支持高频事件。

### GameCanvasBridge

- `GameCanvasBridge` 监听 `GameEventBus`，在 `state:updated` 或 `canvas:invalidate` 时自动将调试信息绘制到指定图层（默认 `ui`）。
- 通过事件驱动模型确保 React 状态变化后 Canvas 渲染同步刷新，可自定义覆盖层内容或在回调中注入自定义绘制逻辑。

```ts
import { Renderer } from "@/canvas";

const renderer = new Renderer(canvasElement);
const fx = renderer.getEffectComposer();

const bridge = new GameCanvasBridge(renderer);

// 粒子与震动
fx.triggerHit({ x: impactX, y: impactY }, {
  color: "rgba(248,113,113,0.9)",
  shake: { intensity: 12, duration: 0.35 },
  flash: { color: "rgba(255,255,255,0.35)", duration: 0.18 },
});

fx.spawnDamageNumber(-18, { x: attacker.x, y: attacker.y - 60 }, true);

// 卡牌动作预设
fx.playCard(cardTransform, {
  start: { x: handX, y: handY },
  end: { x: boardX, y: boardY },
  arcHeight: 120,
});

// UI 按钮反馈
import { UIEffects } from "@/canvas/fx";

const uiFx = new UIEffects();
const detach = uiFx.attachButton(buttonElement, { glowColor: "rgba(59,130,246,0.45)" });

// 在组件卸载时解除监听
detach();
```

## 性能优化

- `Renderer` 内置脏矩形（Dirty Rect）系统：`renderer.queue(layer, command, { bounds })` 支持局部刷新；未提供 `bounds` 时回退为整屏清理。
- `Renderer.invalidate(region?)` 可主动标记脏区；即使直接调用 `scene.queue` 也会通过内部监听器自动通知渲染器。
- 渲染循环仅在存在动画、粒子、闪光或待处理命令时执行，静止场景会暂停昂贵的 `clearRect` 调用。
- `ParticleSystem` 聚合粒子包围盒，`ScreenEffects` 根据闪光/震动状态自动请求重绘，兼顾准确度与开销。
- `attachRendererMonitor(renderer)`（见 `src/utils/performance.ts`）每秒上报 FPS / 帧耗时，并可选读取 `performance.memory` 发往 `GameEventBus` 以便在 `EventDebugger` 中观察。
