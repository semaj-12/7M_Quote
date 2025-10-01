import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";

type DashboardStats = {
  quotesThisMonth: number;
  quotesWonThisMonth: number;
  revenueThisMonth: number;
  avgTurnaroundDays: number;
};

export default function StatsCards() {
  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats/1"],
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="h-5 w-28 bg-gray-200 rounded animate-pulse mb-3" />
            <div className="h-8 w-20 bg-gray-200 rounded animate-pulse" />
          </Card>
        ))}
      </div>
    );
  }

  // Safe shape with defaults
  const stats = {
    quotesThisMonth: Number(data?.quotesThisMonth ?? 0),
    quotesWonThisMonth: Number(data?.quotesWonThisMonth ?? 0),
    revenueThisMonth: Number(data?.revenueThisMonth ?? 0),
    avgTurnaroundDays: Number(data?.avgTurnaroundDays ?? 0),
  };

  const tiles = [
    { label: "Quotes this month", value: stats.quotesThisMonth.toLocaleString() },
    { label: "Quotes won", value: stats.quotesWonThisMonth.toLocaleString() },
    { label: "Revenue this month", value: `$${stats.revenueThisMonth.toLocaleString()}` },
    { label: "Avg turnaround (days)", value: stats.avgTurnaroundDays.toLocaleString() },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      {tiles.map((t, i) => (
        <Card key={i} className="p-4">
          <CardContent className="p-0">
            <div className="text-sm text-gray-500">{t.label}</div>
            <div className="text-2xl font-semibold">{t.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
