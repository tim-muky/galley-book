export default function RecipeLoading() {
  return (
    <div className="min-h-screen bg-white animate-pulse">
      <div className="w-full aspect-[3/2] bg-surface-highest" />
      <div className="px-5 py-6 space-y-6">
        <div className="flex gap-2">
          <div className="h-6 w-16 bg-surface-highest rounded-full" />
          <div className="h-6 w-20 bg-surface-highest rounded-full" />
        </div>
        <div className="h-5 w-28 bg-surface-highest rounded" />
        <div className="bg-surface-low rounded-md px-5 py-2 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex justify-between py-2 border-b border-surface-highest">
              <div className="h-4 w-28 bg-surface-highest rounded" />
              <div className="h-4 w-14 bg-surface-highest rounded" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="w-7 h-7 rounded-full bg-surface-highest flex-shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3 bg-surface-highest rounded w-full" />
                <div className="h-3 bg-surface-highest rounded w-4/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
