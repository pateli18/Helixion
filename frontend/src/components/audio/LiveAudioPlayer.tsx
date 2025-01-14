import { useEffect, useLayoutEffect, useRef, useState } from "react";

export const LiveAudioPlayer = (props: {
  audioRef: React.RefObject<HTMLAudioElement>;
  analyser: AnalyserNode | null;
  setAnalyser: (analyser: AnalyserNode) => void;
  isPlaying: boolean;
  setIsPlaying: (isPlaying: boolean) => void;
  speakerIntervals?: React.MutableRefObject<
    { timestamp: number; speaker: "User" | "Assistant" }[]
  >;
  audioMetadataStreamUrl?: string;
  hide?: boolean;
}) => {
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const sourceNode = useRef<MediaElementAudioSourceNode | null>(null);

  const handlePlay = () => {
    if (audioContext?.state === "suspended") {
      audioContext?.resume();
    }
    props.setIsPlaying(true);
  };

  const handlePause = () => {
    props.setIsPlaying(false);
  };

  useEffect(() => {
    // Create Audio Context
    const context = new AudioContext();
    setAudioContext(context);

    // Create Analyser Node
    const analyserNode = context.createAnalyser();
    analyserNode.fftSize = 2048;
    props.setAnalyser(analyserNode);

    return () => {
      if (context.state !== "closed") {
        props.setIsPlaying(false);
      }
      if (context.state !== "closed") {
        context.close();
      }
    };
  }, []);

  useEffect(() => {
    if (
      !props.audioRef.current ||
      !props.analyser ||
      !audioContext ||
      sourceNode.current
    )
      return;

    const audio = props.audioRef.current;
    sourceNode.current = audioContext.createMediaElementSource(audio);
    sourceNode.current.connect(props.analyser);
    props.analyser.connect(audioContext.destination);
    return () => {
      if (sourceNode.current) {
        sourceNode.current.disconnect();
      }
    };
  }, [props.analyser, audioContext, props.audioRef]);

  return (
    <audio
      ref={props.audioRef}
      className={`w-full ${props.hide ? "hidden" : ""}`}
      autoPlay
      onPlay={handlePlay}
      onPause={handlePause}
    />
  );
};
