export default function LocaleLoading() {
  return (
    <div className="min-h-screen bg-[#05070A] text-white flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full border-4 border-[#D4AF37] border-t-transparent animate-spin" />
        <p className="text-gray-400 animate-pulse">Loading&hellip;</p>
      </div>
    </div>
  );
}
