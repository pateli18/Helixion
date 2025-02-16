import { useEffect, useRef, useState } from "react";
import {
  createKnowledgeBase,
  getAllKnowledgeBases,
  uploadDocuments,
} from "@/utils/apiCalls";
import { KnowledgeBase, DocumentMetadata } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useUserContext } from "@/contexts/UserContext";
import { Layout } from "@/components/Layout";
import { LoadingView } from "@/components/Loader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/table/Table";
import { ColumnDef } from "@tanstack/react-table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ClickToCopy } from "@/components/ClickToCopy";
import { loadAndFormatDate } from "@/utils/dateFormat";
import { PlusIcon, UploadIcon } from "lucide-react";
import { ReloadIcon } from "@radix-ui/react-icons";
import {
  Dialog,
  DialogTitle,
  DialogHeader,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";

const formatFileSize = (bytes: number) => {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

const FileUploadButton = (props: {
  knowledgeBaseId: string;
  setKnowledgeBases: React.Dispatch<React.SetStateAction<KnowledgeBase[]>>;
}) => {
  const { getAccessToken } = useUserContext();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);
    const accessToken = await getAccessToken();
    const newDocs = await uploadDocuments(
      files,
      props.knowledgeBaseId,
      accessToken
    );
    if (newDocs !== null) {
      props.setKnowledgeBases((prev) => {
        const updatedKnowledgeBases = prev.map((kb) => {
          if (kb.id === props.knowledgeBaseId) {
            return { ...kb, documents: [...kb.documents, ...newDocs] };
          }
          return kb;
        });
        return updatedKnowledgeBases;
      });
      toast.success("Files uploaded successfully");
    } else {
      toast.error("Failed to upload files");
    }
    setUploading(false);
  };

  return (
    <div>
      <Button onClick={handleButtonClick}>
        {uploading ? (
          <ReloadIcon className="w-4 h-4 animate-spin" />
        ) : (
          <UploadIcon className="w-4 h-4" />
        )}
        Upload Files
      </Button>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileChange}
        multiple
      />
    </div>
  );
};

const CreateNewKnowledgeBaseModal = (props: {
  setKnowledgeBases: React.Dispatch<React.SetStateAction<KnowledgeBase[]>>;
  triggerButtonText: string;
}) => {
  const { getAccessToken } = useUserContext();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const handleCreateNewKnowledgeBase = async (name: string) => {
    const accessToken = await getAccessToken();
    const response = await createKnowledgeBase(name, accessToken);
    if (response !== null) {
      props.setKnowledgeBases((prev) => [response, ...prev]);
      toast.success("Knowledge base created");
      setOpen(false);
    } else {
      toast.error("Failed to create knowledge base, please try again");
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
          <DialogTitle>Create New Knowledge Base</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Enter New Knowledge Base Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          disabled={name.length === 0}
          onClick={() => handleCreateNewKnowledgeBase(name)}
        >
          Create
        </Button>
      </DialogContent>
    </Dialog>
  );
};

const KnowledgeBaseView = (props: {
  knowledgeBases: KnowledgeBase[];
  setKnowledgeBases: React.Dispatch<React.SetStateAction<KnowledgeBase[]>>;
}) => {
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState<
    string | null
  >(null);
  const selectedKnowledgeBase = props.knowledgeBases.find(
    (kb) => kb.id === selectedKnowledgeBaseId
  );

  useEffect(() => {
    if (selectedKnowledgeBaseId === null) {
      setSelectedKnowledgeBaseId(props.knowledgeBases[0].id);
    }
  }, []);

  const columns: ColumnDef<DocumentMetadata>[] = [
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
      accessorKey: "name",
      header: "Name",
      cell: ({ row }: any) => {
        return <div>{row.original.name}</div>;
      },
    },
    {
      accessorKey: "size",
      header: "Size",
      cell: ({ row }: any) => {
        return <div>{formatFileSize(row.original.size)}</div>;
      },
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Select
          value={selectedKnowledgeBaseId ?? undefined}
          onValueChange={(value) => {
            setSelectedKnowledgeBaseId(value);
          }}
        >
          <SelectTrigger className="truncate text-ellipsis max-w-[400px]">
            <SelectValue placeholder="Select Knowledge Base" />
          </SelectTrigger>
          <SelectContent>
            <div className="overflow-y-scroll max-h-[200px]">
              {props.knowledgeBases.map((kb) => (
                <SelectItem key={kb.id} value={kb.id}>
                  {kb.name}
                </SelectItem>
              ))}
            </div>
          </SelectContent>
        </Select>
        <CreateNewKnowledgeBaseModal
          setKnowledgeBases={props.setKnowledgeBases}
          triggerButtonText="New Knowledge Base"
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="text-md text-muted-foreground">
          {selectedKnowledgeBase?.documents.length || 0} documents
        </div>
        <div className="flex items-center space-x-2">
          <FileUploadButton
            knowledgeBaseId={selectedKnowledgeBase?.id ?? ""}
            setKnowledgeBases={props.setKnowledgeBases}
          />
        </div>
      </div>
      <DataTable
        data={selectedKnowledgeBase?.documents ?? []}
        columns={columns}
      />
    </div>
  );
};

export const KnowledgeBasePage = () => {
  const { getAccessToken } = useUserContext();
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    loadKnowledgeBases();
  }, []);

  const loadKnowledgeBases = async () => {
    setDataLoading(true);
    const accessToken = await getAccessToken();
    const response = await getAllKnowledgeBases(accessToken);
    if (response) {
      setKnowledgeBases(response);
    }
    setDataLoading(false);
  };

  return (
    <Layout title="Knowledge Bases">
      {dataLoading ? (
        <LoadingView text="Loading knowledge bases..." />
      ) : knowledgeBases.length > 0 ? (
        <KnowledgeBaseView
          knowledgeBases={knowledgeBases}
          setKnowledgeBases={setKnowledgeBases}
        />
      ) : (
        <CreateNewKnowledgeBaseModal
          setKnowledgeBases={setKnowledgeBases}
          triggerButtonText="Create New Knowledge Base"
        />
      )}
    </Layout>
  );
};
