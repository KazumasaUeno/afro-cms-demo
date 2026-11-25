// サイト取得の守り（functions/src/ai/site/。計画 §4 U2「SSRF のテスト」H1・T-01〜T-04）。1 件 1 テスト・名前つき。
// DNS は解決関数を注入（実ネットワークに出ない）。取得先はローカルの HTTP サーバー（route で付け替える。URL と IP の検査の後でだけ効く）
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const { parseSiteUrl, parseRedirect } = req('../../functions/lib/ai/site/url.js');
const { isPublicAddress } = req('../../functions/lib/ai/site/ipGuard.js');
const { resolveChecked, guardedLookup, assertTestRouteAllowed } = req('../../functions/lib/ai/site/lookup.js');
const { fetchFollow } = req('../../functions/lib/ai/site/fetch.js');
const { runSiteCheck, robotsDisallowsRoot } = req('../../functions/lib/ai/site/checks.js');
const { extractHtml } = req('../../functions/lib/ai/site/extract.js');
const { SITE_LIMITS } = req('../../functions/lib/ai/limits.js');

const PUB4 = '93.184.216.34';
const PUB6 = '2606:2800:220:1:248:1893:25c8:1946';
const rejects = async (p, name) => assert.rejects(p, (e) => (assert.match(e.name, name ?? /SiteUrlError|SiteAddressError|SiteFetchError/), true));

