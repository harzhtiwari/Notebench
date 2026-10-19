"use client";
export { ArchiveIcon } from "@phosphor-icons/react/Archive";
export { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
export { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ArrowCounterClockwise";
export { ArrowDownIcon } from "@phosphor-icons/react/ArrowDown";
export { ArrowLineLeftIcon } from "@phosphor-icons/react/ArrowLineLeft";
export { ArrowLineRightIcon } from "@phosphor-icons/react/ArrowLineRight";
export { ArrowRightIcon } from "@phosphor-icons/react/ArrowRight";
export { ArrowsClockwiseIcon } from "@phosphor-icons/react/ArrowsClockwise";
export { ArrowUpIcon } from "@phosphor-icons/react/ArrowUp";
export { ArrowUUpLeftIcon } from "@phosphor-icons/react/ArrowUUpLeft";
export { BookBookmarkIcon } from "@phosphor-icons/react/BookBookmark";
export { BookmarksIcon } from "@phosphor-icons/react/Bookmarks";
export { BookOpenIcon } from "@phosphor-icons/react/BookOpen";
export { CardsIcon } from "@phosphor-icons/react/Cards";
export { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
export { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
export { ChartBarIcon } from "@phosphor-icons/react/ChartBar";
export { CheckIcon } from "@phosphor-icons/react/Check";
export { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
export { CheckSquareIcon } from "@phosphor-icons/react/CheckSquare";
export { CircleIcon } from "@phosphor-icons/react/Circle";
export { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
export { ClockCounterClockwiseIcon } from "@phosphor-icons/react/ClockCounterClockwise";
export { CopyIcon } from "@phosphor-icons/react/Copy";
export { DatabaseIcon } from "@phosphor-icons/react/Database";
export { DesktopIcon } from "@phosphor-icons/react/Desktop";
export { DiamondsFourIcon } from "@phosphor-icons/react/DiamondsFour";
export { DotsThreeIcon } from "@phosphor-icons/react/DotsThree";
export { DotsThreeVerticalIcon } from "@phosphor-icons/react/DotsThreeVertical";
export { DownloadIcon } from "@phosphor-icons/react/Download";
export { DownloadSimpleIcon } from "@phosphor-icons/react/DownloadSimple";
export { EyeIcon } from "@phosphor-icons/react/Eye";
export { EyeSlashIcon } from "@phosphor-icons/react/EyeSlash";
export { FileDocIcon } from "@phosphor-icons/react/FileDoc";
export { FilePdfIcon } from "@phosphor-icons/react/FilePdf";
export { FileTextIcon } from "@phosphor-icons/react/FileText";
export { FileZipIcon } from "@phosphor-icons/react/FileZip";
export { FlipHorizontalIcon } from "@phosphor-icons/react/FlipHorizontal";
export { GearIcon } from "@phosphor-icons/react/Gear";
export { GitBranchIcon } from "@phosphor-icons/react/GitBranch";
export { GlobeIcon } from "@phosphor-icons/react/Globe";
export { GridFourIcon } from "@phosphor-icons/react/GridFour";
export { HardDriveIcon } from "@phosphor-icons/react/HardDrive";
export { HardDrivesIcon } from "@phosphor-icons/react/HardDrives";
export { HeartbeatIcon } from "@phosphor-icons/react/Heartbeat";
export { HouseIcon } from "@phosphor-icons/react/House";
export { HouseLineIcon } from "@phosphor-icons/react/HouseLine";
export { InfoIcon } from "@phosphor-icons/react/Info";
export { KeyIcon } from "@phosphor-icons/react/Key";
export { LinkIcon } from "@phosphor-icons/react/Link";
export { ListIcon } from "@phosphor-icons/react/List";
export { ListChecksIcon } from "@phosphor-icons/react/ListChecks";
export { LockIcon } from "@phosphor-icons/react/Lock";
export { LockKeyOpenIcon } from "@phosphor-icons/react/LockKeyOpen";
export { LockSimpleIcon } from "@phosphor-icons/react/LockSimple";
export { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
export { MoonIcon } from "@phosphor-icons/react/Moon";
export { NotebookIcon } from "@phosphor-icons/react/Notebook";
export { PaperPlaneRightIcon } from "@phosphor-icons/react/PaperPlaneRight";
export { PencilSimpleIcon } from "@phosphor-icons/react/PencilSimple";
export { PlusIcon } from "@phosphor-icons/react/Plus";
export { PresentationChartIcon } from "@phosphor-icons/react/PresentationChart";
export { QuestionIcon } from "@phosphor-icons/react/Question";
export { QuotesIcon } from "@phosphor-icons/react/Quotes";
export { ShieldCheckIcon } from "@phosphor-icons/react/ShieldCheck";
export { SidebarSimpleIcon } from "@phosphor-icons/react/SidebarSimple";
export { SlideshowIcon } from "@phosphor-icons/react/Slideshow";
export { SparkleIcon } from "@phosphor-icons/react/Sparkle";
export { SquareIcon } from "@phosphor-icons/react/Square";
export { SunIcon } from "@phosphor-icons/react/Sun";
export { TrashIcon } from "@phosphor-icons/react/Trash";
export { TreeStructureIcon } from "@phosphor-icons/react/TreeStructure";
export { UploadIcon } from "@phosphor-icons/react/Upload";
export { VideoCameraIcon } from "@phosphor-icons/react/VideoCamera";
export { WarningIcon } from "@phosphor-icons/react/Warning";
export { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
export { WaveformIcon } from "@phosphor-icons/react/Waveform";
export { XIcon } from "@phosphor-icons/react/X";
export { XCircleIcon } from "@phosphor-icons/react/XCircle";

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
    size === "sm" || size === 16 ? 16 : (size === "lg" || size === 24 ? 24 : 20);

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
