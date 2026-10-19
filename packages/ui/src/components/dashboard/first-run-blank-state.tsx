import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetContent } from "../primitives/surface.js";
import { Button } from "../primitives/button.js";
import { NotebookIcon, PlusIcon, resolveIconProps } from "../primitives/icons.js";

export interface FirstRunBlankStateProps {
  onCreateNotebook?: (() => void) | undefined;
}

export function FirstRunBlankState({ onCreateNotebook }: FirstRunBlankStateProps) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <Sheet className="w-full max-w-[var(--nb-layout-modal-sm)] border-[var(--nb-edge)] bg-[var(--nb-sheet)] text-center p-6">
        <SheetHeader className="items-center p-0 mb-4">
          <div className="mb-3 flex h-[var(--nb-size-logo)] w-[var(--nb-size-logo)] items-center justify-center rounded-[var(--nb-radius-chip)] bg-[var(--nb-well)] text-[var(--nb-ink)]">
            <NotebookIcon {...resolveIconProps({ size: "lg" })} />
          </div>
          <SheetTitle className="text-xl font-semibold text-[var(--nb-ink)]">
            Welcome to Notebench
          </SheetTitle>
          <SheetDescription className="mt-2 text-sm text-[var(--nb-ink-2)]">
            Your private, source-grounded research workspace. Create your first notebook
            to start uploading documents and generating living artifacts.
          </SheetDescription>
        </SheetHeader>
        <SheetContent className="p-0 pt-2 flex justify-center">
          <Button
            size="nb_btn_lg"
            leadingIcon={PlusIcon}
            onClick={onCreateNotebook}
          >
            + Create Notebook
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  );
}
