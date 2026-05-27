// OpenNext for Cloudflare 설정
// 참고: https://opennext.js.org/cloudflare

import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // 기본 설정. 향후 KV/R2/D1 바인딩 추가 시 여기서 incrementalCache·queue 등 설정
});
