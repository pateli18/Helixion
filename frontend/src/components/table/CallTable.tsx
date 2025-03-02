import { DataTable } from "@/components/table/Table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import { forwardRef } from "react";
import { toast } from "sonner";
import { PhoneCallMetadata, PhoneCallStatus, PhoneCallType } from "@/types";
import { Badge } from "@/components/ui/badge";
import { formatDuration, loadAndFormatDate } from "@/utils/dateFormat";
import { ClickToCopy } from "../ClickToCopy";

const StatusBadge = (props: { status: PhoneCallStatus }) => {
  let badgeColor;
  switch (props.status) {
    case "initiated":
      badgeColor = "bg-gray-500 hover:bg-gray-500";
      break;
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

const CallTypeBadge = (props: { callType: PhoneCallType }) => {
  let badgeColor;
  switch (props.callType) {
    case "inbound":
      badgeColor = "bg-blue-300 hover:bg-blue-300 text-black";
      break;
    case "outbound":
      badgeColor = "bg-blue-800 hover:bg-blue-800 text-white";
      break;
  }

  return (
    <Badge className={cn(badgeColor, "cursor-default")}>{props.callType}</Badge>
  );
};

export const CallHistoryTable = (props: {
  data: PhoneCallMetadata[];
  setSelectedCall: (call: PhoneCallMetadata) => void;
  additionalColumns?: ColumnDef<PhoneCallMetadata>[];
}) => {
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
                className="max-w-[50px] text-ellipsis overflow-hidden whitespace-nowrap"
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
      accessorKey: "initiator",
      header: "Initiator",
      cell: ({ row }: any) => {
        return <div>{row.original.initiator}</div>;
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
      accessorKey: "agent",
      header: "Agent",
      cell: ({ row }: any) => {
        const agent = row.original.agent_metadata;
        if (agent === null) {
          return null;
        }
        return (
          <Tooltip>
            <TooltipTrigger>
              <a
                href={`/?baseId=${agent.base_id}&versionId=${agent.version_id}`}
              >
                <Badge
                  variant="secondary"
                  className="cursor-pointer hover:bg-gray-500"
                >
                  <div className="max-w-[100px] truncate text-ellipsis">
                    {agent.name}
                  </div>
                </Badge>
              </a>
            </TooltipTrigger>
            <TooltipContent>Click to view {agent.name}</TooltipContent>
          </Tooltip>
        );
      },
    },
    {
      accessorKey: "phone_number",
      header: "Phone Number",
      cell: ({ row }: any) => {
        const callType = row.original.call_type;
        const relevantPhoneNumber =
          callType === "inbound"
            ? row.original.from_phone_number
            : row.original.to_phone_number;
        return (
          <Tooltip>
            <TooltipTrigger>
              <ClickToCopy
                text={relevantPhoneNumber}
                className="lowercase max-w-[100px] text-ellipsis overflow-hidden whitespace-nowrap"
              />
            </TooltipTrigger>
            <TooltipContent>{relevantPhoneNumber}</TooltipContent>
          </Tooltip>
        );
      },
    },
    {
      accessorKey: "call_type",
      header: "Call Type",
      cell: ({ row }: any) => {
        const callType = row.original.call_type;
        return <CallTypeBadge callType={callType} />;
      },
    },
    {
      accessorKey: "end_reason",
      header: "End Reason",
      cell: ({ row }: any) => {
        return <Badge variant="secondary">{row.original.end_reason}</Badge>;
      },
    },
    {
      accessorKey: "input-data",
      header: "Input Data",
      cell: ({ row }: any) => {
        // get first key / value pair
        const inputData: Record<string, string> = row.original.input_data;
        if (Object.keys(inputData).length === 0) {
          return null;
        }
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
              onClick={() => props.setSelectedCall(row.original)}
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

  if (props.additionalColumns) {
    columns.splice(columns.length - 1, 0, ...props.additionalColumns);
  }

  return <DataTable data={props.data} columns={columns} />;
};
