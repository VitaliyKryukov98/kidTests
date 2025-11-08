'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAdminGuard } from '@/hooks/useAdminGuard';

type TestRow = {
  id: string;
};

type SubmissionRow = {
  id: string;
  participant: string;
  created_at: string;
  test_version_id: string;
  test_versions: {
    test_id: string;
  };
};

type AnswerRow = {
  question_id: string;
  option_id: string | null;
  free_text: string | null;
};

type QuestionRow = {
  id: string;
  text: string;
  kind: 'SINGLE' | 'TEXT';
  ord: number | null;
};

type OptionRow = {
  id: string;
  question_id: string;
  text: string;
  ord: number | null;
};

type Params = {
  slug: string;
  submissionId: string;
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
};

export default function SubmissionDetailsPage() {
  const params = useParams<Params>();
  const slug = params?.slug;
  const submissionId = params?.submissionId;
  const { isAuthorized, supabase } = useAdminGuard();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<SubmissionRow | null>(null);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [options, setOptions] = useState<OptionRow[]>([]);

  useEffect(() => {
    if (!slug || !submissionId) {
      setError('Неверные параметры запроса.');
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
          .select('id')
          .eq('slug', slug)
          .single<TestRow>();

        if (testError || !testData) {
          throw testError ?? new Error('Тест не найден.');
        }

        const { data: submissionData, error: submissionError } = await supabase
          .from('submissions')
          .select('id, participant, created_at, test_version_id, test_versions!inner(id, test_id)')
          .eq('id', submissionId)
          .single<SubmissionRow>();

        if (submissionError || !submissionData) {
          throw submissionError ?? new Error('Прохождение не найдено.');
        }

        if (submissionData.test_versions.test_id !== testData.id) {
          throw new Error('Прохождение не принадлежит указанному тесту.');
        }

        const versionId = submissionData.test_version_id;

        const { data: answersData, error: answersError } = await supabase
          .from('answers')
          .select('question_id, option_id, free_text')
          .eq('submission_id', submissionData.id);

        if (answersError) {
          throw answersError;
        }

        const { data: questionsData, error: questionsError } = await supabase
          .from('questions')
          .select('id, text, kind, ord')
          .eq('test_version_id', versionId)
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

        if (cancelled) {
          return;
        }

        setSubmission(submissionData as SubmissionRow);
        setAnswers((answersData ?? []) as AnswerRow[]);
        setQuestions(questionsData as QuestionRow[]);
        setOptions(optionsData);
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
  }, [slug, submissionId, isAuthorized, supabase]);

  const optionById = useMemo(() => {
    const map = new Map<string, OptionRow>();
    options.forEach((option) => {
      map.set(option.id, option);
    });
    return map;
  }, [options]);

  if (!isAuthorized) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <p className="text-center text-lg text-white/80">Проверка доступа…</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <p className="text-center text-lg text-white/80">Загрузка…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <p className="rounded-xl bg-red-600/10 px-4 py-3 text-center text-base font-medium text-red-500">
          {error}
        </p>
        <div className="text-center">
          <Link
            href={`/tests/${slug}/stats`}
            className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            ← Назад к статистике
          </Link>
        </div>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <p className="rounded-xl bg-red-600/10 px-4 py-3 text-center text-base font-medium text-red-500">
          Прохождение не найдено
        </p>
        <div className="text-center">
          <Link
            href={`/tests/${slug}/stats`}
            className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            ← Назад к статистике
          </Link>
        </div>
      </div>
    );
  }

  const answersByQuestion = new Map<string, AnswerRow>();
  answers.forEach((answer) => {
    answersByQuestion.set(answer.question_id, answer);
  });

  const noAnswers = answers.length === 0;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <header className="flex flex-col gap-2">
        <Link
          href={`/tests/${slug}/stats`}
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/20 px-3 py-1.5 text-sm text-white transition hover:bg-white/10"
        >
          ← Назад к статистике
        </Link>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-white">Участник: {submission.participant}</h1>
          <p className="text-sm text-white/70">Дата: {formatDateTime(submission.created_at)}</p>
        </div>
      </header>

      {noAnswers ? (
        <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/60">
          Ответы отсутствуют
        </p>
      ) : (
        <div className="space-y-4">
          {questions.map((question, index) => {
            const answer = answersByQuestion.get(question.id);
            let value: string = '—';

            if (question.kind === 'SINGLE' && answer?.option_id) {
              const option = optionById.get(answer.option_id);
              value = option?.text ?? '—';
            } else if (question.kind === 'TEXT' && answer?.free_text) {
              value = answer.free_text;
            }

            return (
              <div key={question.id} className="space-y-2 rounded-xl bg-neutral-900/40 p-4">
                <p className="text-sm font-semibold text-white">
                  {question.ord ?? index + 1}. {question.text}
                </p>
                <p className="text-sm text-white/80">{value}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
