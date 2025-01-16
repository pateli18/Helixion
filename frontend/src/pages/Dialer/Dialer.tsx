import { BrowserAudioConnection } from "@/components/audio/BrowserAudioConnection";
import { LiveCallDisplay } from "@/components/CallDisplay";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { outboundCall } from "@/utils/apiCalls";
import { ReloadIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import { toast } from "sonner";

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
    if (phoneNumber) {
      setIsCalling(true);
      await props.handleCallPhoneNumber(phoneNumber);
      setIsCalling(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Button
          disabled={phoneNumber !== null && !isValidPhoneNumber && !isCalling}
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
          className={cn(
            "max-w-[600px]",
            !isValidPhoneNumber && "border-red-500"
          )}
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
  setValue?: React.Dispatch<React.SetStateAction<string>>;
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

export const PrimaryPage = () => {
  const [name, setName] = useState("Joe Smith");
  const [email, setEmail] = useState("joe_smith@gmail.com");
  const [age, setAge] = useState("30");
  const [location, setLocation] = useState("New York, NY");
  const [phoneCallId, setPhoneCallId] = useState<string | null>(null);

  const handleCallPhoneNumber = async (phoneNumber: string) => {
    const response = await outboundCall(phoneNumber, {
      name,
      email,
      age,
      location,
    });
    if (response === null) {
      toast.error("Failed to start call, please try again");
    } else {
      setPhoneCallId(response.phone_call_id);
    }
  };

  return (
    <Layout title="Dialer">
      <div className="flex items-center justify-center">
        <div className="space-y-4 px-4">
          {phoneCallId === null && (
            <BrowserAudioConnection userInfo={{ name, email, age, location }} />
          )}
          <div className="text-md text-gray-500">Enter Details</div>
          <SampleField name="Name" value={name} setValue={setName} />
          <SampleField name="Email" value={email} setValue={setEmail} />
          <SampleField name="Age" value={age} setValue={setAge} />
          <SampleField
            name="Location"
            value={location}
            setValue={setLocation}
          />
          {phoneCallId === null && (
            <CallPhoneNumber handleCallPhoneNumber={handleCallPhoneNumber} />
          )}
          <LiveCallDisplay
            phoneCallId={phoneCallId}
            setPhoneCallId={setPhoneCallId}
          />
        </div>
      </div>
    </Layout>
  );
};
