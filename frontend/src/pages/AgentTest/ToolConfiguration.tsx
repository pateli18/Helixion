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
import { useState, useEffect } from "react";
import {
  updateToolConfiguration,
  getAllKnowledgeBases,
} from "@/utils/apiCalls";
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
import { MultiSelectControl } from "@/components/ui/MultiSelectControl";

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
  knowledge_base: z.boolean(),
  knowledge_bases: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    })
  ),
  enter_keypad: z.boolean(),
});

const SwitchField = (props: {
  form: UseFormReturn<z.infer<typeof ToolConfigurationSchema>>;
  name:
    | "hang_up"
    | "send_text"
    | "transfer_call"
    | "enter_keypad"
    | "knowledge_base";
  label: string;
  description: string;
  children?: React.ReactNode;
}) => {
  return (
    <div className="space-y-4 rounded-lg border p-3 shadow-sm">
      <FormField
        control={props.form.control}
        name={props.name}
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between">
            <div className="space-y-0.5">
              <FormLabel>{props.label}</FormLabel>
              <FormDescription>{props.description}</FormDescription>
            </div>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
          </FormItem>
        )}
      />
      {props.children}
    </div>
  );
};

const TransferCallNumbers = (props: {
  form: UseFormReturn<z.infer<typeof ToolConfigurationSchema>>;
}) => {
  const numbers = props.form.watch("transfer_call_numbers");
  const transferEnabled = props.form.watch("transfer_call");

  const addNumber = () => {
    props.form.setValue("transfer_call_numbers", [
      ...numbers,
      { phone_number: "", label: "" },
    ]);
  };

  const removeNumber = (index: number) => {
    props.form.setValue(
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
            control={props.form.control}
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
            control={props.form.control}
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

const KnowledgeBases = (props: {
  form: UseFormReturn<z.infer<typeof ToolConfigurationSchema>>;
}) => {
  const knowledgeBaseEnabled = props.form.watch("knowledge_base");
  const { getAccessToken } = useUserContext();
  const [knowledgeBases, setKnowledgeBases] = useState<
    { id: string; name: string }[]
  >([]);
  const selectedKnowledgeBases = props.form.watch("knowledge_bases") || [];

  const fetchKnowledgeBases = async () => {
    const accessToken = await getAccessToken();
    const response = await getAllKnowledgeBases(accessToken);
    if (response) {
      setKnowledgeBases(response);
    }
  };

  useEffect(() => {
    if (knowledgeBaseEnabled) {
      fetchKnowledgeBases();
    }
  }, [knowledgeBaseEnabled]);

  if (!knowledgeBaseEnabled) return null;

  return (
    <div className="flex justify-between items-center">
      <MultiSelectControl
        title="Knowledge Bases"
        items={knowledgeBases}
        selectedItems={selectedKnowledgeBases}
        selectItem={(item, isSelected) =>
          props.form.setValue(
            "knowledge_bases",
            isSelected
              ? [...selectedKnowledgeBases, item]
              : selectedKnowledgeBases.filter((kb) => kb.id !== item.id)
          )
        }
        selectAll={() => props.form.setValue("knowledge_bases", knowledgeBases)}
        clearSelectedItems={() => props.form.setValue("knowledge_bases", [])}
      />
      <a href="/knowledge-bases" target="_blank">
        <Button type="button" variant="outline" size="sm">
          <PlusIcon className="h-4 w-4 mr-2" /> Add New
        </Button>
      </a>
    </div>
  );
};

const ToolConfigurationForm = (props: {
  successCallback: (toolConfiguration: Record<string, any>) => void;
  existingToolConfiguration: Record<string, any>;
  agentId: string;
}) => {
  const form = useForm<z.infer<typeof ToolConfigurationSchema>>({
    resolver: zodResolver(ToolConfigurationSchema),
    defaultValues: {
      hang_up: props.existingToolConfiguration.hang_up ?? false,
      send_text: props.existingToolConfiguration.send_text ?? false,
      transfer_call:
        props.existingToolConfiguration.transfer_call_numbers &&
        props.existingToolConfiguration.transfer_call_numbers.length > 0
          ? true
          : false,
      transfer_call_numbers:
        props.existingToolConfiguration.transfer_call_numbers || [],
      enter_keypad: props.existingToolConfiguration.enter_keypad ?? false,
      knowledge_base:
        props.existingToolConfiguration.knowledge_bases &&
        props.existingToolConfiguration.knowledge_bases.length > 0
          ? true
          : false,
      knowledge_bases: props.existingToolConfiguration.knowledge_bases || [],
    },
  });

  const onSubmit = async (data: z.infer<typeof ToolConfigurationSchema>) => {
    props.successCallback(data);
    toast.success("Tool configuration updated");
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-6">
        <div className="space-y-4">
          <SwitchField
            form={form}
            name="hang_up"
            label="Hang Up"
            description="The agent can hang up the call"
          />
          <SwitchField
            form={form}
            name="send_text"
            label="Send Text"
            description="The agent can send a text message to the caller"
          />
          <SwitchField
            form={form}
            name="enter_keypad"
            label="Enter Keypad"
            description="The agent can enter numbers on the phone keypad"
          />
          <SwitchField
            form={form}
            name="transfer_call"
            label="Transfer Call"
            description="The agent can transfer the call to other numbers"
          >
            <TransferCallNumbers form={form} />
          </SwitchField>
          <SwitchField
            form={form}
            name="knowledge_base"
            label="Knowledge Base"
            description="The agent can use knowledge bases to answer questions"
          >
            <KnowledgeBases form={form} />
          </SwitchField>
        </div>
        <Button type="submit">Update</Button>
      </form>
    </Form>
  );
};

const ToolConfigurationDialog = (props: {
  agentId: string;
  existingToolConfiguration: Record<string, any>;
  successCallback: (toolConfiguration: Record<string, any>) => void;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Actions</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90%] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Action Configuration</DialogTitle>
          <DialogDescription>
            Select the actions that the agent can perform.
          </DialogDescription>
        </DialogHeader>
        <ToolConfigurationForm
          {...props}
          successCallback={(toolConfiguration) => {
            props.successCallback(toolConfiguration);
            setOpen(false);
          }}
        />
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
      {props.existingToolConfiguration.knowledge_bases &&
        props.existingToolConfiguration.knowledge_bases.map(
          (kb: { id: string; name: string }) => (
            <ToolBadge key={kb.id} label={kb.name} />
          )
        )}
    </div>
  );
};
