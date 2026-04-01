export default function RecommendationsLoading() {
  return (
    <div className="px-5 pt-12 pb-6 animate-pulse">
      <div className="h-3 w-24 bg-surface-highest rounded mb-2" />
      <div className="h-9 w-48 bg-surface-highest rounded mb-6" />

      {/* Filter chips */}
      <div className="flex gap-2 mb-6">
        {[48, 80, 72, 64].map((w, i) => (
          <div key={i} className="h-7 rounded-full bg-surface-highest flex-shrink-0" style={{ width: w }} />
        ))}
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="w-full h-28 bg-surface-highest rounded-md" />
        ))}
      </div>
    </div>
  );
}
