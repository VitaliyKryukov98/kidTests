'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import { useAdminGuard } from '@/hooks/useAdminGuard';

type TestRow = {
  id: string;
  title: string;
};

type TestVersionRow = {
  id: string;
  version: number | null;
  published_at: string | null;
};

type TestLinkRow = {
  id: string;
  public_id: string;
  is_active: boolean;
};

const DEFAULT_BASE_URL = 'http://localhost:3000';

const formatVersionLabel = (version: number | null) => {
  if (typeof version !== 'number') {
    return '—';
  }
  return `Версия v${version}`;
};

export default function TestLinkPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const { isAuthorized, supabase } = useAdminGuard();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<TestRow | null>(null);
  const [testVersion, setTestVersion] = useState<TestVersionRow | null>(null);
  const [link, setLink] = useState<TestLinkRow | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isCopying, setIsCopying] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [isPending, startTransition] = useTransition();

  const baseUrl = useMemo(() => {
    const envValue = process.env.NEXT_PUBLIC_APP_URL;
    if (!envValue || envValue.trim().length === 0) {
      return DEFAULT_BASE_URL;
    }
    return envValue.replace(/\/$/, '');
  }, []);

  const publicUrl = useMemo(() => {
    if (!link?.public_id) {
      return '';
    }
    return `${baseUrl}/t/${link.public_id}`;
  }, [baseUrl, link?.public_id]);

  useEffect(() => {
    if (!slug) {
      setError('Неверные параметры URL.');
      setIsLoading(false);
      return;
    }

    if (!isAuthorized) {
      return;
    }

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const { data: testData, error: testError } = await supabase
          .from('tests')
          .select('id, title')
          .eq('slug', slug)
          .single<TestRow>();

        if (testError || !testData) {
          throw testError ?? new Error('Тест не найден.');
        }

        const { data: versionData, error: versionError } = await supabase
          .from('test_versions')
          .select('id, version, published_at')
          .eq('test_id', testData.id)
          .order('published_at', { ascending: false, nullsFirst: false })
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle<TestVersionRow>();

        if (versionError) {
          throw versionError;
        }

        if (!versionData) {
          throw new Error('Для теста нет ни одной версии.');
        }

        const { data: existingLink, error: linkError } = await supabase
          .from('test_links')
          .select('id, public_id, is_active')
          .eq('test_version_id', versionData.id)
          .maybeSingle<TestLinkRow>();

        let ensuredLink = existingLink ?? null;

        if (linkError && linkError.code !== 'PGRST116') {
          throw linkError;
        }

        if (!ensuredLink) {
          const { data: createdLink, error: createError } = await supabase
            .from('test_links')
            .insert([{ test_version_id: versionData.id, is_active: true }])
            .select('id, public_id, is_active')
            .single<TestLinkRow>();

          if (createError || !createdLink) {
            throw createError ?? new Error('Не удалось создать ссылку.');
          }

          ensuredLink = createdLink;
        }

        const url = `${baseUrl}/t/${ensuredLink.public_id}`;
        const dataUrl = await QRCode.toDataURL(url);

        if (cancelled) {
          return;
        }

        setTest(testData);
        setTestVersion(versionData);
        setLink(ensuredLink);
        setQrDataUrl(dataUrl);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Неожиданная ошибка.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [slug, baseUrl, isAuthorized, supabase]);

  useEffect(() => {
    if (!link?.public_id) {
      setQrDataUrl('');
      return;
    }

    let cancelled = false;

    async function buildQr() {
      try {
        const dataUrl = await QRCode.toDataURL(`${baseUrl}/t/${link?.public_id ?? ''}`);
        if (!cancelled) {
          setQrDataUrl(dataUrl);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setQrDataUrl('');
        }
      }
    }

    buildQr();

    return () => {
      cancelled = true;
    };
  }, [baseUrl, link?.public_id]);

  const handleCopy = async () => {
    if (!publicUrl) {
      return;
    }

    setIsCopying(true);
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopyStatus('ok');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch (err) {
      console.error(err);
      setCopyStatus('fail');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } finally {
      setIsCopying(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const toggleActive = () => {
    if (!link) {
      return;
    }

    const nextValue = !link.is_active;

    startTransition(async () => {
      const { error: updateError } = await supabase
        .from('test_links')
        .update({ is_active: nextValue })
        .eq('id', link.id);

      if (updateError) {
        console.error(updateError);
        alert('Не удалось обновить статус. Попробуйте ещё раз.');
        return;
      }

      setLink((prev) => (prev ? { ...prev, is_active: nextValue } : prev));
    });
  };

  if (!isAuthorized) {
    return (
      <div className="max-w-xl mx-auto p-6 space-y-4">
        <p className="text-center text-lg text-white/80">Проверка доступа…</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-xl mx-auto p-6 space-y-4">
        <p className="text-center text-lg text-white/80">Загрузка…</p>
      </div>
    );
  }

  if (error || !test || !testVersion || !link) {
    return (
      <div className="max-w-xl mx-auto p-6 space-y-4">
        <p className="rounded-xl bg-red-600/10 px-4 py-3 text-center text-base font-medium text-red-500">
          {error ?? 'Не удалось загрузить данные.'}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <header className="space-y-1 text-center">
        <h1 className="text-2xl font-bold text-white">{test.title}</h1>
        <p className="text-sm text-white/70">{formatVersionLabel(testVersion.version)}</p>
      </header>

      <div className="flex justify-center">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="QR" className="h-48 w-48 rounded-lg bg-white p-3" />
        ) : (
          <div className="flex h-48 w-48 items-center justify-center rounded-lg bg-white/10 text-white/60">
            QR недоступен
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold text-white">Публичная ссылка</label>
        <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-white/90 md:flex-row md:items-center">
          <input
            value={publicUrl}
            readOnly
            className="flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!publicUrl || isCopying}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {copyStatus === 'ok' ? 'Скопировано!' : copyStatus === 'fail' ? 'Ошибка' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              Print
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-white">Активна</p>
          <p className="text-xs text-white/60">Управляет доступностью публичной ссылки.</p>
        </div>
        <button
          type="button"
          onClick={toggleActive}
          disabled={isPending}
          className={`relative inline-flex h-7 w-14 items-center rounded-full border border-white/20 px-1 transition ${
            link.is_active ? 'bg-green-500/90' : 'bg-white/10'
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${
              link.is_active ? 'translate-x-7' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
