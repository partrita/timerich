import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "timerich", // 콘솔에 입력한 appName을 입력하세요.
  brand: {
    displayName: "시간부자", // 콘솔에 입력한 앱 이름을 입력하세요.
    primaryColor: "#8bcdffff", // 화면에 노출될 앱의 기본 색상으로 바꿔주세요.
    icon: "", // 콘솔에서 업로드한 이미지의 URL을 입력하세요.(콘솔의 앱 정보에서 업로드한 이미지를 우클릭해 링크 복사 후 넣어주세요)
  },
  web: {
    host: "localhost",
    port: 5173,
    commands: {
      dev: "vite dev",
      build: "vite build",
    },
  },
  permissions: [],
  outdir: "dist",
});