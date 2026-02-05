import { Metadata } from "next";
import SettingsClient from "./SettingsClient";

export const metadata: Metadata = {
  title: "Settings - Avatar G",
  description: "Manage your digital identity and preferences",
};

export default function SettingsPage() {
  return <SettingsClient />;
}
