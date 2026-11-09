import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  // shared는 TS 소스로 export 하므로 번들에 포함시킨다
  noExternal: ["@park/shared"],
  // 한글 문자열이 \uXXXX 로 바뀌지 않게
  esbuildOptions(options) {
    options.charset = "utf8";
  },
});
