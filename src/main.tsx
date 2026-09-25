import { StrictMode, lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./fonts";
import JoypadApp from "./arcade/JoypadApp";
import { isPadRoute } from "./net/protocol";

// Tryb pada (telefon) ładowany leniwie — komputer nie musi go pobierać.
const PadApp = lazy(() => import("./pad/PadApp"));

function Root() {
  const [pad, setPad] = useState(isPadRoute());
  useEffect(() => {
    const onHash = () => setPad(isPadRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  if (pad) {
    return (
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] text-zinc-400">Ładowanie pada…</div>}>
        <PadApp />
      </Suspense>
    );
  }
  return <JoypadApp />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
