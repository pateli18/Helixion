import "./assets/index.css";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { RequiredAuthProvider, RedirectToLogin } from "@propelauth/react";
import { AgentTestPage } from "./pages/AgentTest/AgentTest";
import { ServicesProviderWrapper } from "./components/ServicesProviderWrapper";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { CallHistoryPage } from "./pages/CallHistory/CallHistory";

const container = document.getElementById("root");
const root = createRoot(container!);

export const App = () => {
  return (
    <ServicesProviderWrapper>
      <TooltipProvider delayDuration={0}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<AgentTestPage />} />
            <Route path="/call-history" element={<CallHistoryPage />} />
          </Routes>
          <Toaster richColors />
        </BrowserRouter>
      </TooltipProvider>
    </ServicesProviderWrapper>
  );
};

const authUrl = import.meta.env.VITE_AUTH_URL;
console.log(authUrl);

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
