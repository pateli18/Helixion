import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getAvailablePhoneNumbers,
  buyPhoneNumber,
  getAllPhoneNumbers,
  getAgentMetadata,
  assignMultiplePhoneNumbersToAgent,
} from "@/utils/apiCalls";
import { AgentMetadata, AgentPhoneNumber } from "@/types";
import { ColumnDef } from "@tanstack/react-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useUserContext } from "@/contexts/UserContext";
import { toast } from "sonner";
import { DataTable } from "@/components/table/Table";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Dialog } from "@/components/ui/dialog";
import { PlusIcon } from "lucide-react";
import { ReloadIcon } from "@radix-ui/react-icons";

const NewNumberDialog = (props: {
  setPhoneNumbers: React.Dispatch<React.SetStateAction<AgentPhoneNumber[]>>;
}) => {
  const [areaCode, setAreaCode] = useState("");
  const [availableNumbers, setAvailableNumbers] = useState<string[]>([]);
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<string | null>(
    null
  );
  const [searchNumbersLoading, setSearchNumbersLoading] = useState(false);
  const [buyNumberLoading, setBuyNumberLoading] = useState(false);

  // Search for available numbers
  const searchNumbers = async () => {
    setSearchNumbersLoading(true);
    const numbers = await getAvailablePhoneNumbers("US", areaCode, null);
    if (numbers !== null) {
      setAvailableNumbers(numbers);
    } else {
      toast.error("Failed to search for numbers");
    }
    setSearchNumbersLoading(false);
  };

  // Buy a phone number
  const handleBuyNumber = async () => {
    if (selectedPhoneNumber === null) {
      toast.error("Please select a number to buy");
      return;
    }
    setBuyNumberLoading(true);
    const result = await buyPhoneNumber(selectedPhoneNumber, null);
    if (result !== null) {
      props.setPhoneNumbers((prev) => [...prev, result]);
      setAvailableNumbers(
        availableNumbers.filter((n) => n !== selectedPhoneNumber)
      );
      setSelectedPhoneNumber(null);
    } else {
      toast.error("Failed to buy number");
    }
    setBuyNumberLoading(false);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="w-4 h-4" /> New Number
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Phone Number</DialogTitle>
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Input
            placeholder="Area Code"
            value={areaCode}
            onChange={(e) => setAreaCode(e.target.value)}
          />
          <Button onClick={searchNumbers} disabled={searchNumbersLoading}>
            Search for New Numbers
            {searchNumbersLoading && (
              <ReloadIcon className="w-4 h-4 ml-2 animate-spin" />
            )}
          </Button>
        </div>
        {availableNumbers.length > 0 && (
          <div className="flex items-center space-x-2">
            <Select
              value={selectedPhoneNumber ?? undefined}
              onValueChange={setSelectedPhoneNumber}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select Number" />
              </SelectTrigger>
              <SelectContent>
                {availableNumbers.map((number) => (
                  <SelectItem key={number} value={number}>
                    {number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => handleBuyNumber()}
              disabled={buyNumberLoading || selectedPhoneNumber === null}
            >
              Buy Number
              {buyNumberLoading && (
                <ReloadIcon className="w-4 h-4 ml-2 animate-spin" />
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const PhoneNumberTable = (props: {
  phoneNumbers: AgentPhoneNumber[];
  agents: AgentMetadata[];
  setPhoneNumbers: React.Dispatch<React.SetStateAction<AgentPhoneNumber[]>>;
}) => {
  const { getAccessToken } = useUserContext();
  // Assign phone number to agents
  const handleAssignNumber = async (
    phoneNumberId: string,
    phoneNumber: string,
    agentId: string,
    incoming: boolean
  ) => {
    const accessToken = await getAccessToken();
    const response = await assignMultiplePhoneNumbersToAgent(
      [
        {
          id: phoneNumberId,
          incoming: incoming,
          phone_number: phoneNumber,
          agent: null,
        },
      ],
      agentId,
      accessToken
    );
    if (response) {
      props.setPhoneNumbers((prev) =>
        prev.map((phoneNumber) =>
          phoneNumber.id === phoneNumberId
            ? {
                ...phoneNumber,
                agent:
                  props.agents.find((agent) => agent.base_id === agentId) ??
                  null,
                incoming: incoming,
              }
            : phoneNumber
        )
      );
      toast.success("Updated phone number");
    } else {
      toast.error("Failed to update phone number");
    }
  };

  const columns: ColumnDef<AgentPhoneNumber>[] = [
    {
      header: "Phone Number",
      accessorKey: "phone_number",
      cell: ({ row }) => {
        return <div>{row.original.phone_number}</div>;
      },
    },
    {
      header: "Agent",
      accessorKey: "agent",
      cell: ({ row }) => {
        const agentMetadata = row.original.agent;

        const onSelectChange = (value: string) => {
          handleAssignNumber(
            row.original.id,
            row.original.phone_number,
            value,
            row.original.incoming
          );
        };

        return (
          <Select
            value={agentMetadata?.base_id ?? undefined}
            onValueChange={onSelectChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select Agent" />
            </SelectTrigger>
            <SelectContent>
              {props.agents.map((agent) => (
                <SelectItem key={agent.base_id} value={agent.base_id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
    {
      header: "Incoming",
      accessorKey: "incoming",
      cell: ({ row }) => {
        const agentMetadata = row.original.agent;

        if (agentMetadata === null) {
          return null;
        }

        return (
          <Switch
            checked={row.original.incoming}
            onCheckedChange={(checked) => {
              handleAssignNumber(
                row.original.id,
                row.original.phone_number,
                agentMetadata.base_id,
                checked
              );
            }}
          />
        );
      },
    },
  ];

  return <DataTable columns={columns} data={props.phoneNumbers} />;
};

export const PhoneNumbersPage = () => {
  const { getAccessToken } = useUserContext();
  const [phoneNumbers, setPhoneNumbers] = useState<AgentPhoneNumber[]>([]);
  const [availableNumbers, setAvailableNumbers] = useState<string[]>([]);
  const [agents, setAgents] = useState<AgentMetadata[]>([]);
  const [countryCode, setCountryCode] = useState("US");
  const [areaCode, setAreaCode] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch existing phone numbers and agents on mount
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const accessToken = await getAccessToken();
    const [numbers, agentData] = await Promise.all([
      getAllPhoneNumbers(accessToken),
      getAgentMetadata(accessToken),
    ]);
    if (numbers !== null) {
      setPhoneNumbers(numbers);
    } else {
      toast.error("Failed to fetch phone numbers");
    }
    if (agentData !== null) {
      setAgents(agentData);
    } else {
      toast.error("Failed to fetch agents");
    }
  };

  return (
    <Layout title="Phone Numbers">
      <div className="flex items-center justify-between">
        <div className="text-md text-muted-foreground">
          {phoneNumbers.length} phone numbers
        </div>
        <NewNumberDialog setPhoneNumbers={setPhoneNumbers} />
      </div>
      <PhoneNumberTable
        phoneNumbers={phoneNumbers}
        agents={agents}
        setPhoneNumbers={setPhoneNumbers}
      />
    </Layout>
  );
};
