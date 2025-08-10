import { useState } from "react";
import TopBar from "@/components/layout/topbar";
import StatsCards from "@/components/dashboard/stats-cards";
import RecentQuotes from "@/components/dashboard/recent-quotes";
import MaterialCostTracker from "@/components/dashboard/material-cost-tracker";
import CompanyProfile from "@/components/dashboard/company-profile";
import RecentDrawings from "@/components/dashboard/recent-drawings";
import PdfUploadModal from "@/components/modals/pdf-upload-modal";
import QuoteGenerationModal from "@/components/modals/quote-generation-modal";


export default function Dashboard() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  
  // Mock user ID - in a real app this would come from authentication
  const userId = 1;

  return (
    <>
      <TopBar
        title="Dashboard"
        subtitle="Welcome back! Here's your fabrication overview"
        onNewQuote={() => setIsQuoteModalOpen(true)}
      />
      
      <main className="flex-1 overflow-y-auto p-6">
        <StatsCards userId={userId} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <RecentQuotes userId={userId} />
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            <MaterialCostTracker />
            <CompanyProfile userId={userId} />
            <RecentDrawings userId={userId} />
          </div>
        </div>
      </main>

      <PdfUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        userId={userId}
      />

      <QuoteGenerationModal
        isOpen={isQuoteModalOpen}
        onClose={() => setIsQuoteModalOpen(false)}
        userId={userId}
      />
    </>
  );
}
