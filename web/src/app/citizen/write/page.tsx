import { redirect } from "next/navigation";

export default async function CitizenWriteRedirect({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  redirect(id ? `/write?id=${encodeURIComponent(id)}` : "/write");
}
