/**
 * Atrapa PeerJS na czas testu dymnego interfejsu (`npm run selftest:ui`).
 *
 * Dlaczego nie prawdziwy PeerJS: przez pipeline SSR Vite paczka CJS/ESM podstawia
 * podwójne `default`, więc `new Peer(...)` rzuca „default is not a constructor” jeszcze
 * przed pierwszym renderem — a w aplikacji i w buildzie produkcyjnym to działa (jest
 * osobny chunk `peerjs`). Test dymny bada INTERFEJS, nie sieć, więc podmieniamy moduł
 * na atrapę, która przechodzi tę samą sekwencję: konstruktor → `on('open')` →
 * `destroy()`. Dzięki temu brak sieci w środowisku testowym nie udaje błędu aplikacji.
 */
export default class PeerStub {
  constructor(id, options = {}) {
    this.id = id;
    this.options = options;
    this.destroyed = false;
    this.disconnected = false;
    this.open = false;
    this.handlers = new Map();
    // „Pokój wstaje” w następnym takcie, żeby aplikacja przeszła normalną ścieżkę
    // (status ready, odświeżenie kodu QR) i dało się sprawdzić ekrany po połączeniu.
    setTimeout(() => {
      if (this.destroyed) return;
      this.open = true;
      this.emit('open', this.id);
    }, 0);
  }

  on(event, handler) {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return this;
  }

  off(event, handler) {
    const list = this.handlers.get(event) ?? [];
    this.handlers.set(event, list.filter(item => item !== handler));
    return this;
  }

  emit(event, ...args) {
    for (const handler of [...(this.handlers.get(event) ?? [])]) handler(...args);
  }

  connect() {
    return { on() { return this }, open: false, close() {}, send() {}, peerConnection: {} };
  }

  reconnect() {}

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.open = false;
    this.emit('close');
  }
}

export const __stub = true;
