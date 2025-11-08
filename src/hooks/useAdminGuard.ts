'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

type GuardState = 'loading' | 'authorized';

export function useAdminGuard() {
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [state, setState] = useState<GuardState>('loading');

  useEffect(() => {
    let isMounted = true;

    async function checkAccess() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', session.user.id)
        .single();

      if (!profile?.is_admin) {
        await supabase.auth.signOut();
        router.replace('/login');
        return;
      }

      if (isMounted) {
        setState('authorized');
      }
    }

    checkAccess();

    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  return {
    isAuthorized: state === 'authorized',
    supabase,
  };
}


