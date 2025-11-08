'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminGuard } from '@/hooks/useAdminGuard';

type QuestionKind = 'SINGLE' | 'TEXT';

type QuestionForm = {
  id: string;
  text: string;
  kind: QuestionKind;
  options: string[];
};

const defaultQuestion = (): QuestionForm => ({
  id: crypto.randomUUID(),
  text: '',
  kind: 'SINGLE',
  options: ['', ''],
});

const shortId = () => Math.random().toString(36).slice(2, 8);

const createSlug = (title: string) => {
  const base = title.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
  return `${base}-${shortId()}`;
};

export default function CreateTestPage() {
  const router = useRouter();
  const { isAuthorized, supabase } = useAdminGuard();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<QuestionForm[]>([defaultQuestion()]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validationError = useMemo(() => {
    if (!title.trim()) {
      return 'Введите название теста.';
    }
    if (questions.length === 0) {
      return 'Добавьте хотя бы один вопрос.';
    }
    for (const question of questions) {
      if (!question.text.trim()) {
        return 'Заполните все тексты вопросов.';
      }
      if (question.kind === 'SINGLE') {
        if (question.options.length < 2) {
          return 'У вопросов с вариантами должно быть минимум два ответа.';
        }
        if (question.options.some((option) => !option.trim())) {
          return 'Заполните все варианты ответов.';
        }
      }
    }
    return null;
  }, [title, questions]);

  const handleAddQuestion = () => {
    setQuestions((prev) => [...prev, defaultQuestion()]);
  };

  const handleRemoveQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((question) => question.id !== id));
  };

  const handleMoveQuestion = (id: string, direction: 'up' | 'down') => {
    setQuestions((prev) => {
      const index = prev.findIndex((question) => question.id === id);
      if (index === -1) {
        return prev;
      }
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const handleKindChange = (id: string, kind: QuestionKind) => {
    setQuestions((prev) =>
      prev.map((question) =>
        question.id === id
          ? {
              ...question,
              kind,
              options: kind === 'SINGLE' ? (question.options.length ? question.options : ['', '']) : [],
            }
          : question,
      ),
    );
  };

  const handleOptionChange = (questionId: string, optionIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((question) => {
        if (question.id !== questionId) {
          return question;
        }
        const nextOptions = [...question.options];
        nextOptions[optionIndex] = value;
        return { ...question, options: nextOptions };
      }),
    );
  };

  const handleAddOption = (questionId: string) => {
    setQuestions((prev) =>
      prev.map((question) =>
        question.id === questionId
          ? { ...question, options: [...question.options, ''] }
          : question,
      ),
    );
  };

  const handleRemoveOption = (questionId: string, optionIndex: number) => {
    setQuestions((prev) =>
      prev.map((question) => {
        if (question.id !== questionId) {
          return question;
        }
        const nextOptions = question.options.filter((_, index) => index !== optionIndex);
        return {
          ...question,
          options: nextOptions.length === 0 ? [''] : nextOptions,
        };
      }),
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (validationError) {
      alert(validationError);
      return;
    }

    try {
      setIsSubmitting(true);

      const slug = createSlug(title);

      const {
        data: testRow,
        error: testError,
      } = await supabase
        .from('tests')
        .insert({
          title: title.trim(),
          slug,
          description: description.trim() || null,
          status: 'draft',
        })
        .select('id')
        .single<{ id: string }>();

      if (testError || !testRow) {
        throw testError ?? new Error('Не удалось создать тест.');
      }

      const {
        data: versionRow,
        error: versionError,
      } = await supabase
        .from('test_versions')
        .insert({
          test_id: testRow.id,
          version: 1,
        })
        .select('id')
        .single<{ id: string }>();

      if (versionError || !versionRow) {
        throw versionError ?? new Error('Не удалось создать версию теста.');
      }

      const questionPayload = questions.map((question, index) => ({
        test_version_id: versionRow.id,
        text: question.text.trim(),
        kind: question.kind,
        ord: index + 1,
      }));

      const {
        data: insertedQuestions,
        error: questionsError,
      } = await supabase
        .from('questions')
        .insert(questionPayload)
        .select('id, kind')
        .returns<{ id: string; kind: QuestionKind }[]>();

      if (questionsError) {
        throw questionsError;
      }

      const singleQuestionPairs = questions
        .map((question, index) => ({ form: question, inserted: insertedQuestions?.[index] }))
        .filter((pair) => pair.form.kind === 'SINGLE' && pair.inserted) as Array<{
        form: QuestionForm;
        inserted: { id: string };
      }>;

      if (singleQuestionPairs.length > 0) {
        const optionPayload = singleQuestionPairs.flatMap(({ form, inserted }) =>
          form.options.map((option, index) => ({
            question_id: inserted.id,
            text: option.trim(),
            ord: index + 1,
          })),
        );

        const { error: optionsError } = await supabase.from('options').insert(optionPayload);

        if (optionsError) {
          throw optionsError;
        }
      }

      router.push('/dashboard');
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error
          ? `Ошибка создания теста: ${error.message}`
          : 'Ошибка создания теста. Попробуйте ещё раз.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-center text-lg text-white/80">Проверка доступа…</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-white">Создание теста</h1>
        <p className="text-sm text-white/70">Введите общую информацию и добавьте вопросы для теста.</p>
      </header>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <section className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-white" htmlFor="title">
                Название теста
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Например: Тест тревожности"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/50 focus:border-white focus:outline-none focus:ring-2 focus:ring-white/40"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-white" htmlFor="description">
                Описание (необязательно)
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Добавьте инструкции или контекст для теста"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/50 focus:border-white focus:outline-none focus:ring-2 focus:ring-white/40"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Вопросы</h2>
            <button
              type="button"
              onClick={handleAddQuestion}
              className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Добавить вопрос
            </button>
          </div>

          <div className="space-y-4">
            {questions.map((question, index) => (
              <div key={question.id} className="space-y-3 rounded-xl border border-white/10 bg-neutral-900/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-2">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-white/60">
                      Вопрос #{index + 1}
                    </label>
                    <input
                      type="text"
                      value={question.text}
                      onChange={(event) =>
                        setQuestions((prev) =>
                          prev.map((item) =>
                            item.id === question.id ? { ...item, text: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="Введите текст вопроса"
                      className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/50 focus:border-white focus:outline-none focus:ring-2 focus:ring-white/40"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <select
                      value={question.kind}
                      onChange={(event) =>
                        handleKindChange(question.id, event.target.value as QuestionKind)
                      }
                      className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white/80 focus:border-white focus:outline-none"
                    >
                      <option value="SINGLE">SINGLE</option>
                      <option value="TEXT">TEXT</option>
                    </select>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => handleMoveQuestion(question.id, 'up')}
                        className="rounded-lg border border-white/20 px-3 py-1 text-xs text-white transition hover:bg-white/10"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveQuestion(question.id, 'down')}
                        className="rounded-lg border border-white/20 px-3 py-1 text-xs text-white transition hover:bg-white/10"
                      >
                        ↓
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(question.id)}
                      className="rounded-lg border border-red-500/40 px-3 py-1 text-xs font-semibold text-red-400 transition hover:bg-red-500/10"
                    >
                      Удалить
                    </button>
                  </div>
                </div>

                {question.kind === 'SINGLE' && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Варианты</p>
                    <div className="space-y-2">
                      {question.options.map((option, optionIndex) => (
                        <div key={`${question.id}-option-${optionIndex}`} className="flex items-center gap-3">
                          <input
                            type="text"
                            value={option}
                            onChange={(event) =>
                              handleOptionChange(question.id, optionIndex, event.target.value)
                            }
                            placeholder={`Вариант ${optionIndex + 1}`}
                            className="flex-1 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/50 focus:border-white focus:outline-none focus:ring-2 focus:ring-white/40"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveOption(question.id, optionIndex)}
                            className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/10"
                          >
                            Удалить
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddOption(question.id)}
                      className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
                    >
                      Добавить вариант
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Сохраняю…' : 'Создать тест'}
          </button>
        </div>
      </form>
    </div>
  );
}
