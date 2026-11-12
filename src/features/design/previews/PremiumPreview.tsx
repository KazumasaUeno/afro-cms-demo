import { DESIGN_VARIANTS } from '@/data/designs';
import { copyFor, paletteFor } from '../designContext';
import { Art, SERIF, SANS, type PreviewProps } from './shared';

const BG = '#14110F';
const CREAM = '#F5EFE6';

/** Design C：プレミアム — ダークトーン・金（ブランド色を混ぜる）のアクセント・ストーリー型。文言・ナビ・色は案件ごと（designContext） */
export function PremiumPreview({ device, ctx, page }: PreviewProps) {
  const phone = device === 'phone';
  const tablet = device === 'tablet';
  const pad = phone ? 22 : tablet ? 48 : 88;
  const [, , GOLD] = paletteFor(DESIGN_VARIANTS[2], ctx);
  const line = `1px solid ${GOLD}59`;
  const copy = copyFor(ctx, 'premium');
  const left = ctx.coffee ? 'COLLECTION　STORY' : ctx.nav.slice(0, 2).join('　');
  const right = ctx.coffee ? 'CORPORATE GIFT' : ctx.ctaLabel;
  const longHead = copy.headline.some((l) => l.length > 12);
  const stories = ctx.highlights;
  return (
    <div style={{ background: BG, color: CREAM, fontFamily: SANS, minHeight: '100%' }}>
      <header style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12, padding: `22px ${pad}px`, borderBottom: line }}>
        <span style={{ fontSize: 11, letterSpacing: '0.2em', color: 'rgba(245,239,230,.6)' }}>{phone ? '≡' : left}</span>
        <span style={{ fontFamily: SERIF, fontSize: phone ? 16 : 20, letterSpacing: '0.5em', color: GOLD }}>{ctx.logo.toUpperCase()}</span>
        <span style={{ justifySelf: 'end', fontSize: 11, letterSpacing: '0.2em', color: 'rgba(245,239,230,.6)' }}>{phone ? '' : right}</span>
      </header>

      {page ? (
        <>
          <section style={{ padding: `${phone ? 56 : 104}px ${pad}px`, textAlign: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: phone ? 12 : 32, border: line, pointerEvents: 'none' }} />
            <div style={{ fontSize: 11, letterSpacing: '0.4em', color: GOLD, marginBottom: 24 }}>{page.path.toUpperCase()}</div>
            <h1 style={{ fontFamily: SERIF, fontWeight: 400, margin: 0, fontSize: phone ? 28 : tablet ? 40 : 52, letterSpacing: '0.08em', lineHeight: 1.45 }}>{page.label}</h1>
            <p style={{ fontSize: phone ? 13 : 15, color: 'rgba(245,239,230,.7)', lineHeight: 2, margin: '24px auto 0', maxWidth: 520 }}>{page.lead}</p>
          </section>
          {page.blocks.map((b, i) => (
            <section key={b.title} style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : '1fr 1fr', borderTop: line }}>
              <div style={{ order: phone ? 0 : i % 2, aspectRatio: phone ? '16 / 10' : 'auto', minHeight: phone ? 0 : 260 }}>
                <Art ctx={ctx} bg={i === 1 ? '#2A231E' : '#1E1915'} fg={i === 2 ? '#7A5C2E' : '#3F3A34'} accent={GOLD} label={b.title} />
              </div>
              <div style={{ padding: `${phone ? 28 : 56}px ${pad}px`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontFamily: SERIF, color: GOLD, fontSize: 14, letterSpacing: '0.3em' }}>0{i + 1}</div>
                <div style={{ fontFamily: SERIF, fontSize: phone ? 22 : 28, margin: '14px 0', letterSpacing: '0.1em' }}>{b.title}</div>
                <div style={{ fontSize: 14, lineHeight: 2, color: 'rgba(245,239,230,.65)' }}>{b.text}</div>
              </div>
            </section>
          ))}
          <section style={{ borderTop: line, padding: `${phone ? 40 : 64}px ${pad}px`, textAlign: 'center' }}>
            <span style={{ display: 'inline-block', background: GOLD, color: BG, padding: '14px 28px', fontSize: 13, letterSpacing: '0.12em', fontWeight: 600 }}>{page.cta ? '入力内容を確認する' : copy.cta}</span>
          </section>
        </>
      ) : (
        <>
          <section style={{ padding: `${phone ? 56 : 120}px ${pad}px`, textAlign: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: phone ? 12 : 32, border: line, pointerEvents: 'none' }} />
            <div style={{ fontSize: 11, letterSpacing: '0.4em', color: GOLD, marginBottom: 28 }}>{copy.eyebrow}</div>
            <h1 style={{ fontFamily: SERIF, fontWeight: 400, margin: 0, fontSize: phone ? (longHead ? 24 : 32) : tablet ? (longHead ? 34 : 46) : longHead ? 44 : 64, letterSpacing: '0.08em', lineHeight: 1.45 }}>
              {copy.headline.map((l, i) => <span key={i}>{l}{i < copy.headline.length - 1 && <br />}</span>)}
            </h1>
            <p style={{ fontSize: phone ? 13 : 15, color: 'rgba(245,239,230,.7)', lineHeight: 2, margin: '28px auto 40px', maxWidth: 460 }}>{copy.sub}</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexDirection: phone ? 'column' : 'row', alignItems: 'center' }}>
              <span style={{ background: GOLD, color: BG, padding: '14px 28px', fontSize: 13, letterSpacing: '0.12em', fontWeight: 600 }}>{copy.cta}</span>
              <span style={{ border: `1px solid ${GOLD}`, color: GOLD, padding: '13px 28px', fontSize: 13, letterSpacing: '0.12em' }}>{copy.cta2}</span>
            </div>
          </section>

          {stories.map((h, i) => (
            <section key={h.no} style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : '1fr 1fr', borderTop: line }}>
              <div style={{ order: phone ? 0 : i % 2, aspectRatio: phone ? '16 / 10' : 'auto', minHeight: phone ? 0 : 320 }}>
                <Art ctx={ctx} bg={i === 1 ? '#2A231E' : '#1E1915'} fg={i === 2 ? '#7A5C2E' : '#3F3A34'} accent={GOLD} label={h.en || h.title} />
              </div>
              <div style={{ padding: `${phone ? 32 : 64}px ${pad}px`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontFamily: SERIF, color: GOLD, fontSize: 14, letterSpacing: '0.3em' }}>{h.no}{h.en && ` — ${h.en.toUpperCase()}`}</div>
                <div style={{ fontFamily: SERIF, fontSize: phone ? 26 : 34, margin: '16px 0', letterSpacing: '0.1em' }}>{h.title}</div>
                <div style={{ fontSize: 14, lineHeight: 2, color: 'rgba(245,239,230,.65)' }}>{h.text}</div>
              </div>
            </section>
          ))}

          <section style={{ borderTop: line, padding: `${phone ? 40 : 72}px ${pad}px`, display: 'grid', gridTemplateColumns: phone ? '1fr' : 'repeat(3, 1fr)', gap: phone ? 16 : 28 }}>
            {(ctx.coffee ? [{ name: 'Signature Box', meta: '¥5,400〜' }, { name: 'Origin Trio', meta: '¥8,800〜' }, { name: 'Anniversary', meta: '¥12,000〜' }] : ctx.items.map((x) => ({ name: x.name, meta: '詳しく見る' }))).map(({ name, meta }) => (
              <div key={name} style={{ border: line, padding: 28, textAlign: 'center' }}>
                <div style={{ fontFamily: SERIF, fontSize: 20, letterSpacing: '0.08em' }}>{name}</div>
                <div style={{ color: GOLD, marginTop: 10, fontSize: 14, letterSpacing: '0.1em' }}>{meta}</div>
              </div>
            ))}
          </section>
        </>
      )}
      <footer style={{ padding: `28px ${pad}px`, borderTop: line, textAlign: 'center', fontSize: 11, letterSpacing: '0.3em', color: 'rgba(245,239,230,.4)' }}>
        {ctx.coffee ? '導入企業 320社 · MINAMO COFFEE' : ctx.footer}
      </footer>
    </div>
  );
}
