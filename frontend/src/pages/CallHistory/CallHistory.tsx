import { DataTable } from "@/components/Table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import { forwardRef, useEffect, useState } from "react";
import { toast } from "sonner";
import { PhoneCallMetadata, PhoneCallStatus } from "@/types";
import { Badge } from "@/components/ui/badge";
import { getCallHistory } from "@/utils/apiCalls";
import { LoadingView } from "@/components/Loader";
import { Layout } from "@/components/Layout";
import { formatDuration, loadAndFormatDate } from "@/utils/dateFormat";
import { CallDisplay } from "@/components/CallDisplay";

const ClickToCopy = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    text: string;
  }
>(({ className, text }) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <div
      className={cn("cursor-pointer hover:text-primary", className)}
      onClick={handleCopy}
    >
      {text}
    </div>
  );
});

const StatusBadge = (props: { status: PhoneCallStatus }) => {
  let badgeColor;
  switch (props.status) {
    case "queued":
      badgeColor = "bg-gray-500 hover:bg-gray-500";
      break;
    case "ringing":
      badgeColor = "bg-blue-500 hover:bg-blue-500";
      break;
    case "in-progress":
      badgeColor = "bg-yellow-500 hover:bg-yellow-500";
      break;
    case "completed":
      badgeColor = "bg-green-500 hover:bg-green-500";
      break;
    case "busy":
      badgeColor = "bg-orange-500 hover:bg-orange-500";
      break;
    case "failed":
      badgeColor = "bg-red-500 hover:bg-red-500";
      break;
    case "no-answer":
      badgeColor = "bg-purple-500 hover:bg-purple-500";
      break;
  }

  return (
    <Badge className={cn(badgeColor, "text-white cursor-default")}>
      {props.status}
    </Badge>
  );
};

export const CallHistoryPage = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [callHistory, setCallHistory] = useState<PhoneCallMetadata[]>([]);
  const [selectedCall, setSelectedCall] = useState<PhoneCallMetadata | null>(
    null
  );

  useEffect(() => {
    setIsLoading(true);
    getCallHistory().then((callHistory) => {
      if (callHistory === null) {
        toast.error("Failed to fetch call history");
      } else {
        setCallHistory(callHistory);
      }
      setIsLoading(false);
    });
  }, []);

  const columns: ColumnDef<PhoneCallMetadata>[] = [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }: any) => {
        return (
          <Tooltip>
            <TooltipTrigger>
              <ClickToCopy
                text={row.original.id}
                className="max-w-[100px] text-ellipsis overflow-hidden whitespace-nowrap"
              />
            </TooltipTrigger>
            <TooltipContent>{row.original.id}</TooltipContent>
          </Tooltip>
        );
      },
    },
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ row }: any) => {
        return <div>{loadAndFormatDate(row.original.created_at)}</div>;
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }: any) => {
        return <StatusBadge status={row.original.status} />;
      },
    },
    {
      accessorKey: "from_phone_number",
      header: "From",
      cell: ({ row }: any) => {
        const fromPhoneNumber = row.original.from_phone_number;
        return (
          <Tooltip>
            <TooltipTrigger>
              <ClickToCopy
                text={fromPhoneNumber}
                className="lowercase max-w-[100px] text-ellipsis overflow-hidden whitespace-nowrap"
              />
            </TooltipTrigger>
            <TooltipContent>{fromPhoneNumber}</TooltipContent>
          </Tooltip>
        );
      },
    },
    {
      accessorKey: "to_phone_number",
      header: "To",
      cell: ({ row }: any) => (
        <Tooltip>
          <TooltipTrigger>
            <ClickToCopy
              text={row.original.to_phone_number}
              className="lowercase max-w-[100px] text-ellipsis overflow-hidden whitespace-nowrap"
            />
          </TooltipTrigger>
          <TooltipContent>{row.original.to_phone_number}</TooltipContent>
        </Tooltip>
      ),
    },
    {
      accessorKey: "input-data",
      header: "Input Data",
      cell: ({ row }: any) => {
        // get first key / value pair
        const inputData: Record<string, string> = row.original.input_data;
        const firstKey = Object.keys(inputData)[0];
        const firstValue = inputData[firstKey];
        return (
          <Tooltip>
            <TooltipTrigger>
              <div className="max-w-[100px] truncate text-ellipsis">
                <span className="font-bold">{firstKey}:</span> {firstValue}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex flex-col gap-2">
                {Object.entries(inputData).map(([key, value]) => (
                  <div key={key}>
                    <span className="font-bold">{key}:</span> {value}
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      },
    },
    {
      accessorKey: "duration",
      header: "Duration",
      cell: ({ row }: any) => {
        return <div>{formatDuration(row.original.duration)}</div>;
      },
    },
    {
      id: "audio-controls",
      cell: ({ row }: any) => {
        if (row.original.recording_available) {
          return (
            <Badge
              className="cursor-pointer hover:bg-gray-500"
              onClick={() => setSelectedCall(row.original)}
            >
              Listen
            </Badge>
          );
        } else {
          return null;
        }
      },
    },
  ];

  return (
    <Layout title="Call History">
      {isLoading ? (
        <LoadingView text="Loading call history..." />
      ) : (
        <DataTable data={callHistory} columns={columns} />
      )}
      <CallDisplay call={selectedCall} setCall={setSelectedCall} />
    </Layout>
  );
};
