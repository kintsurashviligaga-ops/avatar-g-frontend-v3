import { Metadata } from "next";
import AvatarBuilderClient from "./AvatarBuilderClient";

export const metadata: Metadata = {
  title: "Avatar G - Professional Avatar Builder",
  description: "Create your digital twin with photogrammetry-grade precision",
};

export default function AvatarBuilderPage() {
  return <AvatarBuilderClient />;
}
