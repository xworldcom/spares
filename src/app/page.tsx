export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 text-neutral-900">
      <div className="max-w-md">
        <p className="text-sm font-medium tracking-wide text-neutral-500 uppercase">
          Private
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Spares</h1>
        <p className="mt-4 text-neutral-700">
          This application is private and is not live.
        </p>
        <p className="mt-2 text-neutral-600">
          It is an internal industrial spare-parts platform. Do not deploy it
          to a public production URL.
        </p>
      </div>
    </main>
  );
}
