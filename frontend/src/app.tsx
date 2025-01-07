import "./assets/index.css";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { PrimaryPage } from "./pages/Primary/Primary";
import { ServicesProviderWrapper } from "./components/ServicesProviderWrapper";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";

const container = document.getElementById("root");
const root = createRoot(container!);

export const App = () => {
  return (
    <ServicesProviderWrapper>
      <TooltipProvider delayDuration={0}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<PrimaryPage />} />
          </Routes>
          <Toaster richColors />
        </BrowserRouter>
      </TooltipProvider>
    </ServicesProviderWrapper>
  );
};

root.render(<App />);
