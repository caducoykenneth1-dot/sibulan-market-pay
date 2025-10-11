import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// 👇 Import your Unpaid Dues component
import { UnpaidDues } from "@/components/UnpaidDues";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Main Dashboard */}
          <Route path="/" element={<Index />} />

          {/* 👇 New route for collectors to manage unpaid dues */}
          <Route path="/unpaid-dues" element={<UnpaidDues />} />

          {/* Catch-all route (404 page) */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
