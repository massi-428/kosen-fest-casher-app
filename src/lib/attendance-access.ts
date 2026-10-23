import User from '@/models/User';
import { verifyPassword } from '@/lib/auth';

// Recheck on every management request: no reusable browser unlock token or stored password.
export async function canManageAttendance(request: Request, userId: string) {
  const header = request.headers.get('x-attendance-password');
  if (!header || header.length > 4096) return false;
  let password: string;
  try { password = decodeURIComponent(header); } catch { return false; }
  if (!password || password.length > 256) return false;
  const user = await User.findOne({ userId });
  return Boolean(user && await verifyPassword(password, user.password));
}
