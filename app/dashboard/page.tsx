import { Metadata } from "next";
import OrbitalDashboardClient from "./OrbitalDashboardClient";

export const metadata: Metadata = {
  title: "Avatar G - Orbital Command Center",
  description: "Your digital twin command center",
};

export default function DashboardPage() {
  return <OrbitalDashboardClient />;
}
