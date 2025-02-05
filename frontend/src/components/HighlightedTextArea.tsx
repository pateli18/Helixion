import { useState, useRef, useEffect } from "react";

export const HighlightedTextarea = (props: {
  value: string;
  onChange: (value: string) => void;
}) => {
  const [highlights, setHighlights] = useState<
    { start: number; end: number; color: string }[]
  >([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Extract highlighting logic into separate function
  const updateHighlights = (text: string) => {
    const regex = /\{[^}]*\}/g;
    const newHighlights: { start: number; end: number; color: string }[] = [];

    let match;
    while ((match = regex.exec(text)) !== null) {
      newHighlights.push({
        start: match.index,
        end: match.index + match[0].length,
        color: "bg-[#DDEA68]",
      });
    }

    setHighlights(newHighlights);
  };

  // Add useEffect to run highlighting on initial render
  useEffect(() => {
    updateHighlights(props.value);
  }, [props.value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    props.onChange(newText);
    updateHighlights(newText);
  };

  const handleScroll = () => {
    if (overlayRef.current && textareaRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
      overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const getHighlightedContent = () => {
    let result = [];
    let currentPosition = 0;

    highlights.forEach((highlight, index) => {
      // Add unhighlighted text before this highlight
      if (currentPosition < highlight.start) {
        result.push(
          <span key={`text-${index}`}>
            {props.value.slice(currentPosition, highlight.start)}
          </span>
        );
      }

      // Add highlighted text
      result.push(
        <span key={`highlight-${index}`} className={highlight.color}>
          {props.value.slice(highlight.start, highlight.end)}
        </span>
      );

      currentPosition = highlight.end;
    });

    // Add remaining unhighlighted text
    if (currentPosition < props.value.length) {
      result.push(
        <span key="text-end">{props.value.slice(currentPosition)}</span>
      );
    }

    return result;
  };

  return (
    <div className="relative w-full h-[400px] border rounded-md shadow-sm p-4 bg-white">
      {/* Overlay div for highlights */}
      <div
        ref={overlayRef}
        className="absolute top-0 left-0 w-full h-full p-2 text-transparent pointer-events-none whitespace-pre-wrap break-words overflow-auto font-mongo text-[14px] leading-[1.4]"
      >
        {getHighlightedContent()}
      </div>

      {/* Actual textarea */}
      <textarea
        ref={textareaRef}
        value={props.value}
        onChange={handleTextChange}
        onScroll={handleScroll}
        className="absolute top-0 left-0 w-full h-full p-2 text-black bg-transparent resize-none font-mongo text-[14px] leading-[1.4]"
        style={{
          caretColor: "black",
        }}
        placeholder="Type something..."
      />
    </div>
  );
};
