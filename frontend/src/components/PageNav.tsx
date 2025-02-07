import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenu,
  SidebarRail,
  SidebarGroupLabel,
  SidebarGroupContent,
  useSidebar,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { PersonIcon } from "@radix-ui/react-icons";
import { ArchiveIcon, BarChartIcon } from "lucide-react";
import { useLocation } from "react-router-dom";
import { UserNav } from "./UserNav";
import { useAuthInfo } from "@propelauth/react";
import { UseAuthInfoProps } from "@propelauth/react/dist/types/hooks/useAuthInfo";

const SidebarItem = (props: {
  icon: React.ReactNode;
  label: string;
  href: string;
}) => {
  const { pathname } = useLocation();
  return (
    <SidebarMenuItem key={props.label}>
      <SidebarMenuButton asChild tooltip={props.label}>
        <a
          href={props.href}
          className={cn(
            "flex items-center gap-2",
            pathname === props.href && "bg-primary text-primary-foreground"
          )}
        >
          {props.icon}
          <span>{props.label}</span>
        </a>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

const getOrganizationName = (authInfo: UseAuthInfoProps) => {
  const orgs = authInfo.orgHelper?.getOrgs();
  if (orgs?.length === 1) {
    return orgs[0].orgName;
  }
  return undefined;
};

export const PageSidebar = () => {
  const authInfo = useAuthInfo();
  const { isMobile, state } = useSidebar();

  const organizationName = getOrganizationName(authInfo);
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Logo" className="h-auto w-10" />
              <div className="flex flex-col">
                {!isMobile && state !== "collapsed" && (
                  <span className="text-lg font-semibold">Helixion</span>
                )}
                {!isMobile && state !== "collapsed" && organizationName && (
                  <span className="text-sm text-muted-foreground">
                    {organizationName}
                  </span>
                )}
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Pages</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarItem icon={<PersonIcon />} label="Agents" href="/" />
              <SidebarItem
                icon={<ArchiveIcon />}
                label="Call History"
                href="/call-history"
              />
              <SidebarItem
                icon={<BarChartIcon />}
                label="Call Analytics"
                href="/call-analytics"
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserNav />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};
