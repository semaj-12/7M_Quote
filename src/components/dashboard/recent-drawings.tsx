import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileType, Link as WouterLink } from "wouter";
import { File } from "lucide-react";

interface RecentDrawingsProps {
  userId: number;
}

export default function RecentDrawings({ userId }: RecentDrawingsProps) {
  const { data: drawings, isLoading } = useQuery({
    queryKey: [`/api/drawings/${userId}`],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-6 bg-gray-200 rounded animate-pulse"></div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded animate-pulse"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "processed":
        return "bg-green-100 text-green-800";
      case "processing":
        return "bg-blue-100 text-blue-800";
      case "error":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
    
    if (diffHours < 24) return `${diffHours} hours ago`;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return `${diffDays} days ago`;
  };

  const recentDrawings = drawings?.slice(0, 2) || [];

  return (
    <Card>
      <CardHeader className="border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Recent Drawings</h3>
          <WouterLink href="/pdf-drawings">
            <Button variant="ghost" size="sm" className="text-primary hover:text-blue-700">
              View All
            </Button>
          </WouterLink>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-3">
          {recentDrawings.map((drawing: any) => (
            <div
              key={drawing.id}
              className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <File className="text-red-600 h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{drawing.name}</p>
                <p className="text-xs text-gray-500">
                  Uploaded {formatTimeAgo(drawing.uploadedAt)}
                </p>
              </div>
              <div className="flex-shrink-0">
                <Badge className={getStatusColor(drawing.status)}>
                  {drawing.status.charAt(0).toUpperCase() + drawing.status.slice(1)}
                </Badge>
              </div>
            </div>
          ))}
          {recentDrawings.length === 0 && (
            <div className="text-center py-4">
              <p className="text-gray-500 text-sm">No drawings uploaded yet</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
