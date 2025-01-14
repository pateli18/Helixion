import * as Sentry from "@sentry/react";
import { PropsWithChildren, useEffect } from "react";

export const ServicesProviderWrapper = ({ children }: PropsWithChildren) => {
  const initSentry = () => {
    const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
    if (sentryDsn) {
      Sentry.init({
        dsn: sentryDsn,
        integrations: [
          Sentry.browserTracingIntegration(),
          Sentry.replayIntegration(),
        ],
        // Performance Monitoring
        tracesSampleRate: 0.1, //  Capture 100% of the transactions
        // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
        tracePropagationTargets: ["api.helixion.ai"],
        replaysSessionSampleRate: 1.0,
      });
    }
  };

  useEffect(() => {
    initSentry();
  }, []);

  return <>{children}</>;
};
