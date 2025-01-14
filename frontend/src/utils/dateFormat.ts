import { format } from "date-fns";

export const formatTime = (time: number) => {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const localizeDate = (rawDateString: string) => {
  let date = new Date(rawDateString);

  // convert date from utc to local
  date = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);

  return date;
};

export const loadAndFormatDate = (rawDateString: string) => {
  // Parse the ISO format date
  const date = localizeDate(rawDateString);

  // Format the date in a human-readable format
  const formattedDate = format(date, "MMM d, yyyy h:mm a");

  return formattedDate;
};

export const formatDuration = (seconds: number) => {
  if (!seconds) return "";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (remainingSeconds > 0 || parts.length === 0)
    parts.push(`${remainingSeconds}s`);

  return parts.join(" ");
};
