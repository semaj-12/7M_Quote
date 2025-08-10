import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, TrendingUp, TrendingDown } from "lucide-react";

export default function MaterialCostTracker() {
  const { data: materialCosts, isLoading, refetch } = useQuery({
    queryKey: ["/api/material-costs"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-6 bg-gray-200 rounded animate-pulse"></div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded animate-pulse"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const materials = materialCosts || [
    { materialType: "Steel", grade: "A36", pricePerPound: "0.68", priceChange: "2.3" },
    { materialType: "Aluminum", grade: "6061", pricePerPound: "0.92", priceChange: "-1.2" },
    { materialType: "Stainless", grade: "304", pricePerPound: "2.14", priceChange: "0.8" },
  ];

  const getColorForMaterial = (index: number) => {
    const colors = ["bg-primary", "bg-warning", "bg-success"];
    return colors[index % colors.length];
  };

  return (
    <Card>
      <CardHeader className="border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Material Cost Trends</h3>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          {materials.map((material: any, index: number) => {
            const change = parseFloat(material.priceChange || "0");
            const isPositive = change > 0;
            
            return (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 ${getColorForMaterial(index)} rounded-full`}></div>
                  <span className="text-sm font-medium text-gray-700">
                    {material.materialType} ({material.grade})
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-900">
                    ${material.pricePerPound}/lb
                  </div>
                  <div className={`text-xs flex items-center ${isPositive ? 'text-success' : 'text-error'}`}>
                    {isPositive ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                    {Math.abs(change)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            Last updated: {new Date().toLocaleTimeString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
