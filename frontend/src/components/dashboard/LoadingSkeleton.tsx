import { Card, SkeletonBlock, SkeletonCard } from "../ui";

export default function LoadingSkeleton() {
  return (
    <div className="dashboard-v3 page-stack">
      <section className="dashboard-shell-hero dashboard-shell-hero--loading">
        <div className="dashboard-shell-hero__copy">
          <SkeletonBlock width="140px" height={12} />
          <SkeletonBlock width="340px" height={28} />
          <SkeletonBlock width="520px" height={14} />
        </div>
        <div className="dashboard-shell-hero__actions">
          <SkeletonBlock width="140px" height={40} />
          <SkeletonBlock width="140px" height={40} />
          <SkeletonBlock width="150px" height={40} />
        </div>
      </section>

      <div className="dashboard-kpi-grid dashboard-kpi-grid--exec">
        {Array.from({ length: 7 }).map((_, idx) => (
          <SkeletonCard key={idx} />
        ))}
      </div>

      <div className="dashboard-grid dashboard-grid--two">
        <Card title="Fluxo" subtitle="Carregando">
          <div className="chart-skeleton" />
        </Card>
        <Card title="Criados vs concluidos" subtitle="Carregando">
          <div className="chart-skeleton" />
        </Card>
      </div>

      <div className="dashboard-grid dashboard-grid--two">
        <Card title="Riscos e gargalos" subtitle="Carregando">
          <div className="chart-skeleton chart-skeleton--sm" />
        </Card>
        <Card title="Visao por pessoa" subtitle="Carregando">
          <div className="chart-skeleton chart-skeleton--sm" />
        </Card>
      </div>
    </div>
  );
}
