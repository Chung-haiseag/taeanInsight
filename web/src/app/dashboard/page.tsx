// B2B 데이터 대시보드 → 주간 리포트의 "데이터 부록"으로 통합(IA 단순화).
//  기존 링크·북마크 호환을 위해 리다이렉트만 유지.
import { redirect } from "next/navigation";

export default function DashboardPage() {
  redirect("/reports#data");
}
