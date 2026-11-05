import { Avatar, AvatarGroup, Tooltip } from '@mui/material';
import { memberById } from '@/data/members';

export function MemberAvatar({ id, size = 28 }: { id: string; size?: number }) {
  const m = memberById(id);
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
