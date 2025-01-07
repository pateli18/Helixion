import { Loader2 } from "lucide-react";

export const LoadingView = (props: { text: string }) => (
  <div className="flex flex-col justify-center items-center pt-2">
    <Loader2 className="h-8 w-8 animate-spin" />
    <div className="mt-4 text-lg text-gray-600">{props.text}</div>
  </div>
);
