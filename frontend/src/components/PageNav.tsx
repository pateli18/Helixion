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
import { ArchiveIcon, BarChartIcon, BookIcon, PhoneIcon } from "lucide-react";
import { useLocation } from "react-router-dom";
import { UserNav } from "./UserNav";
import { useUserContext } from "@/contexts/UserContext";

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

export const PageSidebar = () => {
  const { activeOrg } = useUserContext();
  const { isMobile, state } = useSidebar();

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
                {!isMobile && state !== "collapsed" && activeOrg && (
                  <span className="text-sm text-muted-foreground">
                    {activeOrg.orgName}
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
              <SidebarItem
                icon={<BookIcon />}
                label="Knowledge Bases"
                href="/knowledge-bases"
              />
              <SidebarItem
                icon={<PhoneIcon />}
                label="Phone Numbers"
                href="/phone-numbers"
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
