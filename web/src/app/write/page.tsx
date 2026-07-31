import { Suspense } from "react";

import { RequireRole } from "@/components/require-role";
import { CopilotEditor } from "@/components/write/copilot-editor";

export const metadata = { title: "투고 에디터 — 태안 인사이트" };

export default function WritePage() {
  return (
    <RequireRole minRole="citizen">
      <Suspense fallback={null}>
        <CopilotEditor />
      </Suspense>
    </RequireRole>
  );
}
