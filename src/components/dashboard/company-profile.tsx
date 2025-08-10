import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface CompanyProfileProps {
  userId: number;
}

export default function CompanyProfile({ userId }: CompanyProfileProps) {
  const { data: company, isLoading } = useQuery({
    queryKey: [`/api/company/${userId}`],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-6 bg-gray-200 rounded animate-pulse"></div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded animate-pulse"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const defaultCompany = {
    name: "Steel Works LLC",
    location: "Houston, TX",
    laborRate: "65.00",
    overheadRate: "35.00",
    profitMargin: "20.00",
  };

  const profileData = company || defaultCompany;

  return (
    <Card>
      <CardHeader className="border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Company Profile</h3>
          <Link href="/company-setup">
            <Button variant="ghost" size="sm" className="text-primary hover:text-blue-700">
              Edit
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Company Name</label>
            <p className="text-sm text-gray-900">{profileData.name}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Location</label>
            <p className="text-sm text-gray-900">{profileData.location}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Labor Rate</label>
            <p className="text-sm text-gray-900">${profileData.laborRate}/hour</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Overhead Rate</label>
            <p className="text-sm text-gray-900">{profileData.overheadRate}%</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Profit Margin</label>
            <p className="text-sm text-gray-900">{profileData.profitMargin}%</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
