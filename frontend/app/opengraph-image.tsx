import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#f8fafc",
          fontFamily: "Google Sans, Inter, system-ui, sans-serif",
          color: "#0f172a",
        }}
      >
        {/* Accent wash */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            background:
              "radial-gradient(60% 60% at 12% 8%, rgba(52,116,78,0.12), transparent 70%)",
          }}
        />

        {/* Brand mark */}
        <div
          style={{
            position: "absolute",
            top: 56,
            left: 72,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              width: 48,
              height: 48,
              borderRadius: 14,
              background: "linear-gradient(135deg, #488a66, #2b6040)",
              alignItems: "flex-end",
              justifyContent: "center",
              gap: 5,
              padding: "0 10px 10px",
            }}
          >
            <div style={{ width: 7, height: 12, borderRadius: 999, background: "rgba(255,255,255,0.85)" }} />
            <div style={{ width: 7, height: 20, borderRadius: 999, background: "#ffffff" }} />
            <div style={{ width: 7, height: 28, borderRadius: 999, background: "rgba(255,255,255,0.95)" }} />
          </div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>
            StratVeda OS
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            position: "absolute",
            top: 190,
            left: 72,
            right: 72,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", fontSize: 20, fontWeight: 700, color: "#2b6040", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Revenue Intelligence Agent · Revenue Intelligence
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 58,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              maxWidth: 620,
            }}
          >
            Discover hidden revenue leaks before they cost you growth
          </div>
        </div>

        {/* Mini dashboard mock */}
        <div
          style={{
            position: "absolute",
            top: 120,
            right: 72,
            width: 360,
            display: "flex",
            flexDirection: "column",
            borderRadius: 24,
            border: "1px solid #e2e8f0",
            backgroundColor: "#ffffff",
            padding: 28,
            boxShadow: "0 30px 60px -30px rgba(15,23,42,0.25)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ display: "flex", fontSize: 18, fontWeight: 700 }}>Revenue Intelligence</div>
            <div style={{ display: "flex", fontSize: 12, fontWeight: 700, color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 999, padding: "6px 12px" }}>
              DEMO
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 14, color: "#475569" }}>Potential Revenue Opportunity</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 12, gap: 12 }}>
            {[82, 64, 42, 55].map((value, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 90, fontSize: 13, color: "#475569" }}>
                  {["Marketing", "Sales", "Operations", "CS"][i]}
                </div>
                <div style={{ flex: 1, height: 10, borderRadius: 999, backgroundColor: "#f1f5f9", display: "flex" }}>
                  <div style={{ width: `${value}%`, height: 10, borderRadius: 999, backgroundColor: "#34744e" }} />
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 22,
              display: "flex",
              justifyContent: "space-between",
              border: "1px solid #c6dfd0",
              borderRadius: 14,
              backgroundColor: "#f2f7f4",
              padding: "14px 16px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1e412d" }}>Recommended Next Action</div>
              <div style={{ fontSize: 13, color: "#2b6040" }}>Improve pipeline conversion</div>
            </div>
            <div style={{ display: "flex", fontSize: 22, fontWeight: 800, color: "#2b6040" }}>$184K</div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}