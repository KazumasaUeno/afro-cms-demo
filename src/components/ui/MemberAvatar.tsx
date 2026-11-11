import { Avatar, AvatarGroup, Tooltip } from '@mui/material';
import type { Member } from '@/types';
import { memberById } from '@/data/members';

const DARK_TEXT = '#1D1B20';
const LIGHT_TEXT = '#FFFFFF';

/** 地の色（#RRGGBB）に対して、白と濃い文字のうちコントラストの高い方を返す。形式が違えば白 */
function readableOn(bg: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(bg);
  if (!m) return LIGHT_TEXT;
  const lum = (hex: string) => {
    const [r, g, b] = [0, 2, 4].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const l = lum(m[1]);
  const vsWhite = 1.05 / (l + 0.05);
  const vsDark = (l + 0.05) / (lum(DARK_TEXT.slice(1)) + 0.05);
  return vsDark > vsWhite ? DARK_TEXT : LIGHT_TEXT;
}

/** id は固定のメンバー（MEMBERS）。登録した開発者など MEMBERS に無い人は person で渡す */
export function MemberAvatar({ id, person, size = 28 }: { id: string; person?: Member; size?: number }) {
  const m = person ?? memberById(id);
  return (
    <Tooltip title={`${m.name}（${m.role}）`}>
      <Avatar sx={{ width: size, height: size, bgcolor: m.color, color: readableOn(m.color), fontSize: Math.max(12, size * 0.42), letterSpacing: '-0.02em' }} alt={m.name}>{m.initials}</Avatar>
    </Tooltip>
  );
}

export function MemberStack({ ids, size = 26 }: { ids: string[]; size?: number }) {
  return (
    <AvatarGroup max={4} sx={{ '& .MuiAvatar-root': { width: size, height: size, fontSize: Math.max(12, size * 0.42), letterSpacing: '-0.02em', borderWidth: 2 } }}>
      {ids.map((id) => <MemberAvatar key={id} id={id} size={size} />)}
    </AvatarGroup>
  );
}
