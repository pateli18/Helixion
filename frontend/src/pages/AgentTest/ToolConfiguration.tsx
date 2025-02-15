import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, UseFormReturn } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useState } from "react";
import { updateToolConfiguration } from "@/utils/apiCalls";
import { useUserContext } from "@/contexts/UserContext";
import { ReloadIcon } from "@radix-ui/react-icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PlusIcon, TrashIcon } from "@radix-ui/react-icons";

const ToolConfigurationSchema = z.object({
  hang_up: z.boolean(),
  send_text: z.boolean(),
  transfer_call: z.boolean(),
  transfer_call_numbers: z.array(
    z.object({
      phone_number: z.string(),
      label: z.string(),
    })
  ),
  enter_keypad: z.boolean(),
});

const SwitchField = (props: {
  form: UseFormReturn<z.infer<typeof ToolConfigurationSchema>>;
  name: "hang_up" | "send_text" | "transfer_call" | "enter_keypad";
  label: string;
  description: string;
}) => {
  const { form, name, label, description } = props;
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
          <div className="space-y-0.5">
            <FormLabel>{label}</FormLabel>
            <FormDescription>{description}</FormDescription>
          </div>
          <FormControl>
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          </FormControl>
        </FormItem>
      )}
    />
  );
};

const TransferCallNumbers = (props: {
  form: UseFormReturn<z.infer<typeof ToolConfigurationSchema>>;
}) => {
  const { form } = props;
  const numbers = form.watch("transfer_call_numbers");
  const transferEnabled = form.watch("transfer_call");

  const addNumber = () => {
    form.setValue("transfer_call_numbers", [
      ...numbers,
      { phone_number: "", label: "" },
    ]);
  };

  const removeNumber = (index: number) => {
    form.setValue(
      "transfer_call_numbers",
      numbers.filter((_, i) => i !== index)
    );
  };

  if (!transferEnabled) return null;

  return (
    <div className="space-y-4 rounded-lg border p-4">
      {numbers.map((_, index) => (
        <div key={index} className="flex gap-4 items-start">
          <FormField
            control={form.control}
            name={`transfer_call_numbers.${index}.label`}
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>Label</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Customer Support" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`transfer_call_numbers.${index}.phone_number`}
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>Phone Number</FormLabel>
                <FormControl>
                  <Input placeholder="+1234567890" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => removeNumber(index)}
            className="mt-8"
          >
            <TrashIcon className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="flex justify-center items-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addNumber}
          className="h-8"
        >
          <PlusIcon className="h-4 w-4 mr-2" /> Add Number
        </Button>
      </div>
    </div>
  );
};

const ToolConfigurationForm = (props: {
  successCallback: (toolConfiguration: Record<string, any>) => void;
  existingToolConfiguration: Record<string, any>;
  agentId: string;
}) => {
  const { getAccessToken } = useUserContext();
  const [submitLoading, setSubmitLoading] = useState(false);
  const form = useForm<z.infer<typeof ToolConfigurationSchema>>({
    resolver: zodResolver(ToolConfigurationSchema),
    defaultValues: {
      hang_up: props.existingToolConfiguration.hang_up,
      send_text: props.existingToolConfiguration.send_text ?? false,
      transfer_call:
        props.existingToolConfiguration.transfer_call_numbers &&
        props.existingToolConfiguration.transfer_call_numbers.length > 0
          ? true
          : false,
      transfer_call_numbers:
        props.existingToolConfiguration.transfer_call_numbers || [],
      enter_keypad: props.existingToolConfiguration.enter_keypad ?? false,
    },
  });

  const onSubmit = async (data: z.infer<typeof ToolConfigurationSchema>) => {
    setSubmitLoading(true);
    const accessToken = await getAccessToken();
    const response = await updateToolConfiguration(
      props.agentId,
      data.hang_up,
      data.send_text,
      data.transfer_call ? data.transfer_call_numbers : [],
      data.enter_keypad,
      accessToken
    );
    if (response !== null) {
      props.successCallback(response);
      toast.success("Tool configuration updated");
    } else {
      toast.error("Failed to update tool configuration");
    }
    setSubmitLoading(false);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-6">
        <div className="space-y-4">
          <SwitchField
            form={form}
            name="hang_up"
            label="Hang up"
            description="The agent can hang up the call"
          />
          <SwitchField
            form={form}
            name="send_text"
            label="Send text"
            description="The agent can send a text message to the caller"
          />
          <SwitchField
            form={form}
            name="enter_keypad"
            label="Enter keypad"
            description="The agent can enter numbers on the phone keypad"
          />
          <SwitchField
            form={form}
            name="transfer_call"
            label="Transfer call"
            description="The agent can transfer the call to other numbers"
          />
          <TransferCallNumbers form={form} />
        </div>
        <Button disabled={submitLoading} type="submit">
          Update{" "}
          {submitLoading && (
            <ReloadIcon className="ml-2 h-4 w-4 animate-spin" />
          )}
        </Button>
      </form>
    </Form>
  );
};

const ToolConfigurationDialog = (props: {
  agentId: string;
  existingToolConfiguration: Record<string, any>;
  successCallback: (toolConfiguration: Record<string, any>) => void;
}) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm">Actions</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Action Configuration</DialogTitle>
          <DialogDescription>
            Select the actions that the agent can perform.
          </DialogDescription>
        </DialogHeader>
        <ToolConfigurationForm {...props} />
      </DialogContent>
    </Dialog>
  );
};

const ToolBadge = (props: { label: string }) => {
  return (
    <Badge variant="secondary" className="cursor-default">
      {props.label}
    </Badge>
  );
};

export const ToolConfigurationView = (props: {
  agentId: string;
  existingToolConfiguration: Record<string, any>;
  successCallback: (toolConfiguration: Record<string, any>) => void;
}) => {
  return (
    <div className="flex items-center space-x-2">
      <ToolConfigurationDialog
        agentId={props.agentId}
        existingToolConfiguration={props.existingToolConfiguration}
        successCallback={props.successCallback}
      />
      {props.existingToolConfiguration.hang_up && <ToolBadge label="Hang up" />}
      {props.existingToolConfiguration.send_text && (
        <ToolBadge label="Send text" />
      )}
      {props.existingToolConfiguration.transfer_call_numbers &&
        props.existingToolConfiguration.transfer_call_numbers.length > 0 && (
          <ToolBadge label="Transfer call" />
        )}
      {props.existingToolConfiguration.enter_keypad && (
        <ToolBadge label="Enter keypad" />
      )}
    </div>
  );
};
