export function SkeletonBlock({
  height = 16,
  width = "100%",
  className = "",
}: {
  height?: number;
  width?: number | string;
  className?: string;
}) {
  return (
    <div
      className={`ui-skeleton ${className}`.trim()}
      style={{ height, width }}
      aria-hidden
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="ui-card ui-card--default">
      <div className="ui-card__body">
        <SkeletonBlock width="35%" height={12} />
        <SkeletonBlock width="60%" height={28} />
        <SkeletonBlock width="45%" height={12} />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="table">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="table-row">
          <SkeletonBlock width="18%" />
          <SkeletonBlock width="26%" />
          <SkeletonBlock width="20%" />
          <SkeletonBlock width="32%" />
        </div>
      ))}
    </div>
  );
}
