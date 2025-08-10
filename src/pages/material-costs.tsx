import { useQuery } from "@tanstack/react-query";
import TopBar from "@/components/layout/topbar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, TrendingUp, TrendingDown, DollarSign } from "lucide-react";

export default function MaterialCosts() {
  const { data: materialCosts, isLoading, refetch } = useQuery({
    queryKey: ["/api/material-costs"],
  });

  const materials = materialCosts || [
    {
      materialType: "Steel",
      grade: "A36",
      pricePerPound: "0.68",
      priceChange: "2.3",
      lastUpdated: new Date().toISOString(),
    },
    {
      materialType: "Steel",
      grade: "A572 Grade 50",
      pricePerPound: "0.72",
      priceChange: "1.8",
      lastUpdated: new Date().toISOString(),
    },
    {
      materialType: "Aluminum",
      grade: "6061",
      pricePerPound: "0.92",
      priceChange: "-1.2",
      lastUpdated: new Date().toISOString(),
    },
    {
      materialType: "Aluminum",
      grade: "5052",
      pricePerPound: "0.89",
      priceChange: "-0.8",
      lastUpdated: new Date().toISOString(),
    },
    {
      materialType: "Stainless Steel",
      grade: "304",
      pricePerPound: "2.14",
      priceChange: "0.8",
      lastUpdated: new Date().toISOString(),
    },
    {
      materialType: "Stainless Steel",
      grade: "316",
      pricePerPound: "2.45",
      priceChange: "1.2",
      lastUpdated: new Date().toISOString(),
    },
  ];

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <>
      <TopBar
        title="Material Costs"
        subtitle="Real-time material pricing and market trends"
      />
      
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mb-6 flex justify-between items-center">
          <p className="text-gray-600">
            Track current material prices and market trends for accurate quoting.
          </p>
          <Button
            onClick={() => refetch()}
            variant="outline"
            className="flex items-center"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Prices
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {materials.map((material: any, index: number) => {
            const change = parseFloat(material.priceChange || "0");
            const isPositive = change > 0;
            
            return (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                        <DollarSign className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{material.materialType}</h3>
                        <p className="text-sm text-gray-500">{material.grade}</p>
                      </div>
                    </div>
                    <div className={`flex items-center text-sm ${isPositive ? 'text-success' : 'text-error'}`}>
                      {isPositive ? <TrendingUp className="h-4 w-4 mr-1" /> : <TrendingDown className="h-4 w-4 mr-1" />}
                      {Math.abs(change)}%
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-gray-900 mb-2">
                    ${material.pricePerPound}/lb
                  </div>
                  <div className="text-xs text-gray-500">
                    Last updated: {formatDate(material.lastUpdated)}
                  </div>
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-600 mb-1">Market Trend</div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {isPositive ? "Increasing" : "Decreasing"}
                      </span>
                      <span className={`text-sm font-bold ${isPositive ? 'text-success' : 'text-error'}`}>
                        {isPositive ? "+" : ""}{change}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {isLoading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-gray-500">Loading material costs...</p>
          </div>
        )}

        <Card className="mt-8">
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900">Price Alerts</h3>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-gray-500">
              <p>Set up price alerts to get notified when material costs change significantly.</p>
              <Button className="mt-4" variant="outline">
                Configure Alerts
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
