import { CheckIcon, ChevronDownIcon } from "@radix-ui/react-icons";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MutableRefObject, useState } from "react";

interface Item {
  id: string;
  name: string;
  group?: string;
  count?: number;
}

const SelectItem = (props: {
  item: Item;
  selectItem: (item: Item, isSelected: boolean) => void;
  limitOne?: boolean;
  selectedItems: Item[];
  selectItemOnly?: (item: Item) => void;
}) => {
  const [showOnly, setShowOnly] = useState(false);
  const isSelected = props.selectedItems
    .map((i) => i.id)
    .includes(props.item.id);
  return (
    <CommandItem
      key={props.item.id}
      onSelect={() => {
        if (props.limitOne && props.selectedItems.length >= 1 && !isSelected) {
          for (const selectedItem of props.selectedItems) {
            props.selectItem(selectedItem, false);
          }
        }
        props.selectItem(props.item, !isSelected);
      }}
      onMouseEnter={() => {
        setShowOnly(true);
      }}
      onMouseLeave={() => {
        setShowOnly(false);
      }}
    >
      <div
        className={cn(
          "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
          isSelected
            ? "bg-primary text-primary-foreground"
            : "opacity-50 [&_svg]:invisible"
        )}
      >
        <CheckIcon className="h-4 w-4" />
      </div>
      <div className="flex items-center justify-between w-full">
        <div className="overflow-hidden text-ellipsis truncate w-[270px]">
          {props.item.name}
        </div>
        <div className="flex items-center space-x-2">
          {props.selectItemOnly && showOnly && (
            <Badge
              variant="default"
              className="text-xs hover:cursor-pointer h-5"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (props.selectItemOnly) {
                  props.selectItemOnly(props.item);
                }
              }}
            >
              Only
            </Badge>
          )}
          {props.item.count && (
            <div className="text-muted-foreground">{props.item.count}</div>
          )}
        </div>
      </div>
    </CommandItem>
  );
};

const GroupHeading = (props: {
  group: string;
  selectGroupOnly: (group: string) => void;
}) => {
  const [showOnly, setShowOnly] = useState(false);
  return (
    <div
      className="flex items-center justify-between w-full hover:bg-gray-100"
      onMouseEnter={() => {
        setShowOnly(true);
      }}
      onMouseLeave={() => {
        setShowOnly(false);
      }}
    >
      <div className="overflow-hidden text-ellipsis truncate w-[270px] text-gray-500 text-xs">
        {props.group}
      </div>
      {showOnly && (
        <Badge
          variant="default"
          className="text-xs hover:cursor-pointer h-4"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            props.selectGroupOnly(props.group);
          }}
        >
          Only
        </Badge>
      )}
    </div>
  );
};

const BaseCommand = (props: {
  title: string;
  items: Item[];
  selectedItems: Item[];
  selectItem: (item: Item, isSelected: boolean) => void;
  selectItemOnly?: (item: Item) => void;
  selectGroupOnly?: (group: string) => void;
  clearSelectedItems: () => void;
  limitOne?: boolean;
  selectAll?: () => void;
  children?: React.ReactNode;
}) => {
  const itemGroups = props.items.reduce((acc: Record<string, Item[]>, item) => {
    const group = item.group || "";
    acc[group] = acc[group] || [];
    acc[group].push(item);
    return acc;
  }, {});

  return (
    <>
      <CommandInput placeholder={props.title} />
      <div className="flex items-center border-t">
        {props.children}
        {props.selectAll && (
          <Button
            variant="ghost"
            onClick={() => {
              if (props.selectAll) {
                props.selectAll();
              }
            }}
            className="justify-center text-center w-full font-light text-sm text-muted-foreground"
          >
            Select All
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            props.clearSelectedItems();
          }}
          className="justify-center text-center w-full font-light text-sm text-muted-foreground"
        >
          Clear
        </Button>
      </div>
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {Object.entries(itemGroups).map(([group, items]) => (
          <CommandGroup
            key={group}
            heading={
              props.selectGroupOnly && group
                ? GroupHeading({
                    group,
                    selectGroupOnly: props.selectGroupOnly,
                  })
                : group
            }
          >
            {items.map((item) => {
              return (
                <SelectItem
                  key={item.id}
                  item={item}
                  selectItem={props.selectItem}
                  limitOne={props.limitOne}
                  selectedItems={props.selectedItems}
                  selectItemOnly={props.selectItemOnly}
                />
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </>
  );
};

export const MultiSelectControl = (props: {
  title: string;
  items: Item[];
  selectedItems: Item[];
  selectItem: (item: Item, isSelected: boolean) => void;
  clearSelectedItems: () => void;
  limitOne?: boolean;
  modal?: boolean;
  selectAll?: () => void;
  selectItemOnly?: (item: Item) => void;
  selectGroupOnly?: (group: string) => void;
  container?: MutableRefObject<HTMLDivElement | null>;
}) => {
  return (
    <Popover modal={props.modal}>
      <div className="flex items-center space-x-1">
        <PopoverTrigger asChild>
          <Button variant="outline">
            {props.title}
            <ChevronDownIcon className="ml-2 h-4 w-4" />
          </Button>
        </PopoverTrigger>
        {props.selectedItems.length > 0 && (
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="default" className="text-xs">
                {props.selectedItems.length}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1">
                {props.selectedItems.map((item) => (
                  <div key={item.id} className="text-left">
                    {item.name}
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <PopoverContent
        className="w-[400px] p-0"
        align="start"
        container={props.container?.current}
      >
        <Command>
          <BaseCommand {...props} />
        </Command>
      </PopoverContent>
    </Popover>
  );
};
