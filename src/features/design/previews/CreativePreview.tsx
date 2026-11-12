import { DESIGN_VARIANTS } from '@/data/designs';
import { copyFor, mix, paletteFor } from '../designContext';
import { CupArt, SANS, SceneArt, type PreviewProps } from './shared';

const NAVY = '#1E1B4B';

/** Design B：クリエイティブ — 大胆な文字・非対称グリッド・色のブロック。文言・ナビ・色は案件ごと（designContext） */
export function CreativePreview({ device, still, ctx, page }: PreviewProps) {
  const phone = device === 'phone';
  const tablet = device === 'tablet';
  const pad = phone ? 18 : tablet ? 32 : 56;
  const [BG, , ACCENT, SOFT] = paletteFor(DESIGN_VARIANTS[1], ctx);
  const copy = copyFor(ctx, 'creative');
  // 紺の上に置くアクセント（暗いブランド色でも読めるよう明るくする）
  const ON_NAVY = ctx.accent ? mix(ACCENT, '#FFFFFF', 0.4) : ACCENT;
  const tiles = [...ctx.nav, ctx.ctaShort].slice(0, 4);
  const tileColors: [string, string][] = [[ACCENT, '#fff'], [SOFT, NAVY], ['#FDE68A', NAVY], [NAVY, '#fff']];
  const headerNav = ctx.coffee ? ['Shop', 'Cafe', 'Gift'] : ctx.nav.slice(0, 3);
  return (
    <div style={{ background: BG, color: NAVY, fontFamily: SANS, minHeight: '100%', overflow: 'hidden' }}>
      <style>{'@keyframes afroMarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}'}</style>
      <div style={{ background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 12, letterSpacing: '0.12em', padding: '8px 0', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <div style={{ display: 'inline-block', animation: still ? 'none' : 'afroMarquee 18s linear infinite' }}>{ctx.strip.repeat(8)}</div>
      </div>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `18px ${pad}px` }}>
        <div style={{ fontWeight: 900, fontSize: phone ? 20 : 24, letterSpacing: '-0.04em' }}>{ctx.logo.toLowerCase()}<span style={{ color: ACCENT }}>●</span></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {!phone && headerNav.map((t) => <span key={t} style={{ fontWeight: 700, fontSize: 14, padding: '6px 12px', borderRadius: 99, background: page?.label === t ? SOFT : undefined }}>{t}</span>)}
          <span style={{ background: NAVY, color: '#fff', borderRadius: 99, padding: '8px 16px', fontSize: 13, fontWeight: 700 }}>{ctx.ctaShort}</span>
        </div>
      </header>

      {page ? (
        <>
          <section style={{ position: 'relative', padding: `${phone ? 20 : 40}px ${pad}px ${phone ? 28 : 48}px` }}>
            <div style={{ position: 'absolute', right: phone ? -40 : 60, top: phone ? 10 : 0, width: phone ? 140 : 260, height: phone ? 140 : 260, borderRadius: '50%', background: SOFT, opacity: 0.85 }} />
            <div style={{ position: 'relative', fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', color: ACCENT }}>{page.path.toUpperCase()}</div>
            <h1 style={{ position: 'relative', margin: '8px 0 0', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.05, fontSize: phone ? 40 : tablet ? 64 : 88 }}>{page.label}</h1>
            <p style={{ position: 'relative', fontSize: phone ? 14 : 17, fontWeight: 600, maxWidth: 460, marginTop: 20, lineHeight: 1.7 }}>{page.lead}</p>
          </section>
          <section style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : 'repeat(3, 1fr)', gap: phone ? 10 : 16, padding: `0 ${pad}px ${phone ? 32 : 56}px` }}>
            {page.blocks.map((b, i) => {
              const [bg, fg] = tileColors[i % tileColors.length];
              return (
                <div key={b.title} style={{ background: bg, color: fg, borderRadius: 28, padding: phone ? 20 : 28, minHeight: phone ? 0 : 220, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 16 }}>
                  <span style={{ fontSize: phone ? 40 : 56, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1 }}>0{i + 1}</span>
                  <div>
                    <div style={{ fontSize: phone ? 20 : 24, fontWeight: 900, letterSpacing: '-0.02em' }}>{b.title}</div>
                    <div style={{ fontSize: 14, marginTop: 6, opacity: 0.85, lineHeight: 1.6 }}>{b.text}</div>
                  </div>
                </div>
              );
            })}
          </section>
          <section style={{ background: NAVY, color: '#fff', padding: `${phone ? 32 : 48}px ${pad}px`, display: 'flex', flexDirection: phone ? 'column' : 'row', gap: 16, alignItems: phone ? 'flex-start' : 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: phone ? 24 : 34, fontWeight: 900, letterSpacing: '-0.03em' }}>{page.cta ? 'まずは、かんたん入力から。' : `${ctx.siteName}へ、ようこそ。`}</div>
            <span style={{ background: ACCENT, color: '#fff', borderRadius: 99, padding: '12px 24px', fontWeight: 800, fontSize: 15 }}>{page.cta ? '入力内容を確認する' : copy.cta} ↗</span>
          </section>
        </>
      ) : (
        <>
          <section style={{ position: 'relative', padding: `${phone ? 20 : 40}px ${pad}px ${phone ? 32 : 64}px` }}>
            <div style={{ position: 'absolute', right: phone ? -60 : 40, top: phone ? 40 : 10, width: phone ? 200 : 380, height: phone ? 200 : 380, borderRadius: '50%', background: SOFT, opacity: 0.85 }} />
            <h1 style={{ position: 'relative', margin: 0, fontWeight: 900, letterSpacing: '-0.06em', lineHeight: 0.88, fontSize: phone ? 72 : tablet ? 120 : 168 }}>
              {ctx.display[0]}<br /><span style={{ color: ACCENT, marginLeft: phone ? 30 : 120 }}>{ctx.display[1]}</span><br />{ctx.display[2]}
            </h1>
            {!ctx.coffee && (
              <div style={{ position: 'relative', fontSize: phone ? 18 : 24, fontWeight: 900, letterSpacing: '-0.02em', marginTop: 24, lineHeight: 1.4 }}>{copy.headline.join('')}</div>
            )}
            <p style={{ position: 'relative', fontSize: phone ? 14 : 17, fontWeight: 600, maxWidth: 420, marginTop: ctx.coffee ? 28 : 12, lineHeight: 1.7 }}>{copy.sub}</p>
          </section>

          <section style={{ display: 'grid', gridTemplateColumns: phone ? '1fr 1fr' : '2fr 1fr 1fr', gridAutoRows: phone ? 130 : 200, gap: phone ? 10 : 16, padding: `0 ${pad}px ${phone ? 32 : 56}px` }}>
            <div style={{ gridRow: phone ? 'auto' : 'span 2', gridColumn: phone ? 'span 2' : 'auto', borderRadius: 28, overflow: 'hidden', position: 'relative' }}>
              {ctx.coffee ? <CupArt bg={NAVY} cup="#FDBA74" /> : <SceneArt bg={NAVY} fg={ACCENT} accent="#FDE68A" />}
              <div style={{ position: 'absolute', left: 20, bottom: 18, color: '#fff', fontWeight: 900, fontSize: phone ? 26 : 40, letterSpacing: '-0.03em' }}>{ctx.coffee ? '凪 Nagi' : ctx.logo}</div>
            </div>
            {tiles.map((t, i) => {
              const [bg, fg] = tileColors[i];
              return (
                <div key={t} style={{ background: bg, color: fg, borderRadius: 28, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontWeight: 900, minWidth: 0 }}>
                  <span style={{ fontSize: 12, letterSpacing: '0.1em', opacity: 0.8 }}>EXPLORE</span>
                  <span style={{ fontSize: ctx.coffee ? (phone ? 24 : 34) : phone ? 18 : 24, letterSpacing: '-0.04em', lineHeight: 1.2 }}>{ctx.coffee ? ['Shop', 'Cafe', 'Gift', 'Journal'][i] : t} ↗</span>
                </div>
              );
            })}
          </section>

          <section style={{ background: NAVY, color: '#fff', padding: `${phone ? 36 : 64}px ${pad}px`, display: 'grid', gridTemplateColumns: phone ? '1fr' : 'repeat(3, 1fr)', gap: 28 }}>
            {(ctx.coffee ? [{ no: '01', title: '選ぶ', text: '産地を訪ねて豆を選ぶ' }, { no: '02', title: '焼く', text: '毎朝、少量ずつ焙煎' }, { no: '03', title: '届ける', text: '焼きたてを48時間以内に' }] : ctx.highlights).map((h) => (
              <div key={h.no}>
                <div style={{ fontSize: phone ? 48 : 72, fontWeight: 900, color: ON_NAVY, letterSpacing: '-0.05em', lineHeight: 1 }}>{h.no}</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8 }}>{h.title}</div>
                <div style={{ fontSize: 14, opacity: 0.7, marginTop: 6 }}>{h.text}</div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
