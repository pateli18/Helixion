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
import { AnalyticsGroup, AnalyticsReport, PhoneCallMetadata } from "@/types";
import { getAnalyticsGroups, getCallHistory } from "@/utils/apiCalls";
import { useAuthInfo } from "@propelauth/react";
import { BarChart, XAxis } from "recharts";
import { memo, useEffect, useState } from "react";
import { Bar } from "recharts";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarkdownCitationDisplay } from "@/components/MarkdownDisplay";

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

const ReportView = (props: {
  reports: AnalyticsReport[];
  callHistory: PhoneCallMetadata[];
}) => {
  const [selectedCall, setSelectedCall] = useState<PhoneCallMetadata | null>(
    null
  );
  return (
    <>
      {props.reports.length > 0 ? (
        <>
          <div className="px-4 pb-4 w-full">
            <MarkdownCitationDisplay
              text={props.reports[0].text}
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
              <Tabs defaultValue="tag">
                <TabsList>
                  <TabsTrigger value="tag">Data</TabsTrigger>
                  <TabsTrigger value="report">Report</TabsTrigger>
                </TabsList>
                <TabsContent value="tag">
                  <TagView
                    callHistory={callHistory}
                    selectedGroup={selectedGroup}
                  />
                </TabsContent>
                <TabsContent value="report">
                  <ReportView
                    callHistory={callHistory}
                    reports={selectedGroup.reports}
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
