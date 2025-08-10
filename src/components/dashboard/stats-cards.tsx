import { useQuery } from "@tanstack/react-query";
import { FileText, DollarSign, Trophy, Clock, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatsCardsProps {
  userId: number;
}

export default function StatsCards({ userId }: StatsCardsProps) {
  const { data: stats, isLoading } = useQuery({
    queryKey: [`/api/dashboard/stats/${userId}`],
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-20 bg-gray-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const statsData = stats || {
    monthlyQuotes: 47,
    quoteValue: 284500,
    winRate: 68,
    avgTime: 3.2,
    monthlyQuotesChange: 12,
    quoteValueChange: 8,
    winRateChange: -2,
    avgTimeChange: -45,
  };

  const statsConfig = [
    {
      title: "This Month Quotes",
      value: statsData.monthlyQuotes,
      change: statsData.monthlyQuotesChange,
      icon: FileText,
      color: "blue",
      suffix: "",
    },
    {
      title: "Quote Value",
      value: `$${statsData.quoteValue.toLocaleString()}`,
      change: statsData.quoteValueChange,
      icon: DollarSign,
      color: "green",
      suffix: "",
    },
    {
      title: "Win Rate",
      value: `${statsData.winRate}%`,
      change: statsData.winRateChange,
      icon: Trophy,
      color: "orange",
      suffix: "",
    },
    {
      title: "Avg. Quote Time",
      value: `${statsData.avgTime}h`,
      change: statsData.avgTimeChange,
      icon: Clock,
      color: "purple",
      suffix: "min faster",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {statsConfig.map((stat, index) => {
        const Icon = stat.icon;
        const isPositive = stat.change > 0;
        const isNegative = stat.change < 0;
        
        return (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                  <p className={`text-sm ${isPositive ? 'text-success' : isNegative ? 'text-warning' : 'text-gray-500'}`}>
                    {isPositive && <TrendingUp className="inline mr-1 h-3 w-3" />}
                    {isNegative && <TrendingDown className="inline mr-1 h-3 w-3" />}
                    {!isPositive && !isNegative && <Minus className="inline mr-1 h-3 w-3" />}
                    {Math.abs(stat.change)}{stat.suffix || (index === 3 ? "min faster" : "% from last month")}
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  stat.color === 'blue' ? 'bg-blue-100' :
                  stat.color === 'green' ? 'bg-green-100' :
                  stat.color === 'orange' ? 'bg-orange-100' :
                  'bg-purple-100'
                }`}>
                  <Icon className={`text-xl ${
                    stat.color === 'blue' ? 'text-primary' :
                    stat.color === 'green' ? 'text-success' :
                    stat.color === 'orange' ? 'text-warning' :
                    'text-purple-600'
                  }`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
