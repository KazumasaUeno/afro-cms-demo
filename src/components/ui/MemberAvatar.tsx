import { Avatar, AvatarGroup, Tooltip } from '@mui/material';
import type { Member } from '@/types';
import { memberById } from '@/data/members';

/** id は固定のメンバー（MEMBERS）。登録した開発者など MEMBERS に無い人は person で渡す */
export function MemberAvatar({ id, person, size = 28 }: { id: string; person?: Member; size?: number }) {
  const m = person ?? memberById(id);
  return (
    <Tooltip title={`${m.name}（${m.role}）`}>
      <Avatar sx={{ width: size, height: size, bgcolor: m.color, fontSize: Math.max(12, size * 0.42), letterSpacing: '-0.02em' }} alt={m.name}>{m.initials}</Avatar>
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
