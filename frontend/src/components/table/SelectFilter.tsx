import React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MultiSelectControl } from "../ui/MultiSelectControl";

export const SearchFilter = React.forwardRef<
  HTMLInputElement,
  {
    searchTerm: string;
    setSearchTerm: (searchTerm: string) => void;
    placeholder: string;
    className?: string;
  }
>(({ className, ...props }, ref) => {
  const [inputValue, setInputValue] = React.useState(props.searchTerm);
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const onSearchChange = React.useCallback(
    (e: any) => {
      const value = e.target.value;
      setInputValue(value);
      // Clear the previous timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      // Set a new timeout to update the search term after 1 second
      searchTimeoutRef.current = setTimeout(() => {
        props.setSearchTerm(value);
      }, 300);
    },
    [props.setSearchTerm]
  );

  return (
    <div>
      <Input
        type="search"
        placeholder={props.placeholder}
        className={cn("inline", className)}
        onChange={onSearchChange}
        value={inputValue}
      />
    </div>
  );
});

export const SelectFilter = (props: {
  title: string;
  filterCounts: Record<string, number>;
  activeFilter: string[];
  setActiveFilter: React.Dispatch<React.SetStateAction<string[]>>;
  nameFormatter?: (name: string) => string;
  disableClear?: boolean;
}) => {
  return (
    <MultiSelectControl
      title={props.title}
      items={Object.entries(props.filterCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({
          id: value,
          name: props.nameFormatter ? props.nameFormatter(value) : value,
          count: count,
        }))}
      selectedItems={props.activeFilter.map((value) => ({
        id: value,
        name: props.nameFormatter ? props.nameFormatter(value) : value,
      }))}
      selectItem={(item, isSelected) => {
        if (isSelected) {
          // find doc type
          props.setActiveFilter((prev) => [...prev, item.id]);
        } else {
          props.setActiveFilter((prev) =>
            prev.filter((value) => value !== item.id)
          );
        }
      }}
      clearSelectedItems={() => {
        if (!props.disableClear) {
          props.setActiveFilter([]);
        }
      }}
      selectAll={() => {
        props.setActiveFilter(Object.keys(props.filterCounts));
      }}
      selectItemOnly={(item) => {
        props.setActiveFilter([item.id]);
      }}
    />
  );
};

export const getFilterCounts = (filterValuesAll: string[]) => {
  const filterCounts: Record<string, number> = filterValuesAll.reduce(
    (acc, value) => {
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  return filterCounts;
};
