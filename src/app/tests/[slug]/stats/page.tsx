'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Chart,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
  ChartOptions,
  ChartData,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useAdminGuard } from '@/hooks/useAdminGuard';

Chart.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type TestRow = {
  id: string;
  title: string;
  slug: string;
};

type TestVersionRow = {
  id: string;
  version: number | null;
  published_at: string | null;
};

type QuestionRow = {
  id: string;
  kind: 'SINGLE' | 'TEXT';
  text: string;
  ord: number | null;
};

type OptionRow = {
  id: string;
  question_id: string;
  text: string;
  ord: number | null;
};

type SubmissionRow = {
  id: string;
  created_at: string;
  participant: string;
};

type AnswerRow = {
  submission_id: string;
  question_id: string;
  option_id: string | null;
  free_text: string | null;
};

const formatDateTime = (value: string | number | null) => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString('ru-RU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

const versionLabel = (version: number | null) => {
  if (typeof version !== 'number') {
    return 'Версия не опубликована';
  }
  return `Версия v${version}`;
};

export default function TestStatsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const { isAuthorized, supabase } = useAdminGuard();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<TestRow | null>(null);
  const [testVersion, setTestVersion] = useState<TestVersionRow | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [options, setOptions] = useState<OptionRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);

  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [participantQuery, setParticipantQuery] = useState<string>('');

  useEffect(() => {
    if (!slug) {
      setError('Неверный адрес.');
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
          .select('id, title, slug')
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

        const { data: questionsData, error: questionsError } = await supabase
          .from('questions')
          .select('id, kind, text, ord')
          .eq('test_version_id', versionData.id)
          .order('ord', { ascending: true });

        if (questionsError || !questionsData) {
          throw questionsError ?? new Error('Не удалось загрузить вопросы.');
        }

        const singleQuestionIds = (questionsData as QuestionRow[])
          .filter((question) => question.kind === 'SINGLE')
          .map((question) => question.id);

        let optionsData: OptionRow[] = [];

        if (singleQuestionIds.length) {
          const { data: optionsRows, error: optionsError } = await supabase
            .from('options')
            .select('id, question_id, text, ord')
            .in('question_id', singleQuestionIds)
            .order('ord', { ascending: true });

          if (optionsError) {
            throw optionsError;
          }

          optionsData = (optionsRows ?? []) as OptionRow[];
        }

        const { data: submissionsData, error: submissionsError } = await supabase
          .from('submissions')
          .select('id, created_at, participant')
          .eq('test_version_id', versionData.id)
          .order('created_at', { ascending: false });

        if (submissionsError) {
          throw submissionsError;
        }

        const submissionIds = (submissionsData ?? []).map((submission) => submission.id);
        let answersData: AnswerRow[] = [];

        if (submissionIds.length) {
          const { data: answersRows, error: answersError } = await supabase
            .from('answers')
            .select('submission_id, question_id, option_id, free_text')
            .in('submission_id', submissionIds);

          if (answersError) {
            throw answersError;
          }

          answersData = (answersRows ?? []) as AnswerRow[];
        }

        if (!cancelled) {
          setTest(testData as TestRow);
          setTestVersion(versionData as TestVersionRow);
          setQuestions(questionsData as QuestionRow[]);
          setOptions(optionsData);
          setSubmissions((submissionsData ?? []) as SubmissionRow[]);
          setAnswers(answersData);
        }
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
  }, [slug, isAuthorized, supabase]);

  const filteredSubmissions = useMemo(() => {
    if (!submissions.length) {
      return [];
    }

    return submissions.filter((submission) => {
      const createdAt = new Date(submission.created_at);

      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        if (createdAt < fromDate) {
          return false;
        }
      }

      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (createdAt > toDate) {
          return false;
        }
      }

      if (participantQuery.trim()) {
        const term = participantQuery.trim().toLowerCase();
        if (!submission.participant.toLowerCase().includes(term)) {
          return false;
        }
      }

      return true;
    });
  }, [submissions, dateFrom, dateTo, participantQuery]);

  const metrics = useMemo(() => {
    if (!isAuthorized) {
      return {
        totalSubmissions: 0,
        lastSubmissionAt: null,
      };
    }

    const totalSubmissions = filteredSubmissions.length;

    const lastSubmissionTimestamp = filteredSubmissions.reduce<number | null>((latest, submission) => {
      const current = new Date(submission.created_at).getTime();
      if (Number.isNaN(current)) {
        return latest;
      }
      if (latest === null || current > latest) {
        return current;
      }
      return latest;
    }, null);

    return {
      totalSubmissions,
      lastSubmissionAt: lastSubmissionTimestamp,
    };
  }, [filteredSubmissions, isAuthorized]);

  const charts = useMemo(() => {
    if (!isAuthorized) {
      return [] as Array<{ question: QuestionRow; data: ChartData<'bar'>; options: ChartOptions<'bar'> }>;
    }

    const chartsData: Array<{ question: QuestionRow; data: ChartData<'bar'>; options: ChartOptions<'bar'> }> = [];

    if (!questions.length) {
      return chartsData;
    }

    const submissionIdSet = new Set(filteredSubmissions.map((submission) => submission.id));

    const answersByQuestion = new Map<string, AnswerRow[]>();
    answers.forEach((answer) => {
      if (!submissionIdSet.has(answer.submission_id)) {
        return;
      }
      const list = answersByQuestion.get(answer.question_id) ?? [];
      list.push(answer);
      answersByQuestion.set(answer.question_id, list);
    });

    questions
      .filter((question) => question.kind === 'SINGLE')
      .forEach((question) => {
        const questionOptions = options
          .filter((option) => option.question_id === question.id)
          .sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0));

        const counts = questionOptions.map(() => 0);

        const answersForQuestion = answersByQuestion.get(question.id) ?? [];

        answersForQuestion.forEach((answer) => {
          if (!answer.option_id) {
            return;
          }
          const index = questionOptions.findIndex((option) => option.id === answer.option_id);
          if (index >= 0) {
            counts[index] += 1;
          }
        });

        const data: ChartData<'bar'> = {
          labels: questionOptions.map((option) => option.text),
          datasets: [
            {
              label: 'Ответы',
              data: counts,
            },
          ],
        };

        const optionsChart: ChartOptions<'bar'> = {
          responsive: true,
          plugins: {
            legend: {
              display: false,
            },
          },
        };

        chartsData.push({ question, data, options: optionsChart });
      });

    return chartsData;
  }, [questions, options, answers, filteredSubmissions, isAuthorized]);

  const latestSubmissions = useMemo(() => {
    if (!isAuthorized) {
      return [];
    }
    const sorted = [...filteredSubmissions].sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return sorted.slice(0, 20);
  }, [filteredSubmissions, isAuthorized]);

  const handleResetFilters = () => {
    setDateFrom('');
    setDateTo('');
    setParticipantQuery('');
  };

  const handleExportCsv = () => {
    if (!filteredSubmissions.length || !test || !testVersion) {
      return;
    }

    const header = ['submission_id', 'participant', 'created_at'];
    const rows = filteredSubmissions.map((submission) => [
      submission.id,
      submission.participant,
      submission.created_at,
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '_')
      .slice(0, 13);

    const filename = `stats_${test.slug}_${timestamp}.csv`;

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

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

  if (error || !test || !testVersion) {
    return (
      <div className="max-w-5xl mx-auto p-6 space-y-4">
        <p className="rounded-xl bg-red-600/10 px-4 py-3 text-center text-base font-medium text-red-500">
          {error ?? 'Не удалось загрузить данные.'}
        </p>
        <div className="text-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Назад к списку
          </Link>
        </div>
      </div>
    );
  }

  const hasData = filteredSubmissions.length > 0;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">{test.title}</h1>
          <p className="text-sm text-white/60">{versionLabel(testVersion.version)}</p>
          {testVersion.published_at && (
            <p className="text-xs text-white/40">Опубликована: {formatDate(testVersion.published_at)}</p>
          )}
        </div>
        <div className="flex gap-3">
          <Link
            href="/dashboard"
            className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Назад
          </Link>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!hasData}
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Экспорт CSV
          </button>
        </div>
      </header>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-white/60">Дата от</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="rounded-lg border border-white/20 bg-black/20 px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-white/60">Дата до</label>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="rounded-lg border border-white/20 bg-black/20 px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-2 md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-white/60">Участник</label>
            <input
              type="search"
              value={participantQuery}
              onChange={(event) => setParticipantQuery(event.target.value)}
              placeholder="ФИО или код"
              className="rounded-lg border border-white/20 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/50 focus:border-white focus:outline-none"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleResetFilters}
            className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white transition hover:bg-white/10"
          >
            Сбросить
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-semibold text-white">Метрики</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Прохождений</p>
            <p className="mt-2 text-2xl font-bold text-white">{metrics.totalSubmissions}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Последний проход</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {metrics.lastSubmissionAt ? formatDateTime(metrics.lastSubmissionAt) : '—'}
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Графики</h2>
        {charts.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/60">
            Нет вопросов с вариантами.
          </p>
        ) : (
          charts.map(({ question, data, options: chartOptions }) => (
            <div key={question.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-white">
                {question.ord ? `${question.ord}. ` : ''}
                {question.text}
              </p>
              <div className="mt-4">
                <Bar data={data} options={chartOptions} />
              </div>
            </div>
          ))
        )}
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-lg font-semibold text-white">Последние прохождения</h2>
          <p className="text-xs text-white/50">Показаны последние {latestSubmissions.length} записей</p>
        </div>
        {hasData ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm text-white/80">
              <thead className="bg-white/5 text-xs uppercase tracking-wide text-white/60">
                <tr>
                  <th className="px-5 py-3 text-left">Участник</th>
                  <th className="px-5 py-3 text-left">Дата</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {latestSubmissions.map((submission) => (
                  <tr key={submission.id}>
                    <td className="px-5 py-3 font-medium">
                      <Link
                        href={`/tests/${slug}/submissions/${submission.id}`}
                        className="text-white hover:underline"
                      >
                        {submission.participant}
                      </Link>
                    </td>
                    <td className="px-5 py-3">{formatDateTime(submission.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 pb-6 text-center text-sm text-white/60">Нет данных для выбранных фильтров.</p>
        )}
      </section>
    </div>
  );
}
