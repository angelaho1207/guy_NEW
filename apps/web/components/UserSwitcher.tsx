'use client';

import { useRef } from 'react';
import { switchUser } from '@/app/actions';

type User = { user_id: string; first_name: string; last_name: string };

/**
 * Dev-only. Guy is an app about what two people can see of each other, and the
 * fastest way to check that is to look at the same connection from both sides.
 */
export function UserSwitcher({ users, current }: { users: User[]; current: string }) {
  const form = useRef<HTMLFormElement>(null);

  return (
    <form ref={form} action={switchUser} className="switcher">
      <span className="tiny">Viewing as</span>
      <select
        name="user_id"
        defaultValue={current}
        onChange={() => form.current?.requestSubmit()}
      >
        {users.map((u) => (
          <option key={u.user_id} value={u.user_id}>
            {u.first_name} {u.last_name}
          </option>
        ))}
      </select>
    </form>
  );
}
