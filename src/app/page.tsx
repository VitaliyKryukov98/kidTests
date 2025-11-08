'use client';

import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-black via-slate-900 to-black px-6 text-center text-white">
      <h1 className="text-4xl font-bold sm:text-5xl">Kids Tests</h1>
      <p className="max-w-xl text-sm text-white/70 sm:text-base">
        Платформа анонимного тестирования. Используйте публичную ссылку для участников и входите
        как администратор, чтобы управлять тестами и просматривать статистику.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/login"
          className="rounded-xl bg-white px-5 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
        >
          Войти как администратор
        </Link>
        <Link
          href="/dashboard"
          className="rounded-xl border border-white/20 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Панель тестов
        </Link>
      </div>
    </main>
  );
}
