import { CallDisplay } from "@/components/CallDisplay";
import { Layout } from "@/components/Layout";
import { LoadingView } from "@/components/Loader";
import { CallHistoryTable } from "@/components/table/CallTable";
import { SelectFilter } from "@/components/table/SelectFilter";
import { Badge } from "@/components/ui/badge";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Agent,
  AnalyticsGroup,
  AnalyticsReport,
  PhoneCallMetadata,
} from "@/types";
import {
  getAgents,
  getAnalyticsGroups,
  getCallHistory,
  updateInstructionsFromReport,
} from "@/utils/apiCalls";
import { useAuthInfo } from "@propelauth/react";
import { BarChart, XAxis } from "recharts";
import { memo, useEffect, useState } from "react";
import { Bar } from "recharts";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarkdownCitationDisplay } from "@/components/MarkdownDisplay";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ReloadIcon } from "@radix-ui/react-icons";

const MAX_BARS = 30;

const CallHistoryTableWithGroupFilter = memo(
  (props: {
    callHistory: (PhoneCallMetadata & { tags: string[] })[];
    setSelectedCall: (call: PhoneCallMetadata) => void;
    analyticsGroup: AnalyticsGroup;
    tagCounts: Record<string, number>;
  }) => {
    const [tagFilter, setTagFilter] = useState<string[]>([]);

    const filteredCallHistory = props.callHistory.filter((call) => {
      return (
        call.tags.some((tag) => tagFilter.includes(tag)) ||
        tagFilter.length === 0
      );
    });

    const additionalColumns = [
      {
        accessorKey: "tags",
        header: "Tags",
        cell: ({ row }: any) => {
          return (
            <div className="flex flex-wrap gap-2">
              {row.original.tags.map((tag: string) => (
                <Badge
                  variant="secondary"
                  className="border-solid border-2 border-black"
                  key={tag}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          );
        },
      },
    ];

    return (
      <>
        <div className="flex items-center justify-between">
          <div className="text-md text-muted-foreground">
            {filteredCallHistory.length} calls
          </div>
          <div className="flex items-center space-x-2">
            <SelectFilter
              title={`Filter by ${props.analyticsGroup.name}`}
              filterCounts={props.tagCounts}
              activeFilter={tagFilter}
              setActiveFilter={setTagFilter}
            />
          </div>
        </div>
        <CallHistoryTable
          data={filteredCallHistory}
          setSelectedCall={props.setSelectedCall}
          additionalColumns={additionalColumns}
        />
      </>
    );
  }
);

const CallRecordDisplay = (props: {
  callHistory: (PhoneCallMetadata & { tags: string[] })[];
  selectedGroup: AnalyticsGroup;
  tagCounts: Record<string, number>;
}) => {
  const [selectedCall, setSelectedCall] = useState<PhoneCallMetadata | null>(
    null
  );
  return (
    <>
      <CallHistoryTableWithGroupFilter
        callHistory={props.callHistory}
        setSelectedCall={setSelectedCall}
        analyticsGroup={props.selectedGroup}
        tagCounts={props.tagCounts}
      />
      <CallDisplay call={selectedCall} setCall={setSelectedCall} />
    </>
  );
};

const GroupSelection = (props: {
  analyticsGroups: AnalyticsGroup[];
  selectedGroup: AnalyticsGroup | null;
  setSelectedGroup: (group: AnalyticsGroup) => void;
}) => {
  return (
    <Select
      value={props.selectedGroup?.id}
      onValueChange={(value) => {
        const group = props.analyticsGroups.find((group) => group.id === value);
        if (group) {
          props.setSelectedGroup(group);
        }
      }}
    >
      <SelectTrigger
        disabled={props.analyticsGroups.length === 0}
        className="truncate text-ellipsis max-w-[600px]"
      >
        <SelectValue placeholder="Select Analytics Group" />
      </SelectTrigger>
      <SelectContent>
        <div className="overflow-y-scroll max-h-[200px]">
          {props.analyticsGroups.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              {group.name}
            </SelectItem>
          ))}
        </div>
      </SelectContent>
    </Select>
  );
};

const chartConfig = {
  tag: {
    label: "Tag",
    color: "#193E32",
  },
} satisfies ChartConfig;

const TagView = (props: {
  callHistory: PhoneCallMetadata[];
  selectedGroup: AnalyticsGroup;
}) => {
  const callHistoryWithTags = props.callHistory.map((call) => ({
    ...call,
    tags:
      props.selectedGroup?.tags
        .filter((tag) => tag.phone_call_id === call.id)
        .map((tag) => tag.tag) || [],
  }));

  const tagCounts = props.selectedGroup?.tags.reduce(
    (acc, tag) => {
      acc[tag.tag] = (acc[tag.tag] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const chartData = tagCounts
    ? Object.entries(tagCounts)
        .map(([tag, count]) => ({
          tag,
          count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, MAX_BARS)
    : [];

  return (
    <div className="space-y-2">
      <ChartContainer
        config={chartConfig}
        className="max-h-[300px] min-h-[300px] w-full"
      >
        <BarChart
          accessibilityLayer
          data={chartData}
          margin={{ bottom: 120, left: 20, right: 20 }}
        >
          <Bar dataKey="count" radius={4} fill="var(--color-tag)" />
          <XAxis
            dataKey="tag"
            angle={270}
            textAnchor="end"
            height={20}
            tick={{
              width: 50,
            }}
            tickFormatter={(value) => {
              // first word
              let firstWord = value.split(" ")[0];
              if (firstWord.length > 8) {
                firstWord = firstWord.slice(0, 8);
              }
              return firstWord + "...";
            }}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
        </BarChart>
      </ChartContainer>
      <CallRecordDisplay
        callHistory={callHistoryWithTags}
        selectedGroup={props.selectedGroup}
        tagCounts={tagCounts ?? {}}
      />
    </div>
  );
};

const UpdateAgentInstructionsDialog = (props: {
  selectedReport: AnalyticsReport;
}) => {
  const authInfo = useAuthInfo();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const fetchAgents = async () => {
      const agentsResponse = await getAgents(authInfo.accessToken ?? null);
      if (agentsResponse !== null) {
        setAgents(agentsResponse.filter((agent) => agent.active === true));
      } else {
        toast.error("Failed to fetch agents");
      }
    };
    fetchAgents();
  }, []);

  const updateInstructions = async () => {
    if (selectedAgent) {
      setIsUpdating(true);
      const response = await updateInstructionsFromReport(
        selectedAgent.id,
        props.selectedReport.id,
        authInfo.accessToken ?? null
      );
      setIsUpdating(false);
      if (response !== null) {
        toast.success("Agent instructions updated");
        navigate(
          `/?baseId=${response.base_id}&versionId=${response.version_id}`
        );
      } else {
        toast.error("Failed to update agent instructions");
      }
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Update Agent</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Agent Instructions</DialogTitle>
          <DialogDescription>
            Use the report findings to improve the agent's instructions.
          </DialogDescription>
        </DialogHeader>
        <Select
          value={selectedAgent?.id}
          onValueChange={(value) => {
            const agent = agents.find((agent) => agent.id === value);
            setSelectedAgent(agent ?? null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select Agent" />
          </SelectTrigger>
          <SelectContent>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button
            disabled={selectedAgent === null || isUpdating}
            onClick={updateInstructions}
          >
            Update Agent{" "}
            {isUpdating && <ReloadIcon className="w-4 h-4 ml-2 animate-spin" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ReportSelection = (props: {
  reports: AnalyticsReport[];
  selectedReport: AnalyticsReport | null;
  setSelectedReport: (report: AnalyticsReport) => void;
}) => {
  return (
    <Select
      value={props.selectedReport?.id}
      onValueChange={(value) => {
        const report = props.reports.find((report) => report.id === value);
        if (report) {
          props.setSelectedReport(report);
        }
      }}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select Report" />
      </SelectTrigger>
      <SelectContent>
        {props.reports.map((report) => (
          <SelectItem key={report.id} value={report.id}>
            {report.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const ReportView = (props: {
  selectedReport: AnalyticsReport | null;
  callHistory: PhoneCallMetadata[];
}) => {
  const [selectedCall, setSelectedCall] = useState<PhoneCallMetadata | null>(
    null
  );

  return (
    <>
      {props.selectedReport ? (
        <>
          <div className="px-1 pb-4 space-y-4">
            <MarkdownCitationDisplay
              text={props.selectedReport.text}
              phoneMetadata={props.callHistory}
              onCitationClick={(citationId) => {
                const call = props.callHistory.find(
                  (call) => call.id === citationId
                );
                if (call) {
                  setSelectedCall(call);
                }
              }}
            />
          </div>
          <CallDisplay call={selectedCall} setCall={setSelectedCall} />
        </>
      ) : (
        <div className="px-4 pb-4 w-full text-center text-muted-foreground">
          <p>No reports found</p>
        </div>
      )}
    </>
  );
};

export const CallAnalyticsPage = () => {
  const authInfo = useAuthInfo();

  const [isLoading, setIsLoading] = useState(true);
  const [analyticsGroups, setAnalyticsGroups] = useState<AnalyticsGroup[]>([]);
  const [callHistory, setCallHistory] = useState<PhoneCallMetadata[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<AnalyticsGroup | null>(
    null
  );
  const [selectedReport, setSelectedReport] = useState<AnalyticsReport | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<"tag" | "report">("tag");

  useEffect(() => {
    if (selectedGroup?.reports && selectedGroup.reports.length > 0) {
      setSelectedReport(selectedGroup.reports[0]);
    } else {
      setSelectedReport(null);
    }
  }, [selectedGroup]);

  const fetchData = async () => {
    const [analyticsGroupsResponse, callHistoryResponse] = await Promise.all([
      getAnalyticsGroups(authInfo.accessToken ?? null),
      getCallHistory(authInfo.accessToken ?? null),
    ]);

    if (analyticsGroupsResponse === null) {
      toast.error("Failed to fetch analytics groups");
    } else {
      setAnalyticsGroups(analyticsGroupsResponse);
      if (analyticsGroupsResponse.length > 0) {
        setSelectedGroup(analyticsGroupsResponse[0]);
      }
    }

    if (callHistoryResponse === null) {
      toast.error("Failed to fetch call history");
    } else {
      setCallHistory(callHistoryResponse);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <Layout title="Call Analytics">
      <>
        {isLoading ? (
          <LoadingView text="Loading call analytics..." />
        ) : (
          <>
            <GroupSelection
              analyticsGroups={analyticsGroups}
              selectedGroup={selectedGroup}
              setSelectedGroup={setSelectedGroup}
            />
            {selectedGroup && (
              <Tabs
                value={activeTab}
                onValueChange={(value) =>
                  setActiveTab(value as "tag" | "report")
                }
              >
                <div className="flex items-center space-x-2 max-w-[600px]">
                  <TabsList>
                    <TabsTrigger value="tag">Data</TabsTrigger>
                    <TabsTrigger value="report">Reports</TabsTrigger>
                  </TabsList>
                  {activeTab === "report" &&
                    selectedGroup.reports &&
                    selectedGroup.reports.length > 0 && (
                      <ReportSelection
                        reports={selectedGroup.reports}
                        selectedReport={selectedReport}
                        setSelectedReport={setSelectedReport}
                      />
                    )}
                  {activeTab === "report" && selectedReport !== null && (
                    <UpdateAgentInstructionsDialog
                      selectedReport={selectedReport}
                    />
                  )}
                </div>
                <TabsContent value="tag">
                  <TagView
                    callHistory={callHistory}
                    selectedGroup={selectedGroup}
                  />
                </TabsContent>
                <TabsContent value="report">
                  <ReportView
                    callHistory={callHistory}
                    selectedReport={selectedReport}
                  />
                </TabsContent>
              </Tabs>
            )}
          </>
        )}
      </>
    </Layout>
  );
};
