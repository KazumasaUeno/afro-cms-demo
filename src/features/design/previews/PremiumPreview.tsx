import { BagArt, SERIF, SANS, type PreviewProps } from './shared';

const BG = '#14110F';
const GOLD = '#C8A15A';
const CREAM = '#F5EFE6';

/** Design C：プレミアム — ダークトーン・金のアクセント・ストーリー型・法人ギフト */
export function PremiumPreview({ device }: PreviewProps) {
  const phone = device === 'phone';
  const tablet = device === 'tablet';
  const pad = phone ? 22 : tablet ? 48 : 88;
  const line = `1px solid rgba(200,161,90,.35)`;
  return (
    <div style={{ background: BG, color: CREAM, fontFamily: SANS, minHeight: '100%' }}>
      <header style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: `22px ${pad}px`, borderBottom: line }}>
        <span style={{ fontSize: 11, letterSpacing: '0.2em', color: 'rgba(245,239,230,.6)' }}>{phone ? '≡' : 'COLLECTION　STORY'}</span>
        <span style={{ fontFamily: SERIF, fontSize: phone ? 16 : 20, letterSpacing: '0.5em', color: GOLD }}>MINAMO</span>
        <span style={{ justifySelf: 'end', fontSize: 11, letterSpacing: '0.2em', color: 'rgba(245,239,230,.6)' }}>{phone ? '' : 'CORPORATE GIFT'}</span>
      </header>

      <section style={{ padding: `${phone ? 56 : 120}px ${pad}px`, textAlign: 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: phone ? 12 : 32, border: line, pointerEvents: 'none' }} />
        <div style={{ fontSize: 11, letterSpacing: '0.4em', color: GOLD, marginBottom: 28 }}>CORPORATE GIFT COLLECTION</div>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, margin: 0, fontSize: phone ? 32 : tablet ? 46 : 64, letterSpacing: '0.08em', lineHeight: 1.45 }}>
          想いを、<br />香りで贈る。
        </h1>
        <p style={{ fontSize: phone ? 13 : 15, color: 'rgba(245,239,230,.7)', lineHeight: 2, margin: '28px auto 40px', maxWidth: 460 }}>
          周年記念、お歳暮、大切な取引先へ。名入れ50個から、焙煎士が選んだ一箱をお届けします。
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexDirection: phone ? 'column' : 'row', alignItems: 'center' }}>
          <span style={{ background: GOLD, color: BG, padding: '14px 28px', fontSize: 13, letterSpacing: '0.12em', fontWeight: 600 }}>法人ギフトを相談する</span>
          <span style={{ border: `1px solid ${GOLD}`, color: GOLD, padding: '13px 28px', fontSize: 13, letterSpacing: '0.12em' }}>コレクションを見る</span>
        </div>
      </section>

      {[['01', '産地', 'Origin', '標高2,000mの農園を毎年訪ね、その年いちばんの豆だけを。'], ['02', '焙煎', 'Roast', '一釜ずつ、香りの頂点で火を止める。'], ['03', '包む', 'Wrap', '和紙と木箱で、開ける瞬間まで贈り物に。']].map(([n, t, en, d], i) => (
        <section key={n} style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : '1fr 1fr', borderTop: line }}>
          <div style={{ order: phone ? 0 : i % 2, aspectRatio: phone ? '16 / 10' : 'auto', minHeight: phone ? 0 : 320 }}>
            <BagArt bg={i === 1 ? '#2A231E' : '#1E1915'} bag={i === 2 ? '#7A5C2E' : '#3F3A34'} label={en} />
          </div>
          <div style={{ padding: `${phone ? 32 : 64}px ${pad}px`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontFamily: SERIF, color: GOLD, fontSize: 14, letterSpacing: '0.3em' }}>{n} — {en.toUpperCase()}</div>
            <div style={{ fontFamily: SERIF, fontSize: phone ? 26 : 34, margin: '16px 0', letterSpacing: '0.1em' }}>{t}</div>
            <div style={{ fontSize: 14, lineHeight: 2, color: 'rgba(245,239,230,.65)' }}>{d}</div>
          </div>
        </section>
      ))}

      <section style={{ borderTop: line, padding: `${phone ? 40 : 72}px ${pad}px`, display: 'grid', gridTemplateColumns: phone ? '1fr' : 'repeat(3, 1fr)', gap: phone ? 16 : 28 }}>
        {[['Signature Box', '¥5,400'], ['Origin Trio', '¥8,800'], ['Anniversary', '¥12,000']].map(([n, p]) => (
          <div key={n} style={{ border: line, padding: 28, textAlign: 'center' }}>
            <div style={{ fontFamily: SERIF, fontSize: 20, letterSpacing: '0.08em' }}>{n}</div>
            <div style={{ color: GOLD, marginTop: 10, fontSize: 14, letterSpacing: '0.1em' }}>{p}〜</div>
          </div>
        ))}
      </section>
      <footer style={{ padding: `28px ${pad}px`, borderTop: line, textAlign: 'center', fontSize: 11, letterSpacing: '0.3em', color: 'rgba(245,239,230,.4)' }}>
        導入企業 320社 · MINAMO COFFEE
      </footer>
    </div>
  );
}
