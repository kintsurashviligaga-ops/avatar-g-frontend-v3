import { Metadata } from "next";
import ExecutiveAgentClient from "./ExecutiveAgentClient";

export const metadata: Metadata = {
  title: "Avatar G - Executive Agent",
  description: "Your AI executive assistant with voice callback",
};

export default function ExecutiveAgentPage() {
  return <ExecutiveAgentClient />;
}
