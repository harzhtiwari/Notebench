import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetContent } from "../primitives/surface.js";
import { Button } from "../primitives/button.js";
import { Notebook, Plus } from "../primitives/icons.js";

export interface FirstRunBlankStateProps {
  onCreateNotebook?: (() => void) | undefined;
}

export function FirstRunBlankState({ onCreateNotebook }: FirstRunBlankStateProps) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <Sheet className="max-w-md w-full border-[var(--nb-edge)] bg-[var(--nb-sheet)] text-center p-6 shadow-sm">
        <SheetHeader className="items-center p-0 mb-4">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--nb-well)] text-[var(--nb-ink)]">
            <Notebook size={26} weight="duotone" />
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
            size="lg"
            onClick={onCreateNotebook}
            className="h-10 px-6 font-medium shadow-xs flex items-center gap-2"
          >
            <Plus size={16} weight="bold" />
            + Create Notebook
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  );
}
