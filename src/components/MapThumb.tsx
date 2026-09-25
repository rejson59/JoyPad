import type { MapId } from '../game/types';

/**
 * Rysowane miniatury map Stalowego Frontu (czysty CSS) — zamiast emoji
 * dają spójny, „crafted” wygląd kart areny.
 */
export function MapThumb({ map, className }: { map: MapId; className?: string }) {
  if (map === 'desert') {
    return (
      <div className={className} style={{ background: 'linear-gradient(180deg, #e0bd80 0%, #a98852 58%, #6b5433 100%)' }} aria-hidden="true">
        <div className="absolute right-[14%] top-[12%] h-5 w-5 rounded-full bg-amber-100/90 blur-[1px]" />
        <div className="absolute -left-[8%] bottom-[-34%] h-[58%] w-[75%] rounded-[100%] bg-[#8a6c42]/90" />
        <div className="absolute -right-[14%] bottom-[-42%] h-[68%] w-[85%] rounded-[100%] bg-[#5c462b]" />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 120%, rgba(0,0,0,.28), transparent 60%)' }} />
      </div>
    );
  }
  if (map === 'nightcity') {
    const towers = [
      { left: '6%', width: 14, height: 46 }, { left: '24%', width: 18, height: 66 },
      { left: '45%', width: 13, height: 52 }, { left: '60%', width: 20, height: 74 },
      { left: '82%', width: 15, height: 58 },
    ];
    return (
      <div className={className} style={{ background: 'linear-gradient(180deg, #1a1030 0%, #241a3f 48%, #0d1526 100%)' }} aria-hidden="true">
        <div className="absolute right-[16%] top-[14%] h-4 w-4 rounded-full bg-indigo-100/80 shadow-[0_0_14px_rgba(199,210,254,.8)]" />
        {towers.map((t, i) => (
          <div key={i} className="absolute bottom-0 rounded-t-[3px]" style={{ left: t.left, width: t.width, height: `${t.height}%`, background: 'linear-gradient(180deg, #131b2e, #0a111f)' }}>
            <span className="absolute left-[20%] top-[18%] h-[3px] w-[3px] rounded-[1px] bg-amber-300/90" />
            <span className="absolute left-[58%] top-[42%] h-[3px] w-[3px] rounded-[1px] bg-orange-300/80" />
            <span className="absolute left-[34%] top-[66%] h-[3px] w-[3px] rounded-[1px] bg-sky-300/70" />
          </div>
        ))}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(251,146,60,.12), transparent 55%)' }} />
      </div>
    );
  }
  // forest
  const pines = [
    { left: '8%', height: 42, width: 26 }, { left: '30%', height: 58, width: 34 },
    { left: '54%', height: 48, width: 30 }, { left: '74%', height: 62, width: 38 },
  ];
  return (
    <div className={className} style={{ background: 'linear-gradient(180deg, #5a7247 0%, #3d4e32 60%, #232b1d 100%)' }} aria-hidden="true">
      {pines.map((p, i) => (
        <div key={i} className="absolute bottom-[12%]" style={{ left: p.left, width: p.width, height: p.height }}>
          <div className="absolute bottom-0 left-1/2 h-[88%] w-full -translate-x-1/2" style={{ background: i % 2 ? '#1d2a17' : '#22331c', clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }} />
          <div className="absolute bottom-0 left-1/2 h-[14%] w-[10px] -translate-x-1/2 bg-[#3a2c1b]" />
        </div>
      ))}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 20% 0%, rgba(255,236,170,.14), transparent 45%)' }} />
    </div>
  );
}
