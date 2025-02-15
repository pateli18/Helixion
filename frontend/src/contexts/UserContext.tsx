import { useAuthInfo, OrgMemberInfoClass } from "@propelauth/react";
import { createContext, useContext, useEffect, useState } from "react";
import * as Sentry from "@sentry/react";

interface UserContextProps {
  activeOrgId: string | null;
  setActiveOrgId: (orgId: string) => void;
  activeOrg: OrgMemberInfoClass | null;
  orgs: OrgMemberInfoClass[];
  setOrgs: React.Dispatch<React.SetStateAction<OrgMemberInfoClass[]>>;
  getAccessToken: () => Promise<string | null>;
}

export const UserContext = createContext<UserContextProps>({
  activeOrgId: null,
  setActiveOrgId: () => {},
  orgs: [],
  setOrgs: () => {},
  getAccessToken: () => Promise.resolve(null),
  activeOrg: null,
});

export const UserProvider = (props: { children: React.ReactNode }) => {
  const { children } = props;
  const authInfo = useAuthInfo();
  const [activeOrgId, _setActiveOrgId] = useState<string | null>(
    localStorage.getItem("helixion-active-org") || null
  );
  const [orgs, setOrgs] = useState<OrgMemberInfoClass[]>([]);
  const activeOrg = orgs.find((org) => org.orgId === activeOrgId) ?? null;

  const getAccessToken = async () => {
    const accessToken = await authInfo.tokens.getAccessTokenForOrg(
      activeOrgId ?? authInfo?.userClass?.getOrgs()[0].orgId ?? ""
    );
    return accessToken.accessToken;
  };

  const setActiveOrgId = (orgId: string) => {
    _setActiveOrgId(orgId);
    localStorage.setItem("helixion-active-org", orgId);
  };

  useEffect(() => {
    if (authInfo.isLoggedIn) {
      const orgs = authInfo?.userClass.getOrgs();
      setOrgs(orgs);
      if (activeOrgId === null && orgs.length > 0) {
        setActiveOrgId(orgs[0].orgId);
      }

      if (import.meta.env.VITE_ENV === "prod") {
        Sentry.setUser({
          email: authInfo.user!.email,
          id: authInfo.user!.userId,
        });
      }
    }
  }, [authInfo.isLoggedIn]);

  return (
    <UserContext.Provider
      value={{
        activeOrgId,
        setActiveOrgId,
        activeOrg,
        orgs,
        setOrgs,
        getAccessToken,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUserContext = () => {
  return useContext(UserContext);
};