// ---------- IP リテラル（URL で拒否 ＋ 解決結果としても拒否） ----------
const V4 = ['127.0.0.1', '127.1', '0177.0.0.1', '0x7f000001', '2130706433', '0.0.0.0', '0.1.2.3', '10.0.0.1', '100.64.0.1', '169.254.169.254',
  '172.16.0.1', '192.0.0.1', '192.0.2.1', '192.88.99.1', '192.168.0.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '240.0.0.1', '255.255.255.255'];
for (const ip of V4) test(`SSRF 拒否: IPv4 リテラル ${ip}`, () => assert.throws(() => parseSiteUrl(`http://${ip}/`), { name: 'SiteUrlError' }));
const V6 = ['::', '::1', '::127.0.0.1', '::ffff:127.0.0.1', '64:ff9b::7f00:1', '64:ff9b:1::1', '100::1', '2001::1', '2001:db8::1', '2002:7f00:1::',
  'fc00::1', 'fd00::1', 'fe80::1', 'fec0::1', 'ff02::1', '4000::1'];
for (const ip of V6) {
  test(`SSRF 拒否: IPv6 リテラル [${ip}]（URL でも解決結果でも）`, () => {
    assert.throws(() => parseSiteUrl(`http://[${ip}]/`), { name: 'SiteUrlError' });
    assert.equal(isPublicAddress(ip), false);
  });
}
test('IPv4 の拒否範囲は解決結果としても拒否（正規化後の 21 件）', () => {
  for (const ip of ['127.0.0.1', '0.0.0.0', '0.1.2.3', '10.0.0.1', '100.64.0.1', '169.254.169.254', '172.16.0.1', '192.0.0.1', '192.0.2.1', '192.88.99.1',
    '192.168.0.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '240.0.0.1', '255.255.255.255']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress(PUB4), true);
  assert.equal(isPublicAddress(PUB6), true);
  assert.equal(isPublicAddress(`::ffff:${PUB4}`), true);
  assert.equal(isPublicAddress('fe80::1%eth0'), false);
});

// ---------- 名前 ----------
for (const h of ['localhost', 'localhost.', 'LOCALHOST', 'metadata.google.internal', 'metadata.google.internal.']) {
  test(`SSRF 拒否: 名前 ${h}`, () => assert.throws(() => parseSiteUrl(`http://${h}/`), { name: 'SiteUrlError' }));
}
const fixed = (list) => async () => list.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
test('SSRF 拒否: 公開名なのに私設の A を返す', () => rejects(resolveChecked('evil.example', fixed(['10.0.0.5'])), /SiteAddressError/));
test('SSRF 拒否: 私設の AAAA を返す', () => rejects(resolveChecked('evil.example', fixed(['fd00::5'])), /SiteAddressError/));
test('SSRF 拒否: all:true で公開と私設を混ぜて返す', async () => {
  const err = await new Promise((r) => guardedLookup(fixed([PUB4, '127.0.0.1']))('mix.example', { all: true }, (e) => r(e)));
  assert.equal(err?.name, 'SiteAddressError');
});
test('SSRF 拒否: 1 回目公開・2 回目私設（rebinding。毎回解決して検査）', async () => {
  let n = 0;
  const flip = async () => [{ address: n++ === 0 ? PUB4 : '169.254.169.254', family: 4 }];
  assert.equal((await resolveChecked('flip.example', flip))[0].address, PUB4);
  await rejects(resolveChecked('flip.example', flip), /SiteAddressError/);
});

// ---------- URL ----------
for (const [name, url] of [['file:', 'file:///etc/passwd'], ['ftp:', 'ftp://example.com/'], ['gopher:', 'gopher://example.com/'],
  ['ポート 22', 'http://example.com:22/'], ['ポート 8080', 'http://example.com:8080/'], ['user:pass@', 'http://user:pass@example.com/']]) {
  test(`SSRF 拒否: URL ${name}`, () => assert.throws(() => parseSiteUrl(url), { name: 'SiteUrlError' }));
}

// ---------- ローカルの HTTP サーバー（解決関数で公開 IP に見せ、route でここへ付け替える） ----------
let server;
let port;
const routes = new Map();
before(async () => {
  server = createServer((rq, rs) => {
    const h = routes.get(`${rq.headers.host}${rq.url}`) ?? routes.get(rq.url);
    if (!h) { rs.writeHead(404); rs.end(); return; }
    h(rq, rs);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
after(() => new Promise((r) => server.close(r)));
const deps = (resolve = fixed([PUB4]), limits) => ({ resolve, route: { address: '127.0.0.1', port }, limits, nowIso: () => '2026-11-20T00:00:00.000Z' });
const redirect = (loc) => (_q, s) => { s.writeHead(302, { Location: loc }); s.end(); };
const html = (body, extra = {}) => (_q, s) => { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...extra }); s.end(body); };

test('SSRF 拒否: リダイレクト 公開→私設（解決結果が私設）', async () => {
  routes.set('pub.example/r1', redirect('http://priv.example/'));
  const resolve = async (h) => [{ address: h === 'priv.example' ? '10.1.1.1' : PUB4, family: 4 }];
  await rejects(fetchFollow('http://pub.example/r1', deps(resolve)), /SiteAddressError/);
});
test('SSRF 拒否: リダイレクト ポートを変える', async () => {
  routes.set('pub.example/r2', redirect('http://pub.example:8080/'));
  await rejects(fetchFollow('http://pub.example/r2', deps()), /SiteUrlError/);
});
test('SSRF 拒否: リダイレクト 4 回目', async () => {
  for (let i = 0; i < 4; i++) routes.set(`pub.example/c${i}`, redirect(`/c${i + 1}`));
  routes.set('pub.example/c4', html('<p>end</p>'));
  await rejects(fetchFollow('http://pub.example/c0', deps()), /SiteFetchError/);
  assert.equal((await fetchFollow('http://pub.example/c1', deps())).redirects, 3);
});
test('SSRF 拒否: リダイレクト https→http', () => assert.throws(() => parseRedirect('http://pub.example/', new URL('https://pub.example/')), { name: 'SiteUrlError' }));
test('SSRF 拒否: プロトコル相対の Location（//127.0.0.1/）', async () => {
  routes.set('pub.example/r3', redirect('//127.0.0.1/'));
  await rejects(fetchFollow('http://pub.example/r3', deps()), /SiteUrlError/);
});
test('SSRF 拒否: 相対の Location（解決後に再検査。解決先が私設）', async () => {
  routes.set('rel.example/r4', redirect('/next'));
  let n = 0;
  const resolve = async () => [{ address: n++ === 0 ? PUB4 : '192.168.1.1', family: 4 }];
  await rejects(fetchFollow('http://rel.example/r4', deps(resolve)), /SiteAddressError/);
});
test('SSRF 拒否: file: への Location', async () => {
  routes.set('pub.example/r5', redirect('file:///etc/passwd'));
  await rejects(fetchFollow('http://pub.example/r5', deps()), /SiteUrlError/);
});
test('SSRF 拒否: robots.txt・sitemap.xml の取得でも私設へ向かえば拒否', async () => {
  routes.set('rb.example/robots.txt', redirect('http://inner.example/robots.txt'));
  const resolve = async (h) => [{ address: h === 'inner.example' ? '127.0.0.1' : PUB4, family: 4 }];
  const r = await runSiteCheck('http://rb.example/', deps(resolve));
  assert.equal(r.siteCheck.status, 'failed');
  assert.equal(r.code, 'site-blocked-address');
  routes.set('sm.example/', html('<html><head><title>t</title></head><body>x</body></html>'));
  routes.set('sm.example/sitemap.xml', redirect('http://inner.example/sitemap.xml'));
  assert.equal((await runSiteCheck('http://sm.example/', deps(async (h) => [{ address: h === 'inner.example' ? '10.0.0.1' : PUB4, family: 4 }]))).code, 'site-blocked-address');
});
test('許可: 公開 IPv4 1 件（正常に取れる）', async () => {
  routes.set('v4.example/', html('<p>ok</p>'));
  const r = await fetchFollow('http://v4.example/', deps(fixed([PUB4])));
  assert.equal(r.status, 200);
  assert.match(r.body.toString(), /ok/);
});
test('許可: 公開 IPv6 1 件（正常に取れる）', async () => {
  routes.set('v6.example/', html('<p>ok6</p>'));
  assert.equal((await fetchFollow('http://v6.example/', deps(fixed([PUB6])))).status, 200);
});

// ---------- 取得の上限（T-04） ----------
test('上限: 3 MB の本文は 2 MB で打ち切る', async () => {
  routes.set('big.example/', html('a'.repeat(3 * 1024 * 1024)));
  await rejects(fetchFollow('http://big.example/', deps()), /SiteFetchError/);
});
test('上限: 展開後 2 MB 超（gzip bomb）', async () => {
  const bomb = gzipSync(Buffer.alloc(5 * 1024 * 1024, 0x20));
  routes.set('bomb.example/', (_q, s) => { s.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': 'gzip' }); s.end(bomb); });
  assert.ok(bomb.length < SITE_LIMITS.maxBytes);
  await rejects(fetchFollow('http://bomb.example/', deps()), /SiteFetchError/);
});
test('上限: 遅いサーバー（全体の時間上限。既定 10 秒、テストは 300ms）', async () => {
  assert.equal(SITE_LIMITS.totalMs, 10_000);
  routes.set('slow.example/', (_q, s) => setTimeout(() => { s.writeHead(200); s.end('late'); }, 1500));
  await rejects(fetchFollow('http://slow.example/', deps(undefined, { totalMs: 300 })), /SiteFetchError/);
});
test('上限: application/pdf は本文を使わない', async () => {
  routes.set('pdf.example/', (_q, s) => { s.writeHead(200, { 'Content-Type': 'application/pdf' }); s.end('%PDF'); });
  const r = await runSiteCheck('http://pdf.example/', deps());
  assert.equal(r.code, 'site-not-html');
  assert.equal(r.siteText, '');
});
test('robots Disallow: / なら取得せず blocked', async () => {
  routes.set('deny.example/robots.txt', (_q, s) => { s.writeHead(200); s.end('User-agent: *\nDisallow: /\n'); });
  let pageHit = false;
  routes.set('deny.example/', (_q, s) => { pageHit = true; s.end(); });
  const r = await runSiteCheck('http://deny.example/', deps());
  assert.equal(r.siteCheck.status, 'blocked');
  assert.equal(pageHit, false);
  assert.equal(robotsDisallowsRoot('User-agent: Googlebot\nDisallow: /\n'), false);
});
test('sitemap の有無と基本チェック 10 項目', async () => {
  routes.set('ok.example/', html('<html><head><title>テストのお店のホームページです</title><meta name="viewport" content="width=device-width"></head><body><h1>店</h1><img src=a></body></html>'));
  routes.set('ok.example/sitemap.xml', (_q, s) => { s.writeHead(200); s.end('<urlset/>'); });
  const r = await runSiteCheck('http://ok.example/', deps());
  assert.equal(r.siteCheck.status, 'ok');
  assert.equal(r.siteCheck.total, 10);
  assert.equal(r.siteFacts.sitemap, true);
  assert.equal(r.siteFacts['h1-count'], 1);
  assert.equal(r.siteFacts['alt-missing'], 100);
});

// ---------- 抽出 ----------
test('抽出: script・style・コメント・非表示を除く', () => {
  const e = extractHtml('<html><head><title>T</title></head><body><script>IGNORE1</script><style>IGNORE2</style><!-- IGNORE3 --><div hidden>IGNORE4</div><p style="display:none">IGNORE5</p><img hidden src=x><p>見える</p></body></html>');
  assert.match(e.text, /見える/);
  assert.doesNotMatch(e.text, /IGNORE/);
});
test('抽出: 本文は 12,000 字まで', () => {
  assert.equal([...extractHtml(`<body><p>${'あ'.repeat(20000)}</p></body>`).text].length, 12000);
});
test('抽出: メール・電話を除く', () => {
  const e = extractHtml('<body><h2>連絡 info@shop.example</h2><p>電話 03-1234-5678 / 090-1234-5678</p></body>');
  assert.doesNotMatch(JSON.stringify(e), /info@shop|1234-5678/);
});
test('抽出: 構造化データ・ナビのリンク・description', () => {
  const e = extractHtml('<head><meta name="description" content="説明"><script type="application/ld+json">{}</script></head><body><nav><a href="/">ホーム</a><a href="/m">メニュー</a></nav></body>');
  assert.equal(e.hasStructuredData, true);
  assert.deepEqual(e.navLinks, ['ホーム', 'メニュー']);
  assert.equal(e.description, '説明');
});

// ---------- テスト専用の route を本番で使わせない（SEC-L2） ----------
test('route: NODE_ENV=production・エミュレータ外の K_SERVICE では throw（テスト・エミュレータ・route なしは通す）', async () => {
  const r = { address: '127.0.0.1', port: 1 };
  assert.throws(() => assertTestRouteAllowed(r, { NODE_ENV: 'production' }), /test-only/);
  assert.throws(() => assertTestRouteAllowed(r, { K_SERVICE: 'generaterequirementsdrafttask' }), /test-only/);
  assert.doesNotThrow(() => assertTestRouteAllowed(r, { K_SERVICE: 'x', FUNCTIONS_EMULATOR: 'true' }));
  assert.doesNotThrow(() => assertTestRouteAllowed(r, {}));
  assert.doesNotThrow(() => assertTestRouteAllowed(undefined, { NODE_ENV: 'production' }));
  // 実際の入口（guardedLookup・fetchFollow）も process.env を見て止まる
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.throws(() => guardedLookup(fixed([PUB4]), { route: { address: '127.0.0.1' } }), /test-only/);
    await assert.rejects(fetchFollow(new URL('http://pub.example/'), { resolve: fixed([PUB4]), route: r }), /test-only/);
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  }
});
