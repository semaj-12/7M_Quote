import { useState } from "react";
import TopBar from "@/components/layout/topbar";
import QuoteGenerationModal from "@/components/modals/quote-generation-modal";

export default function NewQuote() {
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(true);
  
  // Mock user ID - in a real app this would come from authentication
  const userId = 1;

  return (
    <>
      <TopBar
        title="New Quote"
        subtitle="Create a new fabrication quote"
      />
      
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Generate New Quote
            </h3>
            <p className="text-gray-500 mb-6">
              Create a detailed quote for your metal fabrication project
            </p>
            <button
              onClick={() => setIsQuoteModalOpen(true)}
              className="bg-primary text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Start New Quote
            </button>
          </div>
        </div>
      </main>

      <QuoteGenerationModal
        isOpen={isQuoteModalOpen}
        onClose={() => setIsQuoteModalOpen(false)}
        userId={userId}
      />
    </>
  );
}
