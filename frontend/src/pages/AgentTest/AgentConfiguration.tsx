import { HighlightedTextarea } from "@/components/HighlightedTextArea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Agent } from "@/types";
import {
  createNewAgentVersion,
  createAgent,
  activateAgentVersion,
} from "@/utils/apiCalls";
import { loadAndFormatDate } from "@/utils/dateFormat";
import { PlusIcon, ReloadIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogTitle,
  DialogHeader,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import ReactDiffViewer from "react-diff-viewer-continued";
import { useUserContext } from "@/contexts/UserContext";
import { ToolConfigurationView } from "./ToolConfiguration";

const extractFieldsFromSystemMessage = (value: string) => {
  // Extract all fields surrounded by {}
  const fields =
    value.match(/\{([^}]+)\}/g)?.map((field) => field.slice(1, -1)) || [];
  return fields;
};

export const extractNewFieldsFromSystemMessage = (
  value: string,
  existingRecord: Record<string, string>
) => {
  const fields = extractFieldsFromSystemMessage(value);
  return fields.filter((field) => !(field in existingRecord));
};

const CreateNewAgentModal = (props: {
  setAgents: React.Dispatch<React.SetStateAction<Agent[]>>;
  setAgentId: (agentId: { baseId: string; versionId: string } | null) => void;
  triggerButtonText: string;
}) => {
  const { getAccessToken } = useUserContext();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const handleCreateNewAgent = async (name: string) => {
    const accessToken = await getAccessToken();
    const response = await createAgent(name, accessToken);
    if (response !== null) {
      props.setAgents((prev) => [response, ...prev]);
      props.setAgentId({
        baseId: response.base_id,
        versionId: response.id,
      });
      toast.success("Agent created");
      setOpen(false);
    } else {
      toast.error("Failed to create agent, please try again");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="w-4 h-4 mr-2" />
          {props.triggerButtonText}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Agent</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Enter New Agent Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          disabled={name.length === 0}
          onClick={() => handleCreateNewAgent(name)}
        >
          Create
        </Button>
      </DialogContent>
    </Dialog>
  );
};

const findPreviousVersion = (
  agents: Agent[],
  currentVersion: Agent
): Agent | null => {
  const sameBaseAgents = agents
    .filter((a) => a.base_id === currentVersion.base_id)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  const currentIndex = sameBaseAgents.findIndex(
    (a) => a.id === currentVersion.id
  );
  return currentIndex < sameBaseAgents.length - 1
    ? sameBaseAgents[currentIndex + 1]
    : null;
};

const findNextVersion = (
  agents: Agent[],
  currentVersion: Agent
): Agent | null => {
  const sameBaseAgents = agents
    .filter((a) => a.base_id === currentVersion.base_id)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  const currentIndex = sameBaseAgents.findIndex(
    (a) => a.id === currentVersion.id
  );
  return currentIndex > 0 ? sameBaseAgents[currentIndex - 1] : null;
};

const BaseAgentConfiguration = (props: {
  agentId: {
    baseId: string;
    versionId: string;
  } | null;
  setAgentId: (agentId: { baseId: string; versionId: string } | null) => void;
  agents: Agent[];
  setAgents: React.Dispatch<React.SetStateAction<Agent[]>>;
  activeAgent?: Agent;
}) => {
  const { getAccessToken } = useUserContext();
  const [saveLoading, setSaveLoading] = useState(false);
  const [newVersion, setNewVersion] = useState<Agent | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const previousVersion = props.activeAgent
    ? findPreviousVersion(props.agents, props.activeAgent)
    : null;

  const nextVersion = props.activeAgent
    ? findNextVersion(props.agents, props.activeAgent)
    : null;

  const handleSaveVersion = async () => {
    if (newVersion) {
      setSaveLoading(true);
      const accessToken = await getAccessToken();
      const newFields = extractNewFieldsFromSystemMessage(
        newVersion.system_message,
        props.activeAgent?.sample_values ?? {}
      );
      const response = await createNewAgentVersion(
        newVersion,
        newFields,
        accessToken
      );
      setSaveLoading(false);
      if (response !== null) {
        props.setAgents((prev) => {
          const newAgents = [
            response,
            ...prev.map((agent) => {
              if (agent.base_id === response.base_id) {
                return { ...agent, active: false };
              }
              return agent;
            }),
          ];
          return newAgents;
        });
        props.setAgentId({
          baseId: response.base_id,
          versionId: response.id,
        });
        setNewVersion(null);
        toast.success("Version saved");
      } else {
        toast.error("Failed to save version");
      }
    }
  };

  const handleMakeActive = async (agent: Agent) => {
    const accessToken = await getAccessToken();
    const response = await activateAgentVersion(agent.id, accessToken);
    if (response === true) {
      props.setAgents((prev) => {
        const newAgents = prev.map((a) => {
          if (a.base_id === agent.base_id) {
            // Set all versions of this agent to inactive
            return { ...a, active: a.id === agent.id };
          }
          return a;
        });
        return newAgents;
      });
      toast.success("Agent version updated");
    } else {
      toast.error("Failed to update agent version");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="font-bold text-sm">Agent</div>
        <Select
          value={props.agentId?.baseId}
          onValueChange={(value) => {
            const agent = props.agents.find((agent) => agent.base_id === value);
            if (agent) {
              props.setAgentId({
                baseId: agent.base_id,
                versionId: agent.id,
              });
            }
          }}
        >
          <SelectTrigger
            disabled={props.activeAgent === undefined}
            className="truncate text-ellipsis"
          >
            <SelectValue placeholder="Select Agent" />
          </SelectTrigger>
          <SelectContent>
            <div className="overflow-y-scroll max-h-[200px]">
              {props.agents
                .filter((agent) => agent.active)
                .map((agent) => (
                  <SelectItem key={agent.base_id} value={agent.base_id}>
                    {agent.name}
                  </SelectItem>
                ))}
            </div>
          </SelectContent>
        </Select>
        <CreateNewAgentModal
          setAgents={props.setAgents}
          setAgentId={props.setAgentId}
          triggerButtonText="New Agent"
        />
      </div>
      <div className="flex items-center gap-2">
        <div className="font-bold text-sm">Instructions</div>
        <div className="flex items-center gap-2 ml-auto">
          {props.activeAgent?.active ? (
            <Badge className="bg-green-500 text-white">Active</Badge>
          ) : (
            <Button
              className="bg-green-500 text-black"
              size="sm"
              onClick={() => handleMakeActive(props.activeAgent!)}
            >
              Make Active
            </Button>
          )}
          <Select
            value={props.agentId?.versionId}
            onValueChange={(value) => {
              const agent = props.agents.find(
                (agent) => agent.base_id === props.agentId?.baseId
              );
              if (agent) {
                props.setAgentId({
                  baseId: agent.base_id,
                  versionId: value,
                });
                setNewVersion(null);
              }
            }}
          >
            <SelectTrigger
              disabled={props.activeAgent === null}
              className="w-[100px] text-xs"
            >
              Version
            </SelectTrigger>
            <SelectContent>
              <div className="overflow-y-scroll max-h-[200px]">
                {props.agents
                  .filter((agent) => agent.base_id === props.agentId?.baseId)
                  .map((version) => (
                    <SelectItem key={version.id} value={version.id}>
                      <div className="flex space-x-2 items-center">
                        <Badge variant="secondary">{version.user_email}</Badge>
                        <div className="text-sm text-muted-foreground">
                          {loadAndFormatDate(version.created_at)}
                        </div>
                        {version.active && (
                          <Badge className="bg-green-500 text-white">
                            active
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
              </div>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            disabled={!previousVersion || !props.activeAgent}
            onClick={() => {
              if (previousVersion) {
                props.setAgentId({
                  baseId: previousVersion.base_id,
                  versionId: previousVersion.id,
                });
                setNewVersion(null);
              }
            }}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!nextVersion || !props.activeAgent}
            onClick={() => {
              if (nextVersion) {
                props.setAgentId({
                  baseId: nextVersion.base_id,
                  versionId: nextVersion.id,
                });
                setNewVersion(null);
              }
            }}
          >
            Next
          </Button>
          <span className="text-xs text-muted-foreground">Diff</span>
          <Switch
            checked={showDiff}
            onCheckedChange={setShowDiff}
            disabled={!previousVersion || !props.activeAgent}
          />
        </div>
      </div>

      {showDiff && previousVersion && props.activeAgent ? (
        <div className="border rounded-md h-[400px] overflow-y-auto">
          <ReactDiffViewer
            oldValue={previousVersion.system_message}
            newValue={
              (newVersion?.system_message ??
                props.activeAgent.system_message) ||
              ""
            }
            splitView={false}
            hideLineNumbers
            styles={{
              diffContainer: {
                fontSize: "12px",
                fontFamily: "JetBrains Mono, monospace",
                height: "100%",
              },
            }}
          />
        </div>
      ) : (
        <HighlightedTextarea
          value={
            (newVersion?.system_message ?? props.activeAgent?.system_message) ||
            ""
          }
          onChange={(value) => {
            setNewVersion((prev) => {
              if (prev) {
                return {
                  ...prev,
                  system_message: value,
                };
              }
              return {
                ...props.activeAgent!,
                system_message: value,
              };
            });
          }}
        />
      )}

      {props.activeAgent && (
        <ToolConfigurationView
          agentId={props.activeAgent.id}
          existingToolConfiguration={
            newVersion?.tool_configuration ??
            props.activeAgent.tool_configuration ??
            {}
          }
          successCallback={(toolConfiguration) => {
            setNewVersion((prev) => {
              if (prev) {
                return { ...prev, tool_configuration: toolConfiguration };
              } else {
                return {
                  ...props.activeAgent!,
                  tool_configuration: toolConfiguration,
                };
              }
            });
          }}
        />
      )}
      {newVersion && (
        <div className="flex gap-2">
          <Button onClick={handleSaveVersion}>
            Save Version
            {saveLoading && <ReloadIcon className="w-4 h-4 animate-spin" />}
          </Button>
          <Button variant="destructive" onClick={() => setNewVersion(null)}>
            Cancel Changes
          </Button>
        </div>
      )}
    </div>
  );
};

export const AgentConfiguration = (props: {
  agentId: {
    baseId: string;
    versionId: string;
  } | null;
  setAgentId: (agentId: { baseId: string; versionId: string } | null) => void;
  agents: Agent[];
  setAgents: React.Dispatch<React.SetStateAction<Agent[]>>;
  activeAgent?: Agent;
}) => {
  return (
    <>
      {props.agents.length > 0 ? (
        <BaseAgentConfiguration {...props} />
      ) : (
        <div className="flex items-center justify-center">
          <CreateNewAgentModal
            setAgents={props.setAgents}
            setAgentId={props.setAgentId}
            triggerButtonText="Create Your First Agent"
          />
        </div>
      )}
    </>
  );
};
