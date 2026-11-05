import { CupArt, SANS, type PreviewProps } from './shared';

const NAVY = '#1E1B4B';
const ORANGE = '#F97316';
const LILAC = '#A78BFA';

/** Design B：クリエイティブ — 大胆な文字・非対称グリッド・色のブロック */
export function CreativePreview({ device, still }: PreviewProps) {
  const phone = device === 'phone';
  const tablet = device === 'tablet';
  const pad = phone ? 18 : tablet ? 32 : 56;
  const strip = 'NEW BLEND 凪 — 12.1 RELEASE — ROASTED DAILY — ';
  return (
    <div style={{ background: '#FFF7ED', color: NAVY, fontFamily: SANS, minHeight: '100%', overflow: 'hidden' }}>
      <style>{'@keyframes afroMarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}'}</style>
      <div style={{ background: ORANGE, color: '#fff', fontWeight: 800, fontSize: 12, letterSpacing: '0.12em', padding: '8px 0', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <div style={{ display: 'inline-block', animation: still ? 'none' : 'afroMarquee 18s linear infinite' }}>{strip.repeat(8)}</div>
      </div>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `18px ${pad}px` }}>
        <div style={{ fontWeight: 900, fontSize: phone ? 20 : 24, letterSpacing: '-0.04em' }}>minamo<span style={{ color: ORANGE }}>●</span></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {!phone && ['Shop', 'Cafe', 'Gift'].map((t) => <span key={t} style={{ fontWeight: 700, fontSize: 14, padding: '6px 12px' }}>{t}</span>)}
          <span style={{ background: NAVY, color: '#fff', borderRadius: 99, padding: '8px 16px', fontSize: 13, fontWeight: 700 }}>Order</span>
        </div>
      </header>

      <section style={{ position: 'relative', padding: `${phone ? 20 : 40}px ${pad}px ${phone ? 32 : 64}px` }}>
        <div style={{ position: 'absolute', right: phone ? -60 : 40, top: phone ? 40 : 10, width: phone ? 200 : 380, height: phone ? 200 : 380, borderRadius: '50%', background: LILAC, opacity: 0.85 }} />
        <h1 style={{ position: 'relative', margin: 0, fontWeight: 900, letterSpacing: '-0.06em', lineHeight: 0.88, fontSize: phone ? 72 : tablet ? 120 : 168 }}>
          BREW<br /><span style={{ color: ORANGE, marginLeft: phone ? 30 : 120 }}>YOUR</span><br />MOOD.
        </h1>
        <p style={{ position: 'relative', fontSize: phone ? 14 : 17, fontWeight: 600, maxWidth: 360, marginTop: 28, lineHeight: 1.7 }}>
          気分で選べる12の豆。焙煎したての一杯を、街のカフェとオンラインで。
        </p>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: phone ? '1fr 1fr' : '2fr 1fr 1fr', gridAutoRows: phone ? 130 : 200, gap: phone ? 10 : 16, padding: `0 ${pad}px ${phone ? 32 : 56}px` }}>
        <div style={{ gridRow: phone ? 'auto' : 'span 2', gridColumn: phone ? 'span 2' : 'auto', borderRadius: 28, overflow: 'hidden', position: 'relative' }}>
          <CupArt bg={NAVY} cup="#FDBA74" />
          <div style={{ position: 'absolute', left: 20, bottom: 18, color: '#fff', fontWeight: 900, fontSize: phone ? 26 : 40, letterSpacing: '-0.03em' }}>凪 Nagi</div>
        </div>
        {[['Shop', ORANGE, '#fff'], ['Cafe', LILAC, NAVY], ['Gift', '#FDE68A', NAVY], ['Journal', NAVY, '#fff']].map(([t, bg, fg]) => (
          <div key={t} style={{ background: bg, color: fg, borderRadius: 28, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontWeight: 900 }}>
            <span style={{ fontSize: 12, letterSpacing: '0.1em', opacity: 0.8 }}>EXPLORE</span>
            <span style={{ fontSize: phone ? 24 : 34, letterSpacing: '-0.04em' }}>{t} ↗</span>
          </div>
        ))}
      </section>

      <section style={{ background: NAVY, color: '#fff', padding: `${phone ? 36 : 64}px ${pad}px`, display: 'grid', gridTemplateColumns: phone ? '1fr' : 'repeat(3, 1fr)', gap: 28 }}>
        {[['01', '選ぶ', '産地を訪ねて豆を選ぶ'], ['02', '焼く', '毎朝、少量ずつ焙煎'], ['03', '届ける', '焼きたてを48時間以内に']].map(([n, t, d]) => (
          <div key={n}>
            <div style={{ fontSize: phone ? 48 : 72, fontWeight: 900, color: ORANGE, letterSpacing: '-0.05em', lineHeight: 1 }}>{n}</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8 }}>{t}</div>
            <div style={{ fontSize: 14, opacity: 0.7, marginTop: 6 }}>{d}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
