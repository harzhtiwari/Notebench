"use client";
export { Archive } from "@phosphor-icons/react/Archive";
export { ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
export { ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
export { ArrowDown } from "@phosphor-icons/react/ArrowDown";
export { ArrowLineLeft } from "@phosphor-icons/react/ArrowLineLeft";
export { ArrowLineRight } from "@phosphor-icons/react/ArrowLineRight";
export { ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";
export { ArrowUp } from "@phosphor-icons/react/ArrowUp";
export { ArrowUUpLeft } from "@phosphor-icons/react/ArrowUUpLeft";
export { BookBookmark } from "@phosphor-icons/react/BookBookmark";
export { Bookmarks } from "@phosphor-icons/react/Bookmarks";
export { BookOpen } from "@phosphor-icons/react/BookOpen";
export { Cards } from "@phosphor-icons/react/Cards";
export { CaretDown } from "@phosphor-icons/react/CaretDown";
export { CaretRight } from "@phosphor-icons/react/CaretRight";
export { ChartBar } from "@phosphor-icons/react/ChartBar";
export { Check } from "@phosphor-icons/react/Check";
export { CheckCircle } from "@phosphor-icons/react/CheckCircle";
export { CheckSquare } from "@phosphor-icons/react/CheckSquare";
export { Circle } from "@phosphor-icons/react/Circle";
export { CircleNotch } from "@phosphor-icons/react/CircleNotch";
export { ClockCounterClockwise } from "@phosphor-icons/react/ClockCounterClockwise";
export { Copy } from "@phosphor-icons/react/Copy";
export { Database } from "@phosphor-icons/react/Database";
export { Desktop } from "@phosphor-icons/react/Desktop";
export { DotsThree } from "@phosphor-icons/react/DotsThree";
export { DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
export { Download } from "@phosphor-icons/react/Download";
export { DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
export { Eye } from "@phosphor-icons/react/Eye";
export { EyeSlash } from "@phosphor-icons/react/EyeSlash";
export { FileDoc } from "@phosphor-icons/react/FileDoc";
export { FilePdf } from "@phosphor-icons/react/FilePdf";
export { FileText } from "@phosphor-icons/react/FileText";
export { FileZip } from "@phosphor-icons/react/FileZip";
export { FlipHorizontal } from "@phosphor-icons/react/FlipHorizontal";
export { Gear } from "@phosphor-icons/react/Gear";
export { GitBranch } from "@phosphor-icons/react/GitBranch";
export { Globe } from "@phosphor-icons/react/Globe";
export { GridFour } from "@phosphor-icons/react/GridFour";
export { HardDrive } from "@phosphor-icons/react/HardDrive";
export { Heartbeat } from "@phosphor-icons/react/Heartbeat";
export { Info } from "@phosphor-icons/react/Info";
export { Key } from "@phosphor-icons/react/Key";
export { Link } from "@phosphor-icons/react/Link";
export { List } from "@phosphor-icons/react/List";
export { ListChecks } from "@phosphor-icons/react/ListChecks";
export { Lock } from "@phosphor-icons/react/Lock";
export { LockSimple } from "@phosphor-icons/react/LockSimple";
export { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
export { Moon } from "@phosphor-icons/react/Moon";
export { Notebook } from "@phosphor-icons/react/Notebook";
export { PaperPlaneRight } from "@phosphor-icons/react/PaperPlaneRight";
export { PencilSimple } from "@phosphor-icons/react/PencilSimple";
export { Plus } from "@phosphor-icons/react/Plus";
export { PresentationChart } from "@phosphor-icons/react/PresentationChart";
export { Question } from "@phosphor-icons/react/Question";
export { Quotes } from "@phosphor-icons/react/Quotes";
export { ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
export { SidebarSimple } from "@phosphor-icons/react/SidebarSimple";
export { Slideshow } from "@phosphor-icons/react/Slideshow";
export { Sparkle } from "@phosphor-icons/react/Sparkle";
export { Square } from "@phosphor-icons/react/Square";
export { Sun } from "@phosphor-icons/react/Sun";
export { Trash } from "@phosphor-icons/react/Trash";
export { TreeStructure } from "@phosphor-icons/react/TreeStructure";
export { Upload } from "@phosphor-icons/react/Upload";
export { VideoCamera } from "@phosphor-icons/react/VideoCamera";
export { Warning } from "@phosphor-icons/react/Warning";
export { WarningCircle } from "@phosphor-icons/react/WarningCircle";
export { Waveform } from "@phosphor-icons/react/Waveform";
export { X } from "@phosphor-icons/react/X";
export { XCircle } from "@phosphor-icons/react/XCircle";

export type IconSizeVariant = "sm" | "md" | "lg" | 16 | 20 | 24;
export type IconWeightVariant = "regular" | "bold" | "fill";

export interface NbIconResolverOptions {
  size?: IconSizeVariant | undefined;
  weight?: IconWeightVariant | undefined;
  active?: boolean | undefined;
}

export function resolveIconProps({
  size = "md",
  weight,
  active = false,
}: NbIconResolverOptions = {}) {
  const pixelSize =
    size === "sm" || size === 16 ? 16 : size === "lg" || size === 24 ? 24 : 20;

  // Invariant: 16px is strictly bold unless active or explicitly fill.
  // 20px/24px defaults to regular, fill when active, or caller explicit weight.
  let resolvedWeight: IconWeightVariant;
  if (pixelSize === 16) {
    resolvedWeight = weight === "fill" || (active && !weight) ? "fill" : "bold";
  } else {
    resolvedWeight = weight ?? (active ? "fill" : "regular");
  }

  return {
    size: pixelSize,
    weight: resolvedWeight,
    "aria-hidden": true as const,
  };
}
