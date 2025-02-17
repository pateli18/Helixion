import "./assets/index.css";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { RequiredAuthProvider, RedirectToLogin } from "@propelauth/react";
import { AgentTestPage } from "./pages/AgentTest/AgentTest";
import { ServicesProviderWrapper } from "./components/ServicesProviderWrapper";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { CallHistoryPage } from "./pages/CallHistory/CallHistory";
import { CallAnalyticsPage } from "./pages/CallAnalytics/CallAnalytics";
import { UserProvider } from "./contexts/UserContext";
import { KnowledgeBasePage } from "./pages/KnowledgeBase/KnowledgeBase";
import { PhoneNumbersPage } from "./pages/PhoneNumbers/PhoneNumbers";
const container = document.getElementById("root");
const root = createRoot(container!);

export const App = () => {
  return (
    <ServicesProviderWrapper>
      <TooltipProvider delayDuration={0}>
        <BrowserRouter>
          <UserProvider>
            <Routes>
              <Route path="/" element={<AgentTestPage />} />
              <Route path="/call-history" element={<CallHistoryPage />} />
              <Route path="/call-analytics" element={<CallAnalyticsPage />} />
              <Route path="/knowledge-bases" element={<KnowledgeBasePage />} />
              <Route path="/phone-numbers" element={<PhoneNumbersPage />} />
            </Routes>
          </UserProvider>
          <Toaster richColors />
        </BrowserRouter>
      </TooltipProvider>
    </ServicesProviderWrapper>
  );
};

const authUrl = import.meta.env.VITE_AUTH_URL;

root.render(
  <RequiredAuthProvider
    authUrl={authUrl}
    displayIfLoggedOut={
      <RedirectToLogin postLoginRedirectUrl={window.location.href} />
    }
  >
    <App />
  </RequiredAuthProvider>
);
