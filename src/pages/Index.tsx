import { useState } from "react";
import { Navigation } from "@/components/Navigation";
import { Dashboard } from "@/components/Dashboard";
import { PaymentCollection } from "@/components/PaymentCollection";
import { PaymentHistory } from "@/components/PaymentHistory";
import { StallManagement } from "@/components/StallManagement";
import { Reports } from "@/components/Reports";

const Index = () => {
  const [currentPage, setCurrentPage] = useState("dashboard");

  const renderCurrentPage = () => {
    switch (currentPage) {
      case "dashboard":
        return <Dashboard onPageChange={setCurrentPage} />;
      case "collect":
        return <PaymentCollection />;
      case "history":
        return <PaymentHistory />;
      case "stalls":
        return <StallManagement />;
      case "reports":
        return <Reports />;
      default:
        return <Dashboard onPageChange={setCurrentPage} />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/10 via-secondary/30 to-background">
      <div className="flex max-w-5xl mx-auto px-4 md:px-6">
        <Navigation currentPage={currentPage} onPageChange={setCurrentPage} />
        <main className="flex-1 md:ml-0 p-4 md:p-6 pb-24">
          {renderCurrentPage()}
        </main>
      </div>
    </div>
  );
};

export default Index;
