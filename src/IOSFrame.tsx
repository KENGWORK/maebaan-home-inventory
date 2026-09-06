import { useEffect, useState, type ReactNode } from "react";

const DW = 440;
const DH = 956;

/**
 * Stand-in for the design's imported ios-frame.jsx: a fixed 440x956 iPhone shell
 * with a dynamic island and home indicator, scaled down to fit small viewports.
 */
export function IOSFrame({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => {
      const pad = 24;
      const s = Math.min(1, (window.innerHeight - pad * 2) / DH, (window.innerWidth - pad * 2) / DW);
      setScale(s > 0 ? s : 1);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: 28,
        background: "radial-gradient(120% 90% at 20% 0%,#F5EFFC 0%,#E6DDF3 55%,#DCD2ED 100%)",
      }}
    >
      <div style={{ width: DW * scale, height: DH * scale, flex: "none" }}>
        <div
          style={{
            width: DW,
            height: DH,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            position: "relative",
            borderRadius: 66,
            padding: 14,
            background: "linear-gradient(160deg,#2A2340,#171225)",
            boxShadow:
              "0 40px 90px rgba(60,40,120,.4),0 8px 24px rgba(40,25,80,.35),inset 0 0 0 2px rgba(255,255,255,.06)",
          }}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              borderRadius: 52,
              overflow: "hidden",
              background: "#EFE7F8",
            }}
          >
            {children}
            <div
              style={{
                position: "absolute",
                top: 15,
                left: "50%",
                transform: "translateX(-50%)",
                width: 122,
                height: 35,
                borderRadius: 20,
                background: "#000",
                zIndex: 90,
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 9,
                left: "50%",
                transform: "translateX(-50%)",
                width: 138,
                height: 5,
                borderRadius: 99,
                background: "rgba(58,50,84,.42)",
                zIndex: 90,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
