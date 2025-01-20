import { BrowserCallDisplay, LiveCallDisplay } from "@/components/CallDisplay";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { browserCall, getSampleDetails, outboundCall } from "@/utils/apiCalls";
import { ReloadIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import { toast } from "sonner";
import { AgentConfiguration } from "./AgentConfiguration";
import { Badge } from "@/components/ui/badge";
import { useAuthInfo } from "@propelauth/react";

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
  agentId: {
    baseId: string;
    versionId: string;
  };
  sampleFields: Record<string, string>;
  setSampleFields: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) => {
  const authInfo = useAuthInfo();
  const [phoneCallId, setPhoneCallId] = useState<string | null>(null);
  const [browserCallId, setBrowserCallId] = useState<string | null>(null);
  const [browserCallLoading, setBrowserCallLoading] = useState(false);
  const [sampleDetailsLoading, setSampleDetailsLoading] = useState(false);
  const handleCallPhoneNumber = async (phoneNumber: string) => {
    const response = await outboundCall(
      phoneNumber,
      props.agentId.versionId,
      {
        ...props.sampleFields,
      },
      authInfo.accessToken ?? null
    );
    if (response === null) {
      toast.error("Failed to start call, please try again");
    } else {
      setPhoneCallId(response.phone_call_id);
    }
  };

  const handleCallBrowser = async () => {
    setBrowserCallLoading(true);
    const response = await browserCall(
      props.agentId.versionId,
      props.sampleFields,
      authInfo.accessToken ?? null
    );
    if (response === null) {
      toast.error("Failed to start call, please try again");
    } else {
      setBrowserCallId(response.phone_call_id);
    }
    setBrowserCallLoading(false);
  };

  const handleGetSampleDetails = async () => {
    setSampleDetailsLoading(true);
    const response = await getSampleDetails(
      Object.keys(props.sampleFields),
      authInfo.accessToken ?? null
    );
    if (response === null) {
      toast.error("Failed to get sample details, please try again");
    } else {
      props.setSampleFields(response);
    }
    setSampleDetailsLoading(false);
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
          onClick={handleGetSampleDetails}
          className="cursor-pointer hover:bg-gray-200"
        >
          Auto-Populate
          {sampleDetailsLoading && (
            <ReloadIcon className="ml-2 w-2 h-2 animate-spin" />
          )}
        </Badge>
      </div>
      {Object.entries(props.sampleFields).map(([key, value]) => (
        <SampleField
          key={key}
          name={key}
          value={value}
          setValue={(newValue) => {
            props.setSampleFields((prev) => ({ ...prev, [key]: newValue }));
          }}
        />
      ))}
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
  const [sampleFields, setSampleFields] = useState<Record<string, string>>({});
  const [agentId, setAgentId] = useState<{
    baseId: string;
    versionId: string;
  } | null>(null);

  return (
    <Layout title="Agent Tester">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AgentConfiguration
          agentId={agentId}
          setAgentId={setAgentId}
          setSampleFields={setSampleFields}
        />
        {agentId === null ? (
          <div className="flex items-center justify-center">
            <div className="text-md text-gray-500">
              Select an agent to start a call
            </div>
          </div>
        ) : (
          <Dialer
            agentId={agentId}
            sampleFields={sampleFields}
            setSampleFields={setSampleFields}
          />
        )}
      </div>
    </Layout>
  );
};
