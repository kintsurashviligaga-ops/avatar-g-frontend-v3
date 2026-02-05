import { Metadata } from "next";
import VoiceCloningClient from "./VoiceCloningClient";

export const metadata: Metadata = {
  title: "Avatar G - Zero-Shot Voice Cloning",
  description: "Clone your voice with 60-second sample",
};

export default function VoiceCloningPage() {
  return <VoiceCloningClient />;
}
