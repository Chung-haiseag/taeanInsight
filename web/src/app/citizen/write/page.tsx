"use client";

import { Suspense } from "react";

import { CopilotEditor } from "@/components/write/copilot-editor";

export default function CitizenWritePage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-foreground-muted">에디터를 불러오는 중…</div>}>
      <CopilotEditor />
    </Suspense>
  );
}
