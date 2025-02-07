import Markdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import remarkGfm from "remark-gfm";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PhoneCallMetadata } from "@/types";

const extractTag = (message: string, tag: string): string[] => {
  const tagRegex = new RegExp(` ?<${tag}>(.*?)<\/${tag}> ?`, "g");
  const matches = message
    .match(tagRegex)
    ?.map((group) => group.split(">")[1].split("<")[0]);

  return matches ?? [];
};

const formatCitationText = (
  text: string,
  replaceFormat: (citationId: string, index: number) => string
) => {
  let fmtText = text;
  const citationIdsRaw = extractTag(text, "citation");
  const citationIds = citationIdsRaw
    .map((citationId) => citationId.split(","))
    .flatMap((citation) => citation);

  citationIds
    .filter((citationId) => citationId.length > 0)
    .forEach((citationId, i) => {
      const regex = new RegExp(`(${citationId})(?!~)`, "g");
      fmtText = fmtText.replace(regex, replaceFormat(citationId, i));
    });

  fmtText = fmtText.replaceAll("<citation>", "");
  fmtText = fmtText.replaceAll("</citation>", "");
  fmtText = fmtText.replaceAll("~,~", "~ ~");

  return fmtText;
};

export const MarkdownCitationDisplay = (props: {
  text: string;
  phoneMetadata: PhoneCallMetadata[];
  onCitationClick: (citationId: string) => void;
}) => {
  const { text, onCitationClick, phoneMetadata } = props;
  const fmtText = formatCitationText(
    text,
    (citationId, i) => `~${i + 1}<>${citationId}~`
  );

  const processedText = fmtText.replace(/\\n/g, "\n");

  return (
    <Markdown
      className="prose"
      remarkPlugins={[remarkGfm]}
      components={{
        del: ({ node, ...props }) => {
          const [index, citationId] = (props.children as string).split("<>");
          const cleanCitationId = citationId.trim();
          const phoneCall = phoneMetadata.find(
            (phoneCall) => phoneCall.id === cleanCitationId
          );

          const badge = (
            <Tooltip>
              <TooltipTrigger>
                <Badge
                  variant="default"
                  className="text-xs hover:bg-gray-100 hover:text-black cursor-pointer"
                  onClick={() => onCitationClick(cleanCitationId)}
                >
                  {index}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {phoneCall && (
                  <div className="space-y-2 text-xs">
                    <div className="font-semibold truncate ellipsis">
                      {phoneCall.from_phone_number}
                    </div>
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
          );
          return badge;
        },
      }}
    >
      {processedText}
    </Markdown>
  );
};
