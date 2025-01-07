import { PropsWithChildren, useEffect } from "react";

export const ServicesProviderWrapper = ({ children }: PropsWithChildren) => {
  const initSentry = () => {};

  useEffect(() => {
    initSentry();
  }, []);

  return <>{children}</>;
};
