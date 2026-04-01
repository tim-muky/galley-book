export default function SettingsLoading() {
  return (
    <div className="px-5 pt-12 pb-8 animate-pulse space-y-10">
      {/* Profile */}
      <div>
        <div className="h-3 w-16 bg-surface-highest rounded mb-4" />
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="w-16 h-16 rounded-full bg-surface-highest" />
          <div className="h-3 w-32 bg-surface-highest rounded" />
        </div>
        <div className="space-y-3">
          <div className="h-11 bg-surface-highest rounded-sm" />
          <div className="h-11 bg-surface-highest rounded-sm" />
          <div className="h-12 bg-surface-highest rounded-full" />
        </div>
      </div>

      {/* Galley */}
      <div>
        <div className="h-3 w-32 bg-surface-highest rounded mb-4" />
        <div className="h-16 bg-surface-highest rounded-md mb-4" />
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 bg-surface-highest rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
