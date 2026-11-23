// dsh-typwriter 浏览器半片：注册左上角入口 + 主区整页。
// 主区用一个同源 iframe 装载 Texpile 的渲染端 SPA（/typwriter/），
// 这样 Texpile 的 Tailwind/全局 CSS 不会污染 DSH 主题，也不需要跨框架桥接。
const React = require('react');

const KEY = 'typwriter';
// 带 #/workspace：直接落到工作区，不在启动屏停留
const SRC = '/typwriter/#/workspace';

// ---- 常驻 iframe ----
// DSH 的 main 槽位按 key 精确分发：切到别的面板，这里注册的组件就被卸载，iframe 跟着销毁；
// 切回来再挂一次，整个写作台从头加载（首屏约 10MB、九十多个请求），撤销历史也没了。
//
// 做法：iframe 只建一次，挂在 DSH 根容器之后，不随组件卸载。组件本身只渲染一个占位块，
// 激活时把 iframe 定位覆盖到占位块上，卸载时只是隐藏（display:none 不会让 iframe 重载；
// 但在 DOM 里移动它会，所以永远不挪它）。层叠顺序沿用文档顺序：在 DSH 之后、在后来
// 创建的浮层（菜单、对话框）之前。
//
// 关掉这个行为（回到每次切回都重载）：localStorage['typwriter:keep-alive'] = 'off'
const KEEP_ALIVE_KEY = 'typwriter:keep-alive';
function keepAlive() {
  try {
    return localStorage.getItem(KEEP_ALIVE_KEY) !== 'off';
  } catch {
    return true;
  }
}

let resident = null;

function scheduleSync() {
  const state = resident;
  if (!state || state.raf) return;
  state.raf = requestAnimationFrame(() => {
    state.raf = 0;
    const { frame } = state;
    let rect = null;
    for (const anchor of state.anchors) {
      const r = anchor.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        rect = r;
        break;
      }
    }
    if (!rect) {
      if (frame.style.display !== 'none') {
        frame.style.display = 'none';
        // 隐藏的页面里定时器会被浏览器节流：告诉它先把待写的缓冲落盘
        try {
          frame.contentWindow?.postMessage({ type: 'typwriter:host-hidden' }, location.origin);
        } catch {
          /* 跨源或已销毁：忽略 */
        }
      }
      return;
    }
    frame.style.display = 'block';
    frame.style.left = `${rect.left}px`;
    frame.style.top = `${rect.top}px`;
    frame.style.width = `${rect.width}px`;
    frame.style.height = `${rect.height}px`;
  });
}

/** 把常驻 iframe 挂到 anchor 所在的 DSH 根容器之后（anchor 此时已在文档里） */
function mountFrame(frame, anchor) {
  let top = anchor;
  while (top.parentElement && top.parentElement !== document.body) top = top.parentElement;
  if (top.parentElement === document.body) top.after(frame);
  else document.body.appendChild(frame);
}

function getResident(anchor) {
  if (resident) return resident;
  const frame = document.createElement('iframe');
  frame.src = SRC;
  frame.title = 'Typwriter';
  // 同源 iframe，允许脚本与同源 cookie
  frame.setAttribute('allow', 'clipboard-read; clipboard-write');
  frame.style.cssText = 'position:fixed;border:0;margin:0;background:transparent;display:none;';
  mountFrame(frame, anchor);
  resident = { frame, anchors: new Set(), raf: 0, observer: null };
  // 占位块尺寸跟着 DSH 的分栏、窗口大小变；观察器与 resize 监听建一次，页面存活期间不拆
  if (typeof ResizeObserver !== 'undefined') resident.observer = new ResizeObserver(scheduleSync);
  window.addEventListener('resize', scheduleSync);
  return resident;
}

/** 面板激活：登记占位块并把 iframe 覆盖上去；返回的函数在面板卸载时调用（只隐藏，不销毁） */
function attach(anchor) {
  const state = getResident(anchor);
  state.anchors.add(anchor);
  state.observer?.observe(anchor);
  scheduleSync();
  return () => {
    state.observer?.unobserve(anchor);
    state.anchors.delete(anchor);
    scheduleSync();
  };
}

// 统一品牌形象（精简线条版，与管理页 icon.svg 同一设计语言）：一张纸、几行字、一支斜放的笔。
// currentColor 线条随 DSH 主题着色；右下角叠「Typ」角标。
function Icon({ size }) {
  const s = size || 18;
  return React.createElement(
    'span',
    { style: { position: 'relative', display: 'inline-block', width: s, height: s, lineHeight: 0 }, 'aria-hidden': true },
    React.createElement(
      'svg',
      {
        width: s,
        height: s,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round'
      },
      // 纸（右上折角）
      React.createElement('path', { d: 'M4.5 3.5h9l3 3v13a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z' }),
      React.createElement('path', { d: 'M13.5 3.5V7h3' }),
      // 文字行
      React.createElement('path', { d: 'M7 10.5h6.5M7 13.5h4.5' }),
      // 笔：斜放右下，笔尖朝纸
      React.createElement('path', { d: 'M17.5 13.5l3 3-4.5 4.5H13v-3z' })
    ),
    React.createElement(
      'span',
      {
        style: {
          position: 'absolute',
          right: -2,
          bottom: -2,
          fontSize: Math.max(7, Math.round(s * 0.42)),
          fontWeight: 700,
          color: '#fff',
          background: '#1f2430',
          borderRadius: 3,
          padding: '0 2px',
          lineHeight: 1.15,
          letterSpacing: '0.02em',
          boxShadow: '0 0 0 1px rgba(255,255,255,.55)'
        }
      },
      'Typ'
    )
  );
}

function TypwriterPage() {
  const anchor = React.useRef(null);
  // 首次渲染就定下来：会话期间切换开关不会让组件的输出类型突变
  const [residentMode] = React.useState(keepAlive);
  React.useEffect(() => {
    const node = anchor.current;
    if (!node) return undefined;
    return attach(node);
  }, []);
  if (!residentMode) {
    // 关闭常驻时的旧行为：iframe 就是组件本身，随面板卸载销毁
    return React.createElement('iframe', {
      src: SRC,
      title: 'Typwriter',
      style: { width: '100%', height: '100%', border: '0', display: 'block', background: 'transparent' },
      allow: 'clipboard-read; clipboard-write'
    });
  }
  // 占位块：自己不画任何东西，常驻 iframe 会精确覆盖在它上面
  return React.createElement('div', { ref: anchor, style: { width: '100%', height: '100%' } });
}

export const inject = ['slots'];

export function apply(ctx) {
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: KEY }, TypwriterPage)
  );
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      { name: 'sidebar.panellist', id: KEY, order: 6, label: () => 'Typst 写作台' },
      Icon
    )
  );
}
