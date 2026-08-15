import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy URL — Lists now lives on the combined Home screen. */
export default function ListsPage() {
  redirect("/home");
}
