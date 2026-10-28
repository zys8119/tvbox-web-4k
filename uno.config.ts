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
    "btn": "px-4 py-2 rounded-lg cursor-pointer select-none transition-colors duration-200",
    "btn-primary": "btn bg-indigo-500 text-white hover:bg-indigo-400",
    "card": "bg-[#16181f] rounded-xl overflow-hidden",
    "ellipsis-2": "line-clamp-2",
    "page-wrap": "max-w-[1400px] mx-auto px-4 md:px-6",
  },
  theme: {
    colors: {
      brand: {
        DEFAULT: "#6366f1",
        soft: "#818cf8",
      },
    },
  },
});
