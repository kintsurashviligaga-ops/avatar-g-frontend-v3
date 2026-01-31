"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-white bg-[#05070A]">
      <h2 className="text-xl font-semibold text-red-400">
        Client-side error occurred
      </h2>

      <p className="mt-3 opacity-80">
        Copy this error and send it to me:
      </p>

      <pre className="mt-4 w-full max-w-3xl whitespace-pre-wrap rounded-xl border border-red-500/30 bg-black/40 p-4 text-xs text-red-200">
        {error?.message}
        {"\n\n"}
        {error?.stack}
      </pre>

      <button
        className="mt-6 rounded-xl bg-cyan-600 px-5 py-2 text-sm font-medium hover:bg-cyan-500"
        onClick={() => reset()}
      >
        Try again
      </button>
    </div>
  );
}
