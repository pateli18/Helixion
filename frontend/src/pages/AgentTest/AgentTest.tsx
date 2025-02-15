import { BrowserCallDisplay, LiveCallDisplay } from "@/components/CallDisplay";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  browserCall,
  getAgents,
  getSampleValues,
  outboundCall,
} from "@/utils/apiCalls";
import { ReloadIcon } from "@radix-ui/react-icons";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AgentConfiguration,
  extractNewFieldsFromSystemMessage,
} from "./AgentConfiguration";
import { Badge } from "@/components/ui/badge";
import { LoadingView } from "@/components/Loader";
import { useSearchParams } from "react-router-dom";
import { Agent } from "@/types";
import { useUserContext } from "@/contexts/UserContext";

const CallPhoneNumber = (props: {
  handleCallPhoneNumber: (phoneNumber: string) => Promise<void>;
}) => {
  const [isCalling, setIsCalling] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [isValidPhoneNumber, setIsValidPhoneNumber] = useState(false);
  const validatePhoneNumber = (phoneNumber: string) => {
    // check starts with + and is 11 digits long and only contains numbers except for the +
    return (
      phoneNumber.startsWith("+") &&
      phoneNumber.slice(1).match(/^\d+$/) !== null
    );
  };

  const onClick = async () => {
    if (phoneNumber && isValidPhoneNumber) {
      setIsCalling(true);
      await props.handleCallPhoneNumber(phoneNumber);
      setIsCalling(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Button
          disabled={phoneNumber === null || !isValidPhoneNumber || isCalling}
          onClick={onClick}
        >
          Call Phone Number{" "}
          {isCalling && <ReloadIcon className="animate-spin ml-2 h-4 w-4" />}
        </Button>
        <Input
          type="tel"
          placeholder="Enter phone number with country code"
          value={phoneNumber ?? ""}
          onChange={(e) => {
            setPhoneNumber(e.target.value);
            setIsValidPhoneNumber(validatePhoneNumber(e.target.value));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onClick();
            }
          }}
          className={cn("max-w-[600px]")}
        />
      </div>
      {!isValidPhoneNumber && phoneNumber && (
        <div className="text-sm text-red-500">
          Must include the country code and start with +
        </div>
      )}
    </div>
  );
};

const SampleField = (props: {
  name: string;
  value: string;
  setValue?: (newValue: string) => void;
}) => {
  return (
    <div className="flex items-center gap-2">
      <div className="font-bold text-sm">{props.name}</div>
      <Input
        type="text"
        value={props.value}
        onChange={(e) => {
          props.setValue?.(e.target.value);
        }}
        disabled={!props.setValue}
        className={cn("max-w-[600px]")}
      />
    </div>
  );
};

const Dialer = (props: {
  activeAgent: Agent;
  setAgents: React.Dispatch<React.SetStateAction<Agent[]>>;
}) => {
  const { getAccessToken } = useUserContext();
  const [phoneCallId, setPhoneCallId] = useState<string | null>(null);
  const [browserCallId, setBrowserCallId] = useState<string | null>(null);
  const [browserCallLoading, setBrowserCallLoading] = useState(false);
  const [sampleDetailsLoading, setSampleDetailsLoading] = useState(false);
  const handleCallPhoneNumber = async (phoneNumber: string) => {
    const accessToken = await getAccessToken();
    const response = await outboundCall(
      phoneNumber,
      props.activeAgent?.id ?? "",
      props.activeAgent?.sample_values ?? {},
      accessToken
    );
    if (response === null) {
      toast.error("Failed to start call, please try again");
    } else {
      setPhoneCallId(response.phone_call_id);
    }
  };

  const handleCallBrowser = async () => {
    setBrowserCallLoading(true);
    const accessToken = await getAccessToken();
    const response = await browserCall(
      props.activeAgent.id,
      props.activeAgent.sample_values,
      accessToken
    );
    if (response === null) {
      toast.error("Failed to start call, please try again");
    } else {
      setBrowserCallId(response.phone_call_id);
    }
    setBrowserCallLoading(false);
  };

  const handleGetSampleValues = async () => {
    setSampleDetailsLoading(true);
    const accessToken = await getAccessToken();
    const response = await getSampleValues(
      extractNewFieldsFromSystemMessage(
        props.activeAgent.system_message,
        props.activeAgent.sample_values
      ),
      accessToken
    );
    if (response === null) {
      toast.error("Failed to get sample details, please try again");
    } else {
      props.setAgents((prev) => {
        const newAgents = [...prev];
        const agentIndex = newAgents.findIndex(
          (agent) => agent.id === props.activeAgent.id
        );
        newAgents[agentIndex] = {
          ...props.activeAgent,
          sample_values: response,
        };
        return newAgents;
      });
    }
    setSampleDetailsLoading(false);
  };

  const handleClearValues = () => {
    props.setAgents((prev) => {
      const newAgents = [...prev];
      const agentIndex = newAgents.findIndex(
        (agent) => agent.id === props.activeAgent.id
      );
      // Create new sample_values object with same keys but empty values
      const clearedValues = Object.fromEntries(
        Object.keys(props.activeAgent.sample_values).map((key) => [key, ""])
      );
      newAgents[agentIndex] = {
        ...props.activeAgent,
        sample_values: clearedValues,
      };
      return newAgents;
    });
  };

  return (
    <div className="space-y-4 px-4 pb-10">
      {phoneCallId === null && (
        <div className="flex justify-end">
          <Button onClick={handleCallBrowser} variant="default">
            Test Call
            {browserCallLoading && (
              <ReloadIcon className="w-4 h-4 animate-spin" />
            )}
          </Button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="text-md text-gray-500">Enter Details</div>
        <Badge
          variant="secondary"
          onClick={handleGetSampleValues}
          className="cursor-pointer hover:bg-gray-200"
        >
          Auto-Populate
          {sampleDetailsLoading && (
            <ReloadIcon className="ml-2 w-2 h-2 animate-spin" />
          )}
        </Badge>
        <Badge
          variant="secondary"
          onClick={handleClearValues}
          className="cursor-pointer hover:bg-gray-200"
        >
          Clear
        </Badge>
      </div>
      {Object.entries(props.activeAgent?.sample_values ?? {}).map(
        ([key, value]) => (
          <SampleField
            key={key}
            name={key}
            value={value}
            setValue={(newValue) => {
              props.setAgents((prev) => {
                const newAgents = [...prev];
                const agentIndex = newAgents.findIndex(
                  (agent) => agent.id === props.activeAgent.id
                );
                newAgents[agentIndex] = {
                  ...props.activeAgent,
                  sample_values: {
                    ...props.activeAgent.sample_values,
                    [key]: newValue,
                  },
                };
                return newAgents;
              });
            }}
          />
        )
      )}
      {phoneCallId === null && (
        <CallPhoneNumber handleCallPhoneNumber={handleCallPhoneNumber} />
      )}
      <LiveCallDisplay
        phoneCallId={phoneCallId}
        setPhoneCallId={setPhoneCallId}
      />
      <BrowserCallDisplay
        browserCallId={browserCallId}
        setBrowserCallId={setBrowserCallId}
      />
    </div>
  );
};

export const AgentTestPage = () => {
  const { getAccessToken } = useUserContext();
  const [agentId, setAgentId] = useState<{
    baseId: string;
    versionId: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [agents, setAgents] = useState<Agent[]>([]);
  const activeAgent = agents.find((agent) => agent.id === agentId?.versionId);

  // Update URL when agentId changes
  useEffect(() => {
    if (agentId) {
      setSearchParams(
        {
          baseId: agentId.baseId,
          versionId: agentId.versionId,
        },
        { replace: true }
      );
    }
  }, [agentId]);

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    setIsLoading(true);
    const accessToken = await getAccessToken();
    const response = await getAgents(accessToken);
    setIsLoading(false);
    if (response !== null) {
      setAgents(response);

      // Handle URL parameters
      const baseId = searchParams.get("baseId");
      const versionId = searchParams.get("versionId");
      if (baseId && versionId) {
        const matchingAgent = response.find(
          (agent) => agent.id === versionId && agent.base_id === baseId
        );
        if (matchingAgent) {
          setAgentId({
            baseId: matchingAgent.base_id,
            versionId: matchingAgent.id,
          });
          return;
        }
      }

      // If no valid URL parameters or agent not found, select first agent
      if (agentId === null && response.length > 0) {
        setAgentId({
          baseId: response[0].base_id,
          versionId: response[0].id,
        });
      }
    } else {
      toast.error("Failed to fetch agents");
    }
  };

  return (
    <Layout title="Agent Tester">
      {isLoading ? (
        <LoadingView text="Loading agents..." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AgentConfiguration
            agentId={agentId}
            setAgentId={setAgentId}
            agents={agents}
            setAgents={setAgents}
            activeAgent={activeAgent}
          />
          {activeAgent === undefined ? (
            <div className="flex items-center justify-center">
              <div className="text-md text-gray-500">
                Select an agent to start a call
              </div>
            </div>
          ) : (
            <Dialer activeAgent={activeAgent} setAgents={setAgents} />
          )}
        </div>
      )}
    </Layout>
  );
};
