import { useAuthInfo } from "@propelauth/react";
import * as Sentry from "@sentry/react";
import { PropsWithChildren, useEffect } from "react";

export const ServicesProviderWrapper = ({ children }: PropsWithChildren) => {
  const authInfo = useAuthInfo();

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
        replaysSessionSampleRate: authInfo.user?.email.endsWith(
          "ihsaan@helixion.ai"
        )
          ? 0.0
          : 1.0,
      });
    }
  };

  useEffect(() => {
    if (authInfo.user?.email) {
      initSentry();
    }
  }, [authInfo.user?.email]);

  return <>{children}</>;
};
