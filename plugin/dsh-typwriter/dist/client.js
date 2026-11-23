window.__ModuleLoader__.load({id:"dsh-typwriter",factory:(require)=>{const module={exports:{}};const exports=module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.js
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var React = require("react");
var KEY = "typwriter";
var SRC = "/typwriter/#/workspace";
var KEEP_ALIVE_KEY = "typwriter:keep-alive";
function keepAlive() {
  try {
    return localStorage.getItem(KEEP_ALIVE_KEY) !== "off";
  } catch {
    return true;
  }
}
var resident = null;
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
      if (frame.style.display !== "none") {
        frame.style.display = "none";
        try {
          frame.contentWindow?.postMessage({ type: "typwriter:host-hidden" }, location.origin);
        } catch {
        }
      }
      return;
    }
    frame.style.display = "block";
    frame.style.left = `${rect.left}px`;
    frame.style.top = `${rect.top}px`;
    frame.style.width = `${rect.width}px`;
    frame.style.height = `${rect.height}px`;
  });
}
function mountFrame(frame, anchor) {
  let top = anchor;
  while (top.parentElement && top.parentElement !== document.body) top = top.parentElement;
  if (top.parentElement === document.body) top.after(frame);
  else document.body.appendChild(frame);
}
function getResident(anchor) {
  if (resident) return resident;
  const frame = document.createElement("iframe");
  frame.src = SRC;
  frame.title = "Typwriter";
  frame.setAttribute("allow", "clipboard-read; clipboard-write");
  frame.style.cssText = "position:fixed;border:0;margin:0;background:transparent;display:none;";
  mountFrame(frame, anchor);
  resident = { frame, anchors: /* @__PURE__ */ new Set(), raf: 0, observer: null };
  if (typeof ResizeObserver !== "undefined") resident.observer = new ResizeObserver(scheduleSync);
  window.addEventListener("resize", scheduleSync);
  return resident;
}
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
function Icon({ size }) {
  const s = size || 18;
  return React.createElement(
    "span",
    { style: { position: "relative", display: "inline-block", width: s, height: s, lineHeight: 0 }, "aria-hidden": true },
    React.createElement(
      "svg",
      {
        width: s,
        height: s,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.8,
        strokeLinecap: "round",
        strokeLinejoin: "round"
      },
      // 纸（右上折角）
      React.createElement("path", { d: "M4.5 3.5h9l3 3v13a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" }),
      React.createElement("path", { d: "M13.5 3.5V7h3" }),
      // 文字行
      React.createElement("path", { d: "M7 10.5h6.5M7 13.5h4.5" }),
      // 笔：斜放右下，笔尖朝纸
      React.createElement("path", { d: "M17.5 13.5l3 3-4.5 4.5H13v-3z" })
    ),
    React.createElement(
      "span",
      {
        style: {
          position: "absolute",
          right: -2,
          bottom: -2,
          fontSize: Math.max(7, Math.round(s * 0.42)),
          fontWeight: 700,
          color: "#fff",
          background: "#1f2430",
          borderRadius: 3,
          padding: "0 2px",
          lineHeight: 1.15,
          letterSpacing: "0.02em",
          boxShadow: "0 0 0 1px rgba(255,255,255,.55)"
        }
      },
      "Typ"
    )
  );
}
function TypwriterPage() {
  const anchor = React.useRef(null);
  const [residentMode] = React.useState(keepAlive);
  React.useEffect(() => {
    const node = anchor.current;
    if (!node) return void 0;
    return attach(node);
  }, []);
  if (!residentMode) {
    return React.createElement("iframe", {
      src: SRC,
      title: "Typwriter",
      style: { width: "100%", height: "100%", border: "0", display: "block", background: "transparent" },
      allow: "clipboard-read; clipboard-write"
    });
  }
  return React.createElement("div", { ref: anchor, style: { width: "100%", height: "100%" } });
}
var inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject(
    "main",
    () => ctx.slots.register({ name: "main", key: KEY }, TypwriterPage)
  );
  ctx.slots.inject(
    "sidebar.panellist",
    () => ctx.slots.register(
      { name: "sidebar.panellist", id: KEY, order: 6, label: () => "Typst \u5199\u4F5C\u53F0" },
      Icon
    )
  );
}

return module.exports}})
