import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { PageSidebar } from "@/components/PageNav";

export const Layout = (props: { children: React.ReactNode; title: string }) => {
  return (
    <SidebarProvider>
      <PageSidebar />
      <div className="px-2 pt-2 space-y-8 w-[100%]">
        <div className="flex items-center space-x-2">
          <SidebarTrigger />
          <div className="text-lg font-semibold">{props.title}</div>
        </div>
        {props.children}
      </div>
    </SidebarProvider>
  );
};
