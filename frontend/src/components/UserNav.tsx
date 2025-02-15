import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useAuthInfo,
  useHostedPageUrls,
  useLogoutFunction,
} from "@propelauth/react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ChevronsUpDown } from "lucide-react";
import { useUserContext } from "@/contexts/UserContext";
import { cn } from "@/lib/utils";

const OrganizationSwitcher = () => {
  const { orgs, activeOrgId, setActiveOrgId } = useUserContext();

  return (
    <>
      {orgs.length > 1 && (
        <>
          <DropdownMenuLabel className="text-muted-foreground font-normal">
            Switch Organization
          </DropdownMenuLabel>
          {orgs
            .sort((a, b) => a.orgName.localeCompare(b.orgName))
            .map((org) => (
              <DropdownMenuItem
                key={org.orgId}
                onClick={() => {
                  setActiveOrgId(org.orgId);
                  window.location.reload();
                }}
                className={cn(
                  activeOrgId === org.orgId &&
                    "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
              >
                {org.orgName}
              </DropdownMenuItem>
            ))}
          <DropdownMenuSeparator />
        </>
      )}
    </>
  );
};

export const UserNav = () => {
  const authInfo = useAuthInfo();
  const logoutFn = useLogoutFunction();
  const { getAccountPageUrl } = useHostedPageUrls();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={authInfo.user?.pictureUrl} />
                <AvatarFallback>
                  {authInfo.user?.email?.slice(0, 1).toLocaleUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {authInfo.user?.email}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <OrganizationSwitcher />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => window.open(getAccountPageUrl(), "_blank")}
              >
                Settings
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logoutFn(true)}>
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
