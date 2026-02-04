import Link from "next/link";
import { Sparkles, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#05070A] text-[#E5E7EB] flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="w-32 h-32 bg-white/5 border border-cyan-500/20 rounded-2xl flex items-center justify-center backdrop-blur-xl">
              <Sparkles className="w-16 h-16 text-cyan-400" />
            </div>
            <div className="absolute inset-0 bg-cyan-500/20 rounded-2xl blur-2xl -z-10" />
          </div>
        </div>

        {/* 404 */}
        <div className="space-y-2">
          <h1 className="text-6xl font-bold text-cyan-400">404</h1>
          <h2 className="text-2xl font-semibold">გვერდი ვერ მოიძებნა</h2>
          <p className="text-sm text-slate-400">Page Not Found</p>
        </div>

        {/* Description */}
        <p className="text-slate-400">
          სამწუხაროდ, მოთხოვნილი გვერდი არ არსებობს.
          <br />
          <span className="text-sm">
            Sorry, the requested page does not exist.
          </span>
        </p>

        {/* CTA */}
        <Link
          href="/workspace"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg font-medium transition-colors shadow-lg shadow-cyan-500/25"
        >
          <Home className="w-5 h-5" />
          <span>სამუშაო არეში დაბრუნება</span>
        </Link>
        <div>
          <Link
            href="/workspace"
            className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            Back to Workspace
          </Link>
        </div>
      </div>
    </div>
  );
}
