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

const ToolConfigurationSchema = z.object({
  hang_up: z.boolean(),
  send_text: z.boolean(),
  forward_call: z.boolean(),
  forward_call_numbers: z.array(
    z.object({
      phone_number: z.string(),
      label: z.string(),
    })
  ),
  enter_keypad: z.boolean(),
});

const SwitchField = (props: {
  form: UseFormReturn<z.infer<typeof ToolConfigurationSchema>>;
  name: "hang_up" | "send_text" | "forward_call" | "enter_keypad";
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
      forward_call:
        props.existingToolConfiguration.forward_call &&
        props.existingToolConfiguration.forward_call.length > 0,
      forward_call_numbers:
        props.existingToolConfiguration.forward_call_numbers ?? [],
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
      data.forward_call,
      data.forward_call ? data.forward_call_numbers : [],
      data.enter_keypad,
      accessToken
    );
    if (response !== null) {
      props.successCallback(response);
    } else {
      toast.error("Failed to update tool configuration");
    }
    setSubmitLoading(false);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-6">
        <div>
          <h3 className="mb-4 text-lg font-medium">Email Notifications</h3>
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
              name="forward_call"
              label="Forward call"
              description="The agent can forward the call to other numbers"
            />
          </div>
        </div>
        <Button disabled={submitLoading} type="submit">
          Submit{" "}
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
      {props.existingToolConfiguration.forward_call &&
        props.existingToolConfiguration.forward_call.length > 0 && (
          <ToolBadge label="Forward call" />
        )}
      {props.existingToolConfiguration.enter_keypad && (
        <ToolBadge label="Enter keypad" />
      )}
    </div>
  );
};
