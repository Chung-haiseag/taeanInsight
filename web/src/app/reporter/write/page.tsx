import { redirect } from "next/navigation";

export default async function ReporterWriteRedirect({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  redirect(id ? `/write?id=${encodeURIComponent(id)}` : "/write");
}
