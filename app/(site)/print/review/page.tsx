import { redirect } from "next/navigation";

/** The review step is now part of Print settings. Kept so old links still work. */
export default function ReviewPage() {
  redirect("/print/settings");
}
