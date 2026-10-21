import { ToastViewport } from './platform/notifications';
import { StrictMode, lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./console/palette.css";
import "./console/console.css";
import "./console/cinema.css";
import "./platform/platform.css";
/* Warstwa „liquid glass" musi być ostatnia: celowo nadpisuje powierzchnie systemowe. */
import "./console/liquid.css";
/* Profile urządzeń (TV / komputer / tablet / telefon) nadpisują rozmiary i układ —
   muszą iść po consoli i po liquid glass, a przed filmem. */
import "./console/viewport.css";
/* Film „Poznaj JoyPad" jest warstwą nad wszystkim — musi być po liquid glass. */
import "./cinema/film.css";
import "./fonts";
import JoypadApp from "./arcade/JoypadApp";
import { AppErrorBoundary, installStartupGuard } from "./components/AppErrorBoundary";
import { isPadRoute } from "./net/protocol";
import { applyDocumentLanguage, loadLanguage } from "./platform/i18n";
import { installWindowOriginTracker } from "./console/windowOrigin";
import { installViewportProfile } from "./console/viewport";

// Skąd ma „wyskoczyć" kolejne okienko — nasłuchujemy od razu, nie po pierwszym kliknięciu.
installWindowOriginTracker();

// Awaria pojedynczego modułu albo efektu nie może kończyć się pustym, czarnym ekranem —
// strażnik startu i granica błędów zawsze zostawiają czytelny komunikat (patrz AppErrorBoundary).
installStartupGuard();

// Język dokumentu (`<html lang>`) z zapisanego wyboru gracza — przed pierwszym renderem,
// żeby czytelnik ekranu nie czytał angielskiego interfejsu polską wymową.
applyDocumentLanguage(loadLanguage());

// Jaki to ekran (TV / komputer / tablet / telefon) — zapisane na `<html data-profile>`.
// Musi być PRZED pierwszym renderem, inaczej TV mrugnie układem desktopowym.
installViewportProfile();

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
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[var(--os-bg)] text-zinc-400">{loadLanguage() === 'en' ? 'Loading controller…' : 'Ładowanie pada…'}</div>}>
        <PadApp />
      </Suspense>
    );
  }
  return <JoypadApp />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <Root />
    </AppErrorBoundary>
    <ToastViewport />
  </StrictMode>
);
