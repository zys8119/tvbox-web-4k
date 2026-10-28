import {
  defineConfig,
  presetUno,
  presetAttributify,
  presetIcons,
  transformerDirectives,
  transformerVariantGroup,
} from "unocss";

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      warn: false,
      extraProperties: {
        display: "inline-block",
        "vertical-align": "middle",
      },
    }),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  shortcuts: {
    // —— 交互基础 ——
    "btn":
      "inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg cursor-pointer select-none transition-all duration-200 ease-out",
    "btn-primary":
      "btn text-white bg-gradient-to-br from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 shadow-[0_6px_18px_-8px_rgba(99,102,241,0.9)] hover:shadow-[0_10px_26px_-8px_rgba(99,102,241,0.95)] active:scale-[0.98]",

    // —— 玻璃拟态 ——
    "glass":
      "bg-white/[0.045] backdrop-blur-xl ring-1 ring-white/10 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.75)]",
    "glass-soft": "bg-white/[0.03] backdrop-blur-lg ring-1 ring-white/[0.07]",
    "glass-hover":
      "transition-all duration-300 hover:bg-white/[0.07] hover:ring-white/20 hover:shadow-[0_14px_40px_-14px_rgba(99,102,241,0.55)]",
    "glass-strong":
      "bg-white/[0.07] backdrop-blur-2xl ring-1 ring-white/15 shadow-[0_16px_48px_-16px_rgba(0,0,0,0.85)]",

    // —— 卡片 / 容器 ——
    "card": "glass rounded-2xl overflow-hidden",
    "panel": "glass rounded-2xl p-4",
    "section-title": "flex items-center gap-2 text-lg font-semibold tracking-wide",
    "title-bar": "w-1 h-4 rounded-full bg-gradient-to-b from-indigo-400 to-violet-500",

    // —— 标签 / 胶囊 ——
    "chip":
      "px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-all duration-200 cursor-pointer select-none",
    "chip-idle":
      "bg-white/[0.045] text-gray-300 ring-1 ring-white/[0.08] hover:bg-white/[0.09] hover:text-white hover:ring-white/20",
    "chip-active":
      "text-white bg-gradient-to-br from-indigo-500/90 to-violet-500/90 ring-1 ring-indigo-300/40 shadow-[0_6px_18px_-8px_rgba(99,102,241,0.95)]",

    "ellipsis-2": "line-clamp-2",
    "page-wrap": "max-w-[1400px] mx-auto px-4 md:px-6",
  },
  theme: {
    colors: {
      brand: {
        DEFAULT: "#6366f1",
        soft: "#818cf8",
        deep: "#4f46e5",
      },
      ink: {
        base: "#0a0b0f",
        raise: "#0f1117",
      },
    },
    boxShadow: {
      glow: "0 0 40px -12px rgba(99,102,241,0.55)",
    },
  },
});
