'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAdminGuard } from '@/hooks/useAdminGuard';

type TestRow = {
  id: string;
  slug: string;
  title: string;
  created_at: string;
};

type VersionRow = {
  id: string;
  test_id: string;
  version: number;
  published_at: string | null;
};

type SubmissionRow = {
  id: string;
  test_version_id: string;
  created_at: string;
};

const formatDate = (value: string | null) => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthorized, supabase } = useAdminGuard();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tests, setTests] = useState<TestRow[]>([]);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const {
          data: testsData,
          error: testsError,
        } = await supabase
          .from('tests')
          .select('id, slug, title, created_at')
          .order('created_at', { ascending: false });

        if (testsError) {
          throw testsError;
        }

        const normalizedTests = (testsData ?? []) as TestRow[];

        if (cancelled) {
          return;
        }

        setTests(normalizedTests);

        if (!normalizedTests.length) {
          setVersions([]);
          setSubmissions([]);
          return;
        }

        const testIds = normalizedTests.map((test) => test.id);

        const {
          data: versionsData,
          error: versionsError,
        } = await supabase
          .from('test_versions')
          .select('id, test_id, version, published_at')
          .in('test_id', testIds);

        if (versionsError) {
          throw versionsError;
        }

        const normalizedVersions = (versionsData ?? []) as VersionRow[];

        if (cancelled) {
          return;
        }

        setVersions(normalizedVersions);

        if (!normalizedVersions.length) {
          setSubmissions([]);
          return;
        }

        const versionIds = normalizedVersions.map((version) => version.id);

        const {
          data: subsData,
          error: subsError,
        } = await supabase
          .from('submissions')
          .select('id, test_version_id, created_at')
          .in('test_version_id', versionIds);

        if (subsError) {
          throw subsError;
        }

        if (cancelled) {
          return;
        }

        setSubmissions((subsData ?? []) as SubmissionRow[]);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Не удалось загрузить данные.');
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
  }, [isAuthorized, supabase]);

  const computed = useMemo(() => {
    const versionByTest = new Map<string, VersionRow[]>();
    versions.forEach((version) => {
      const list = versionByTest.get(version.test_id) ?? [];
      list.push(version);
      versionByTest.set(version.test_id, list);
    });

    const subCountByVersion = new Map<string, number>();
    submissions.forEach((submission) => {
      const current = subCountByVersion.get(submission.test_version_id) ?? 0;
      subCountByVersion.set(submission.test_version_id, current + 1);
    });

    const subCountByTest = new Map<string, number>();

    tests.forEach((test) => {
      const testVersions = versionByTest.get(test.id) ?? [];
      let sum = 0;
      testVersions.forEach((version) => {
        sum += subCountByVersion.get(version.id) ?? 0;
      });
      subCountByTest.set(test.id, sum);
    });

    return {
      subCountByTest,
    };
  }, [tests, versions, submissions]);

  const filteredTests = useMemo(() => {
    if (!searchTerm.trim()) {
      return tests;
    }
    const term = searchTerm.trim().toLowerCase();
    return tests.filter((test) => test.title.toLowerCase().includes(term));
  }, [tests, searchTerm]);

  if (!isAuthorized) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <p className="text-center text-lg text-white/80">Проверка доступа…</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <p className="text-center text-lg text-white/80">Загрузка…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto p-6 space-y-4">
        <p className="rounded-xl bg-red-600/10 px-4 py-3 text-center text-base font-medium text-red-500">
          {error}
        </p>
        <div className="text-center">
          <Link
            href="/tests/new"
            className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Создать тест
          </Link>
        </div>
      </div>
    );
  }

  if (!tests.length) {
    return (
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">Тесты</h1>
          <Link
            href="/tests/new"
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Создать тест
          </Link>
        </header>
        <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center text-white/70">
          <p className="text-lg font-medium">Тестов пока нет</p>
          <p className="mt-2 text-sm">Создайте первый тест, чтобы начать сбор ответов.</p>
          <div className="mt-6">
            <Link
              href="/tests/new"
              className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              Создать тест
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Тесты</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/tests/new"
            className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Создать тест
          </Link>
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              router.replace('/login');
            }}
            className="inline-flex items-center justify-center rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Выйти
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <input
            type="search"
            placeholder="Поиск по названию"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/60 focus:border-white focus:outline-none focus:ring-2 focus:ring-white/40 md:max-w-sm"
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-neutral-800">
          <div className="hidden grid-cols-4 bg-white/5 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white/70 md:grid">
            <div className="col-span-2">Название</div>
            <div>Прохождений</div>
            <div>Создан</div>
            <div className="text-right">Действия</div>
          </div>

          <div className="divide-y divide-white/5">
            {filteredTests.length === 0 ? (
              <div className="p-6 text-center text-sm text-white/60">Не найдено тестов по запросу.</div>
            ) : (
              filteredTests.map((test) => {
                const submissionsCount = computed.subCountByTest.get(test.id) ?? 0;
                const hasAnyVersion = versions.some((version) => version.test_id === test.id);
                const qrHref = hasAnyVersion ? `/tests/${test.slug}/links` : '#';
                const statsHref = hasAnyVersion ? `/tests/${test.slug}/stats` : '#';

                return (
                  <div
                    key={test.id}
                    className="grid gap-y-3 px-5 py-4 text-sm text-white/90 md:grid-cols-4 md:items-center"
                  >
                    <div className="md:col-span-2">
                      <p className="font-semibold text-white">{test.title}</p>
                      <p className="text-xs text-white/40">slug: {test.slug}</p>
                    </div>
                    <div>{submissionsCount}</div>
                    <div>{formatDate(test.created_at)}</div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {hasAnyVersion ? (
                        <Link
                          href={qrHref}
                          className="rounded-lg border border-white/30 bg-white/90 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-white"
                        >
                          QR
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled
                          title="Создайте версию теста"
                          className="cursor-not-allowed rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/40"
                        >
                          QR
                        </button>
                      )}
                      {hasAnyVersion ? (
                        <Link
                          href={statsHref}
                          className="rounded-lg border border-white/30 bg-white/90 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-white"
                        >
                          Статистика
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled
                          title="Создайте версию теста"
                          className="cursor-not-allowed rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/40"
                        >
                          Статистика
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteTest(test)}
                        className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/10"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );

  async function handleDeleteTest(test: TestRow) {
    const confirmDelete = window.confirm(
      `Удалить тест "${test.title}" вместе со всеми версиями, ссылками, прохождениями и ответами? Это действие нельзя отменить.`,
    );

    if (!confirmDelete) {
      return;
    }

    try {
      const { data: versionRows, error: versionsError } = await supabase
        .from('test_versions')
        .select('id')
        .eq('test_id', test.id);

      if (versionsError) {
        throw versionsError;
      }

      const versionIds = (versionRows ?? []).map((version) => version.id);

      if (versionIds.length > 0) {
        const { data: submissionRows, error: submissionsError } = await supabase
          .from('submissions')
          .select('id')
          .in('test_version_id', versionIds);

        if (submissionsError) {
          throw submissionsError;
        }

        const submissionIds = (submissionRows ?? []).map((submission) => submission.id);

        if (submissionIds.length > 0) {
          const { error: deleteAnswersError } = await supabase
            .from('answers')
            .delete()
            .in('submission_id', submissionIds);

          if (deleteAnswersError) {
            throw deleteAnswersError;
          }

          const { error: deleteSubmissionsError } = await supabase
            .from('submissions')
            .delete()
            .in('id', submissionIds);

          if (deleteSubmissionsError) {
            throw deleteSubmissionsError;
          }
        }

        const { data: questionRows, error: questionsError } = await supabase
          .from('questions')
          .select('id')
          .in('test_version_id', versionIds);

        if (questionsError) {
          throw questionsError;
        }

        const questionIds = (questionRows ?? []).map((question) => question.id);

        if (questionIds.length > 0) {
          const { error: deleteOptionsError } = await supabase
            .from('options')
            .delete()
            .in('question_id', questionIds);

          if (deleteOptionsError) {
            throw deleteOptionsError;
          }

          const { error: deleteQuestionsError } = await supabase
            .from('questions')
            .delete()
            .in('id', questionIds);

          if (deleteQuestionsError) {
            throw deleteQuestionsError;
          }
        }

        const { error: deleteLinksError } = await supabase
          .from('test_links')
          .delete()
          .in('test_version_id', versionIds);

        if (deleteLinksError) {
          throw deleteLinksError;
        }

        const { error: deleteVersionsError } = await supabase
          .from('test_versions')
          .delete()
          .in('id', versionIds);

        if (deleteVersionsError) {
          throw deleteVersionsError;
        }
      }

      const { error: deleteTestError } = await supabase.from('tests').delete().eq('id', test.id);

      if (deleteTestError) {
        throw deleteTestError;
      }

      const deletedVersionIds = new Set(versionIds);
      setTests((prev) => prev.filter((item) => item.id !== test.id));
      setVersions((prev) => prev.filter((version) => !deletedVersionIds.has(version.id)));
      setSubmissions((prev) => prev.filter((submission) => !deletedVersionIds.has(submission.test_version_id)));

      alert('Тест успешно удалён.');
    } catch (deleteError) {
      console.error(deleteError);
      alert(
        deleteError instanceof Error
          ? `Не удалось удалить тест: ${deleteError.message}`
          : 'Не удалось удалить тест. Попробуйте ещё раз.',
      );
    }
  }
}
