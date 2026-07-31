import type { Metadata } from "next";
import { QueryClient } from "./query-client";
import { RequireRole } from "@/components/require-role";

export const metadata: Metadata = {
  title: "질의응답",
  description: "자연어로 묻고 즉시 답을 받습니다",
};

export default function QueryPage() {
  return (
    <RequireRole minRole="user">
      <QueryClient />
    </RequireRole>
  );
}
