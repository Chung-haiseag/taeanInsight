import { Suspense } from "react";

import { RequireRole } from "@/components/require-role";
import { CopilotEditor } from "@/components/write/copilot-editor";

export const metadata = { title: "투고 에디터 — 태안 인사이트" };

export default function WritePage() {
  return (
    <RequireRole minRole="citizen" deniedHint={{ text: "글 투고는 시민기자 이상만 가능합니다. 내 페이지에서 시민기자를 신청하세요.", href: "/me", label: "시민기자 신청하러 가기" }}>
      <Suspense fallback={null}>
        <CopilotEditor />
      </Suspense>
    </RequireRole>
  );
}
