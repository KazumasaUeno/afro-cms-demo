import { BagArt, SANS, SERIF, type PreviewProps } from './shared';

/** Design A：ミニマル — 余白・細い罫線・主役は商品1点 */
export function MinimalPreview({ device }: PreviewProps) {
  const phone = device === 'phone';
  const tablet = device === 'tablet';
  const pad = phone ? 22 : tablet ? 48 : 96;
  const ink = '#1C1C1C';
  const rule = '1px solid #E7E5E4';
  return (
    <div style={{ background: '#FAFAF7', color: ink, fontFamily: SANS, minHeight: '100%' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${phone ? 18 : 28}px ${pad}px`, borderBottom: rule }}>
        <div style={{ fontFamily: SERIF, letterSpacing: '0.32em', fontSize: phone ? 14 : 16 }}>MINAMO</div>
        {phone ? (
          <div style={{ width: 22, borderTop: `1px solid ${ink}`, borderBottom: `1px solid ${ink}`, height: 7 }} />
        ) : (
          <nav style={{ display: 'flex', gap: tablet ? 24 : 40, fontSize: 12, letterSpacing: '0.14em', color: '#57534E' }}>
            {['SHOP', 'STORY', 'CAFE', 'JOURNAL'].map((t) => <span key={t}>{t}</span>)}
          </nav>
        )}
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : '1.1fr 1fr', gap: phone ? 32 : 72, alignItems: 'center', padding: `${phone ? 40 : 110}px ${pad}px` }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.3em', color: '#B45309', marginBottom: 28 }}>SINGLE ORIGIN — ETHIOPIA</div>
          <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: phone ? 30 : tablet ? 40 : 54, lineHeight: 1.5, margin: 0, letterSpacing: '0.04em' }}>
            一杯から、<br />日常を少し<br />特別に。
          </h1>
          <div style={{ width: 48, borderTop: `1px solid ${ink}`, margin: '36px 0' }} />
          <p style={{ fontSize: phone ? 13 : 14, lineHeight: 2.1, color: '#57534E', maxWidth: 380, margin: 0 }}>
            産地を訪ねて選んだ豆を、店舗で毎朝焙煎しています。華やかな香りと、澄んだ後味を。
          </p>
          <div style={{ marginTop: 40, fontSize: 13, letterSpacing: '0.12em', borderBottom: `1px solid ${ink}`, display: 'inline-block', paddingBottom: 6 }}>オンラインで購入　→</div>
        </div>
        <div style={{ aspectRatio: '5 / 6', maxHeight: phone ? 380 : 'none' }}>
          <BagArt bg="#EFEBE4" bag="#D6CFC4" label="Yirgacheffe" />
        </div>
      </section>

      <section style={{ padding: `0 ${pad}px ${phone ? 48 : 110}px` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: rule, paddingTop: 24, marginBottom: 32, fontSize: 12, letterSpacing: '0.2em' }}>
          <span>COLLECTION</span><span style={{ color: '#A8A29E' }}>04</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : 'repeat(3, 1fr)', gap: phone ? 0 : 40 }}>
          {[['Ethiopia', '華やか・柑橘', '¥1,620'], ['Guatemala', 'まろやか・ナッツ', '¥1,480'], ['Blend 凪', '深煎り・甘い余韻', '¥1,380']].map(([n, d, p]) => (
            <div key={n} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '20px 0', borderBottom: rule }}>
              <div>
                <div style={{ fontFamily: SERIF, fontSize: 18 }}>{n}</div>
                <div style={{ fontSize: 12, color: '#78716C', marginTop: 6 }}>{d}</div>
              </div>
              <div style={{ fontSize: 13, color: '#57534E' }}>{p}</div>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ padding: `32px ${pad}px`, borderTop: rule, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#A8A29E', letterSpacing: '0.1em' }}>
        <span>© MINAMO COFFEE</span><span>ご相談・お問い合わせ</span>
      </footer>
    </div>
  );
}
