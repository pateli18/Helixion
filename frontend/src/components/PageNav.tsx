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
import { ArchiveIcon } from "lucide-react";
import { useLocation } from "react-router-dom";
import { UserNav } from "./UserNav";

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
  const { isMobile, state } = useSidebar();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Logo" className="h-auto w-10" />
              {!isMobile && state !== "collapsed" && (
                <span className="text-lg font-semibold">Helixion</span>
              )}
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Pages</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarItem
                icon={<PersonIcon />}
                label="Agent Tester"
                href="/"
              />
              <SidebarItem
                icon={<ArchiveIcon />}
                label="Call History"
                href="/call-history"
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
