import { DESIGN_VARIANTS } from '@/data/designs';
import { copyFor, paletteFor } from '../designContext';
import { Art, SANS, SERIF, type PreviewProps } from './shared';

/** Design A：ミニマル — 余白・細い罫線・主役は1点。文言・ナビ・色は案件ごと（designContext） */
export function MinimalPreview({ device, ctx, page }: PreviewProps) {
  const phone = device === 'phone';
  const tablet = device === 'tablet';
  const pad = phone ? 22 : tablet ? 48 : 96;
  const ink = '#1C1C1C';
  const rule = '1px solid #E7E5E4';
  const [, , accent] = paletteFor(DESIGN_VARIANTS[0], ctx);
  const copy = copyFor(ctx, 'minimal');
  const longHead = copy.headline.some((l) => l.length > 12);
  return (
    <div style={{ background: '#FAFAF7', color: ink, fontFamily: SANS, minHeight: '100%' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${phone ? 18 : 28}px ${pad}px`, borderBottom: rule }}>
        <div style={{ fontFamily: SERIF, letterSpacing: '0.32em', fontSize: phone ? 14 : 16 }}>{ctx.logo.toUpperCase()}</div>
        {phone ? (
          <div style={{ width: 22, borderTop: `1px solid ${ink}`, borderBottom: `1px solid ${ink}`, height: 7 }} />
        ) : (
          <nav style={{ display: 'flex', gap: tablet ? 24 : 40, fontSize: 12, letterSpacing: '0.14em', color: '#57534E' }}>
            {ctx.nav.map((t) => <span key={t} style={page?.label === t ? { color: ink, borderBottom: `1px solid ${ink}` } : undefined}>{t}</span>)}
          </nav>
        )}
      </header>

      {page ? (
        <>
          <section style={{ padding: `${phone ? 40 : 96}px ${pad}px ${phone ? 32 : 64}px` }}>
            <div style={{ fontSize: 11, letterSpacing: '0.3em', color: accent, marginBottom: 24 }}>{page.path.toUpperCase()}</div>
            <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: phone ? 28 : tablet ? 36 : 46, lineHeight: 1.5, margin: 0, letterSpacing: '0.04em' }}>{page.label}</h1>
            <div style={{ width: 48, borderTop: `1px solid ${ink}`, margin: '32px 0' }} />
            <p style={{ fontSize: phone ? 13 : 14, lineHeight: 2.1, color: '#57534E', maxWidth: 520, margin: 0 }}>{page.lead}</p>
          </section>
          <section style={{ padding: `0 ${pad}px ${phone ? 40 : 72}px`, display: 'grid', gridTemplateColumns: phone ? '1fr' : 'repeat(3, 1fr)', gap: phone ? 0 : 40 }}>
            {page.blocks.map((b, i) => (
              <div key={b.title} style={{ borderTop: rule, padding: '24px 0' }}>
                <div style={{ fontSize: 11, color: '#A8A29E', letterSpacing: '0.2em' }}>0{i + 1}</div>
                <div style={{ fontFamily: SERIF, fontSize: 18, margin: '10px 0 8px' }}>{b.title}</div>
                <div style={{ fontSize: 13, lineHeight: 1.9, color: '#78716C' }}>{b.text}</div>
              </div>
            ))}
          </section>
          <section style={{ padding: `0 ${pad}px ${phone ? 48 : 96}px` }}>
            <div style={{ fontSize: 13, letterSpacing: '0.12em', borderBottom: `1px solid ${ink}`, display: 'inline-block', paddingBottom: 6 }}>{page.cta ? '入力内容を確認する' : copy.cta}　→</div>
          </section>
        </>
      ) : (
        <>
          <section style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : '1.1fr 1fr', gap: phone ? 32 : 72, alignItems: 'center', padding: `${phone ? 40 : 110}px ${pad}px` }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.3em', color: accent, marginBottom: 28 }}>{copy.eyebrow}</div>
              <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: phone ? (longHead ? 24 : 30) : tablet ? (longHead ? 32 : 40) : longHead ? 40 : 54, lineHeight: 1.5, margin: 0, letterSpacing: '0.04em' }}>
                {copy.headline.map((l, i) => <span key={i}>{l}{i < copy.headline.length - 1 && <br />}</span>)}
              </h1>
              <div style={{ width: 48, borderTop: `1px solid ${ink}`, margin: '36px 0' }} />
              <p style={{ fontSize: phone ? 13 : 14, lineHeight: 2.1, color: '#57534E', maxWidth: 380, margin: 0 }}>{copy.sub}</p>
              <div style={{ marginTop: 40, fontSize: 13, letterSpacing: '0.12em', borderBottom: `1px solid ${ink}`, display: 'inline-block', paddingBottom: 6 }}>{copy.cta}　→</div>
            </div>
            <div style={{ aspectRatio: '5 / 6', maxHeight: phone ? 380 : 'none' }}>
              <Art ctx={ctx} bg="#EFEBE4" fg="#D6CFC4" accent={accent} label={ctx.coffee ? 'Yirgacheffe' : ctx.logo.toUpperCase()} />
            </div>
          </section>

          <section style={{ padding: `0 ${pad}px ${phone ? 48 : 110}px` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: rule, paddingTop: 24, marginBottom: 32, fontSize: 12, letterSpacing: '0.2em' }}>
              <span>{ctx.listTitle}</span><span style={{ color: '#A8A29E' }}>{String(ctx.coffee ? 4 : ctx.items.length).padStart(2, '0')}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : 'repeat(3, 1fr)', gap: phone ? 0 : 40 }}>
              {ctx.items.map(({ name, note, meta }) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '20px 0', borderBottom: rule }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: SERIF, fontSize: 18 }}>{name}</div>
                    <div style={{ fontSize: 12, color: '#78716C', marginTop: 6 }}>{note}</div>
                  </div>
                  <div style={{ fontSize: 13, color: '#57534E', flexShrink: 0 }}>{meta}</div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <footer style={{ padding: `32px ${pad}px`, borderTop: rule, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#A8A29E', letterSpacing: '0.1em' }}>
        <span>{ctx.footer}</span><span>{ctx.pages.find((p) => p.cta)?.label ?? ctx.ctaLabel}</span>
      </footer>
    </div>
  );
}
