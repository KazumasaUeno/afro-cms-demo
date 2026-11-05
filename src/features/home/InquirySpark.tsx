import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { MONTHLY_METRICS } from '@/data/insights';
import { tokens } from '@/theme/tokens';

/** 問い合わせ数の推移（ホームのKPIタイル内の小さなグラフ。デモデータ） */
export default function InquirySpark() {
  const data = MONTHLY_METRICS.slice(-8);
  return (
    <ResponsiveContainer width="100%" height={44} initialDimension={{ width: 160, height: 44 }}>
      <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="home-spark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tokens.color.primary} stopOpacity={0.28} />
            <stop offset="100%" stopColor={tokens.color.primary} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="inquiries" stroke={tokens.color.primary} strokeWidth={2} fill="url(#home-spark)" isAnimationActive={false} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
