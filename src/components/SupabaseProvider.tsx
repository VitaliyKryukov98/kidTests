'use client';

import { ReactNode, useState } from 'react';
import { SessionContextProvider } from '@supabase/auth-helpers-react';
import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs';

type Props = {
  children: ReactNode;
};

export default function SupabaseProvider({ children }: Props) {
  const [supabaseClient] = useState(() => createBrowserSupabaseClient());

  return <SessionContextProvider supabaseClient={supabaseClient}>{children}</SessionContextProvider>;
}
