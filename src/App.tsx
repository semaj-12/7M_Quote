import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Auth from "@/pages/auth";
import Onboarding from "@/pages/onboarding";
import Dashboard from "@/pages/dashboard";
import NewQuote from "@/pages/new-quote";
import QuoteHistory from "@/pages/quote-history";
import PdfDrawings from "@/pages/pdf-drawings";
import MaterialCosts from "@/pages/material-costs";
import CompanySetup from "@/pages/company-setup";
import NotFound from "@/pages/not-found";
import Sidebar from "@/components/layout/sidebar";

function AppRouter() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [userInfo, setUserInfo] = useState({
    firstName: "",
    lastName: "",
    email: "",
    companyName: "",
  });

  // Show auth page if not authenticated
  if (!isAuthenticated) {
    return (
      <Auth
        onAuthenticated={(userData) => {
          setIsAuthenticated(true);
          setUserInfo(userData);
        }}
      />
    );
  }

  // Show onboarding if authenticated but hasn't completed setup
  if (!hasCompletedOnboarding) {
    return (
      <Onboarding
        userInfo={userInfo}
        onComplete={() => setHasCompletedOnboarding(true)}
      />
    );
  }

  // Main app layout with sidebar and routes
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        onLogout={() => {
          setIsAuthenticated(false);
          setHasCompletedOnboarding(false);
          setUserInfo({ firstName: "", lastName: "", email: "", companyName: "" });
        }}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/new-quote" element={<NewQuote />} />
          <Route path="/quote-history" element={<QuoteHistory />} />
          <Route path="/pdf-drawings" element={<PdfDrawings />} />
          <Route path="/material-costs" element={<MaterialCosts />} />
          <Route path="/company-setup" element={<CompanySetup />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
