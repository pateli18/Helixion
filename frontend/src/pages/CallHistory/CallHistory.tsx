import { memo, useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { CallDisplay } from "@/components/CallDisplay";
import { PhoneCallMetadata } from "@/types";
import { useAuthInfo } from "@propelauth/react";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { getCallHistory } from "@/utils/apiCalls";
import { LoadingView } from "@/components/Loader";
import { SelectFilter } from "@/components/table/SelectFilter";
import { SearchFilter } from "@/components/table/SelectFilter";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CallHistoryTable } from "@/components/table/CallTable";

const CallHistoryTableWithFilters = memo(
  (props: { setSelectedCall: (call: PhoneCallMetadata) => void }) => {
    const authInfo = useAuthInfo();
    const isMobile = useIsMobile();
    const [searchTerm, setSearchTerm] = useState("");
    const [audioAvailableOnly, setAudioAvailableOnly] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string[]>([]);
    const [agentFilter, setAgentFilter] = useState<string[]>([]);
    const [toPhoneNumberFilter, setToPhoneNumberFilter] = useState<string[]>(
      []
    );
    const [isLoading, setIsLoading] = useState(true);
    const [callHistory, setCallHistory] = useState<PhoneCallMetadata[]>([]);

    useEffect(() => {
      setIsLoading(true);
      getCallHistory(authInfo.accessToken ?? null).then((callHistory) => {
        if (callHistory === null) {
          toast.error("Failed to fetch call history");
        } else {
          setCallHistory(callHistory);
        }
        setIsLoading(false);
      });
    }, []);

    const filteredSearchData = callHistory.filter((call) => {
      return (
        JSON.stringify(call.input_data).includes(searchTerm.trim()) ||
        !searchTerm.trim()
      );
    });

    const statusCounts = filteredSearchData.reduce(
      (acc, call) => {
        acc[call.status] = (acc[call.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const filteredStatusData = filteredSearchData.filter((call) => {
      return statusFilter.includes(call.status) || statusFilter.length === 0;
    });

    const agentCounts = filteredStatusData.reduce(
      (acc, call) => {
        acc[call.agent_metadata?.name || "none"] =
          (acc[call.agent_metadata?.name || "none"] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const filteredAgentData = filteredStatusData.filter((call) => {
      return (
        agentFilter.includes(call.agent_metadata?.name || "none") ||
        agentFilter.length === 0
      );
    });

    const toPhoneNumberCounts = filteredAgentData.reduce(
      (acc, call) => {
        acc[call.to_phone_number] = (acc[call.to_phone_number] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const filteredToPhoneNumberData = filteredAgentData.filter((call) => {
      return (
        toPhoneNumberFilter.includes(call.to_phone_number) ||
        toPhoneNumberFilter.length === 0
      );
    });

    const filteredAudioAvailableOnlyData = filteredToPhoneNumberData.filter(
      (call) => {
        return call.recording_available || !audioAvailableOnly;
      }
    );

    return (
      <>
        {isLoading ? (
          <LoadingView text="Loading call history..." />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="text-md text-muted-foreground">
                {filteredAudioAvailableOnlyData.length} calls
              </div>
              <div className="flex items-center space-x-2">
                {!isMobile && (
                  <>
                    <SearchFilter
                      searchTerm={searchTerm}
                      setSearchTerm={setSearchTerm}
                      placeholder="Search Input Data..."
                      className={cn("w-[200px]")}
                    />
                    <SelectFilter
                      title="Status"
                      filterCounts={statusCounts}
                      activeFilter={statusFilter}
                      setActiveFilter={setStatusFilter}
                    />
                    <SelectFilter
                      title="Agent"
                      filterCounts={agentCounts}
                      activeFilter={agentFilter}
                      setActiveFilter={setAgentFilter}
                    />
                    <SelectFilter
                      title="To Phone Number"
                      filterCounts={toPhoneNumberCounts}
                      activeFilter={toPhoneNumberFilter}
                      setActiveFilter={setToPhoneNumberFilter}
                    />
                  </>
                )}
                <Label htmlFor="audio-available-only">Audio Available</Label>
                <Switch
                  id="audio-available-only"
                  checked={audioAvailableOnly}
                  onCheckedChange={(checked) => {
                    setAudioAvailableOnly(checked);
                  }}
                />
              </div>
            </div>
            <CallHistoryTable
              data={filteredAudioAvailableOnlyData}
              setSelectedCall={props.setSelectedCall}
            />
          </>
        )}
      </>
    );
  }
);

export const CallHistoryPage = () => {
  const [selectedCall, setSelectedCall] = useState<PhoneCallMetadata | null>(
    null
  );
  return (
    <Layout title="Call History">
      <CallHistoryTableWithFilters setSelectedCall={setSelectedCall} />
      <CallDisplay call={selectedCall} setCall={setSelectedCall} />
    </Layout>
  );
};
