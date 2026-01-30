import { redirect } from "next/navigation";

export default function Home() {
  // Blueprint rule: / → redirect logic only
  redirect("/workspace");
}
