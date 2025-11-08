'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type QuestionKind = 'SINGLE' | 'TEXT';

type SupabaseOption = {
  id: string;
  question_id: string;
  text: string;
  payload: Record<string, unknown> | null;
  ord: number | null;
};

type SupabaseQuestion = {
  id: string;
  kind: QuestionKind;
  text: string;
  ord: number | null;
};

type TestVersionRow = {
  id: string;
  test_id: string;
  version: string | null;
};

type TestLinkRow = {
  id: string;
  public_id: string;
  is_active: boolean;
  test_versions: TestVersionRow | TestVersionRow[];
};

type Question = SupabaseQuestion & {
  options?: SupabaseOption[];
};

const ERROR_MESSAGE = 'Ссылка недействительна или тест отключён.';

export default function PublicTestPage() {
  const params = useParams<{ publicId: string }>();
  const router = useRouter();
  const publicId = params?.publicId;

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testTitle, setTestTitle] = useState('');
  const [testDescription, setTestDescription] = useState<string | null>(null);
  const [testVersionId, setTestVersionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [participant, setParticipant] = useState('');
  const [answersState, setAnswersState] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!publicId) {
      setLoadError(ERROR_MESSAGE);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    async function loadData() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const {
          data: linkData,
          error: linkError,
        } = await supabase
          .from('test_links')
          .select('id, public_id, is_active, test_versions!inner(id, test_id, version)')
          .eq('public_id', publicId)
          .eq('is_active', true)
          .single<TestLinkRow>();

        if (linkError || !linkData || !linkData.is_active) {
          throw new Error(ERROR_MESSAGE);
        }

        const testVersionRaw = Array.isArray(linkData.test_versions)
          ? linkData.test_versions[0]
          : linkData.test_versions;

        if (!testVersionRaw) {
          throw new Error(ERROR_MESSAGE);
        }

        const { data: testRow, error: testError } = await supabase
          .from('tests')
          .select('title, description')
          .eq('id', testVersionRaw.test_id)
          .single<{ title: string; description: string | null }>();

        if (testError || !testRow) {
          throw new Error(ERROR_MESSAGE);
        }

        const {
          data: questionsData,
          error: questionsError,
        } = await supabase
          .from('questions')
          .select('id, kind, text, ord')
          .eq('test_version_id', testVersionRaw.id)
          .order('ord', { ascending: true });

        if (questionsError || !questionsData) {
          throw new Error(ERROR_MESSAGE);
        }

        const typedQuestions = questionsData as SupabaseQuestion[];

        const singleQuestionIds = typedQuestions
          .filter((question) => question.kind === 'SINGLE')
          .map((question) => question.id);

        const optionsByQuestionId = new Map<string, SupabaseOption[]>();

        if (singleQuestionIds.length > 0) {
          const {
            data: optionsData,
            error: optionsError,
          } = await supabase
            .from('options')
            .select('id, question_id, text, payload, ord')
            .in('question_id', singleQuestionIds)
            .order('ord', { ascending: true });

          if (optionsError) {
            throw new Error(ERROR_MESSAGE);
          }

          const typedOptions = (optionsData ?? []) as SupabaseOption[];

          typedOptions.forEach((option) => {
            const key = option.question_id;
            const existing = optionsByQuestionId.get(key);
            if (existing) {
              existing.push(option);
            } else {
              optionsByQuestionId.set(key, [option]);
            }
          });
        }

        if (!isMounted) {
          return;
        }

        const normalizedQuestions: Question[] = typedQuestions.map((question) => {
          if (question.kind !== 'SINGLE') {
            return question;
          }

          return {
            ...question,
            options: optionsByQuestionId.get(question.id) ?? [],
          };
        });

        setTestTitle(testRow.title);
        setTestDescription(testRow.description ?? null);
        setTestVersionId(testVersionRaw.id);
        setQuestions(normalizedQuestions);
        setAnswersState({});
      } catch (error) {
        console.error(error);
        if (!isMounted) {
          return;
        }
        setLoadError(ERROR_MESSAGE);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [publicId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!testVersionId || !publicId) {
      return;
    }

    const trimmedParticipant = participant.trim();

    if (!trimmedParticipant) {
      alert('Введите ФИО или код участника.');
      return;
    }

    const ensuredAnswers = { ...answersState };
    let answersChanged = false;

    questions.forEach((question) => {
      if (question.kind !== 'SINGLE') {
        return;
      }

      const key = String(question.id);
      if (ensuredAnswers[key]) {
        return;
      }

      const sortedOptions = [...(question.options ?? [])].sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0));
      const firstOption = sortedOptions[0];

      if (firstOption) {
        ensuredAnswers[key] = firstOption.id;
        answersChanged = true;
      }
    });

    if (answersChanged) {
      setAnswersState(ensuredAnswers);
    }

    const missingSingleChoice = questions.some((question) => {
      if (question.kind !== 'SINGLE') {
        return false;
      }
      const answer = ensuredAnswers[String(question.id)];
      return !answer;
    });

    if (missingSingleChoice) {
      alert('Пожалуйста, ответьте на все вопросы с вариантами.');
      return;
    }

    const missingTextAnswer = questions.some((question) => {
      if (question.kind !== 'TEXT') {
        return false;
      }
      const answer = ensuredAnswers[String(question.id)]?.trim() ?? '';
      return !answer;
    });

    if (missingTextAnswer) {
      alert('Пожалуйста, заполните все текстовые ответы.');
      return;
    }

    try {
      setIsSubmitting(true);

      const {
        data: submissionData,
        error: submissionError,
      } = await supabase
        .from('submissions')
        .insert({
          test_version_id: testVersionId,
          participant: trimmedParticipant,
          result: null,
        })
        .select('id')
        .single<{ id: string }>();

      if (submissionError || !submissionData) {
        throw submissionError ?? new Error('Не удалось создать запись о прохождении.');
      }

      const submissionId = submissionData.id;

      const answersPayload = questions.map((question) => {
        const answer = ensuredAnswers[String(question.id)];

        if (question.kind === 'SINGLE') {
          return {
            submission_id: submissionId,
            question_id: question.id,
            option_id: answer,
            free_text: null,
          };
        }

        return {
          submission_id: submissionId,
          question_id: question.id,
          option_id: null,
          free_text: answer?.trim() ?? '',
        };
      });

      const { error: answersError } = await supabase.from('answers').insert(answersPayload);

      if (answersError) {
        console.error('Insert answers error:', answersError);
        alert('Ошибка сохранения ответов: ' + answersError.message);
        return;
      }

      router.push(`/t/${publicId}/done`);
    } catch (error) {
      console.error(error);
      alert('Не удалось отправить ответы. Попробуйте ещё раз.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p className="text-center text-lg text-white/80">Загрузка…</p>
      </div>
    );
  }

  if (loadError || !testVersionId) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p className="rounded-xl bg-red-600/10 px-4 py-3 text-center text-base font-medium text-red-500">
          {ERROR_MESSAGE}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-bold text-white">{testTitle}</h1>
        {testDescription ? (
          <p className="text-sm text-white/70">{testDescription}</p>
        ) : (
          <p className="text-sm text-white/70">Пожалуйста, заполните форму и отправьте ответы.</p>
        )}
      </header>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label htmlFor="participant" className="block text-sm font-semibold text-white">
            ФИО / код участника
          </label>
          <input
            id="participant"
            type="text"
            value={participant}
            onChange={(event) => setParticipant(event.target.value)}
            required
            placeholder="Иванов Иван"
            className="w-full rounded-xl border border-white/30 bg-white/10 px-4 py-3 text-base text-white placeholder:text-white/60 focus:border-white focus:outline-none focus:ring-2 focus:ring-white/50"
          />
        </div>

        <div className="space-y-6">
          {questions.map((question, index) => {
            const displayNumber = question.ord ?? index + 1;
            return (
              <div key={question.id} className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-base font-semibold text-white">
                  {displayNumber}. {question.text}
                </p>

                {question.kind === 'SINGLE' && (
                  <div className="space-y-3">
                    {(question.options ?? []).map((option, optionIndex) => {
                      const name = `question-${question.id}`;
                      const value = option.id;
                      const checked = answersState[String(question.id)] === value;

                      return (
                        <label
                          key={option.id}
                          className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-3 transition hover:border-white/40"
                        >
                          <input
                            type="radio"
                            name={name}
                            value={value}
                            checked={checked}
                            required={optionIndex === 0}
                            onChange={(event) =>
                              setAnswersState((prev) => ({
                                ...prev,
                                [String(question.id)]: event.target.value,
                              }))
                            }
                            className="h-4 w-4 text-black"
                          />
                          <span className="text-sm text-white">{option.text}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {question.kind === 'TEXT' && (
                  <textarea
                    rows={4}
                    placeholder="Введите ваш ответ"
                    value={answersState[String(question.id)] ?? ''}
                    required
                    onChange={(event) =>
                      setAnswersState((prev) => ({
                        ...prev,
                        [String(question.id)]: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-white/30 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/60 focus:border-white focus:outline-none focus:ring-2 focus:ring-white/50"
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-center">
          <button
            type="submit"
            disabled={!participant.trim() || isSubmitting}
            className="rounded-xl bg-white px-6 py-3 font-semibold text-black transition hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white/70 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Отправляю…' : 'Отправить'}
          </button>
        </div>
      </form>
    </div>
  );
}
