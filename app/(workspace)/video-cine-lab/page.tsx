"use client";

import { useRouter } from "next/navigation";
import VideoDashboard from "@/components/VideoDashboard";

export default function VideoCineLabPage() {
  const router = useRouter();

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse at top, rgba(139, 92, 246, 0.15), transparent 50%), #0a0e14",
        paddingBottom: "100px",
      }}
    >
      <header
        style={{
          padding: "20px",
          background: "rgba(10, 14, 20, 0.95)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <button
          onClick={() => router.push("/")}
          style={{
            padding: "8px",
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "12px",
            cursor: "pointer",
            color: "#fff",
            fontSize: "18px",
            lineHeight: 1,
          }}
          aria-label="Back"
          title="Back"
        >
          ←
        </button>

        <div style={{ flex: 1 }}>
          <h1
            style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "#fff",
              margin: 0,
            }}
          >
            Video Cine Lab
          </h1>
          <p
            style={{
              fontSize: "12px",
              color: "rgba(255, 255, 255, 0.6)",
              margin: 0,
            }}
          >
            Neural Video Render Studio
          </p>
        </div>

        <div
          style={{
            padding: "6px 12px",
            background: "rgba(16, 185, 129, 0.1)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            borderRadius: "12px",
            fontSize: "11px",
            fontWeight: 600,
            color: "#10B981",
            whiteSpace: "nowrap",
          }}
        >
          Active
        </div>
      </header>

      {/* Main Content */}
      <div style={{ padding: "20px" }}>
        <VideoDashboard />
      </div>
    </div>
  );
}
