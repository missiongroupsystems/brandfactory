import { redirect } from "next/navigation";

/**
 * The dashboard, not Outlets. The source app landed on Outlets because its dashboard was a
 * later phase and would have read as "nothing needs attention"; here the dashboard has
 * fixtures in every panel and is the better first impression of the layout.
 */
export default function Home() {
  redirect("/dashboard");
}
