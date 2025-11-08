'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSupabaseClient } from '@supabase/auth-helpers-react';

type GuardState = 'loading' | 'authorized';

export function useAdminGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useSupabaseClient();
  const [state, setState] = useState<GuardState>('loading');

  useEffect(() => {
    let isMounted = true;

    async function checkAccess() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (pathname !== '/login') {
          router.replace('/login');
        }
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!profile?.is_admin) {
        if (pathname !== '/login') {
          router.replace('/login');
        }
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
  }, [pathname, router, supabase]);

  return {
    isAuthorized: state === 'authorized',
    supabase,
  };
}


