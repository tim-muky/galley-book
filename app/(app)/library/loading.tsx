export default function LibraryLoading() {
  return (
    <div className="px-5 pt-12 pb-6 animate-pulse">
      <div className="w-10 h-10 bg-surface-highest rounded mb-3" />
      <div className="h-3 w-24 bg-surface-highest rounded mb-2" />
      <div className="h-9 w-40 bg-surface-highest rounded mb-4" />
      <div className="flex gap-2 mb-6">
        {[1, 2].map((i) => (
          <div key={i} className="w-7 h-7 rounded-full bg-surface-highest" />
        ))}
      </div>
      <div className="w-full h-11 bg-surface-highest rounded-sm mb-4" />
      <div className="flex gap-2 mb-6">
        {[80, 60, 64, 56, 72].map((w, i) => (
          <div key={i} className="h-7 rounded-full bg-surface-highest flex-shrink-0" style={{ width: w }} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="w-full aspect-[4/3] bg-surface-highest rounded-md" />
        ))}
      </div>
    </div>
  );
}
