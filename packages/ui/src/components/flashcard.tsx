import * as React from "react";
import type { FlashcardItem } from "@notebook/contracts";
import { Button } from "./button.js";
import {
  FlipHorizontal,
  CheckCircle,
  XCircle,
  PencilSimple,
  Trash,
} from "./icons.js";
import { cn } from "../lib/utils.js";

export interface FlashcardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> {
  card: FlashcardItem;
  flipped?: boolean | undefined;
  onFlip?: (() => void) | undefined;
  isKnown?: boolean | undefined;
  onMarkKnown?: (() => void) | undefined;
  onMarkUnknown?: (() => void) | undefined;
  isEditing?: boolean | undefined;
  onEditToggle?: (() => void) | undefined;
  onSave?: ((updated: { front: string; back: string }) => void) | undefined;
  onDelete?: (() => void) | undefined;
}

/**
 * Interactive Flashcard Component (ticket 15, Decision 4.8).
 * Supports study runner with 3D-ready flip state, known / unknown ratings,
 * and inline structured front/back editing.
 */
export const Flashcard = React.forwardRef<HTMLDivElement, FlashcardProps>(
  (
    {
      className,
      card,
      flipped = false,
      onFlip,
      isKnown,
      onMarkKnown,
      onMarkUnknown,
      isEditing = false,
      onEditToggle,
      onSave,
      onDelete,
      ...props
    },
    ref
  ) => {
    const [editFront, setEditFront] = React.useState(card.front);
    const [editBack, setEditBack] = React.useState(card.back);

    // Keep state synchronized if card prop updates
    React.useEffect(() => {
      setEditFront(card.front);
      setEditBack(card.back);
    }, [card.front, card.back]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (isEditing) return;
      if (e.key === " " || e.key === "Enter") {
        // Prevent default space scroll when focused on card surface
        if (e.target === e.currentTarget) {
          e.preventDefault();
          onFlip?.();
        }
      }
    };

    const handleSave = () => {
      onSave?.({ front: editFront, back: editBack });
    };

    if (isEditing) {
      return (
        <div
          ref={ref}
          role="region"
          aria-label="Edit flashcard"
          className={cn(
            "grid gap-[var(--nb-space-3)] rounded-[var(--nb-radius-card)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] p-[var(--nb-space-4)] text-[var(--nb-ink)]",
            className
          )}
          {...props}
        >
          <div className="flex items-center justify-between border-b border-[var(--nb-hairline)] pb-[var(--nb-space-2)]">
            <span className="text-xs font-semibold text-[var(--nb-ink-3)] uppercase tracking-wider">
              Edit Card
            </span>
            {onDelete !== undefined ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                aria-label="Delete card"
                className="h-[var(--nb-size-control-sm)] text-[var(--nb-danger)] hover:bg-[var(--nb-danger-wash)]"
              >
                <Trash size={14} aria-hidden="true" />
                Delete
              </Button>
            ) : null}
          </div>

          <div className="grid gap-[var(--nb-space-2)]">
            <label
              htmlFor={`flashcard-front-${card.id}`}
              className="text-xs font-medium text-[var(--nb-ink-2)]"
            >
              Front
            </label>
            <textarea
              id={`flashcard-front-${card.id}`}
              value={editFront}
              onChange={(e) => setEditFront(e.target.value)}
              rows={3}
              className="w-full rounded-[var(--nb-radius-well)] border border-[var(--nb-hairline)] bg-[var(--nb-well)] p-[var(--nb-space-2)] font-[var(--nb-font-ui)] text-sm text-[var(--nb-ink)] focus:outline-none focus:ring-[var(--nb-ring-width)] focus:ring-[var(--nb-focus)]"
            />
          </div>

          <div className="grid gap-[var(--nb-space-2)]">
            <label
              htmlFor={`flashcard-back-${card.id}`}
              className="text-xs font-medium text-[var(--nb-ink-2)]"
            >
              Back
            </label>
            <textarea
              id={`flashcard-back-${card.id}`}
              value={editBack}
              onChange={(e) => setEditBack(e.target.value)}
              rows={3}
              className="w-full rounded-[var(--nb-radius-well)] border border-[var(--nb-hairline)] bg-[var(--nb-well)] p-[var(--nb-space-2)] font-[var(--nb-font-ui)] text-sm text-[var(--nb-ink)] focus:outline-none focus:ring-[var(--nb-ring-width)] focus:ring-[var(--nb-focus)]"
            />
          </div>

          <div className="flex items-center justify-end gap-[var(--nb-space-2)] pt-[var(--nb-space-2)]">
            {onEditToggle !== undefined ? (
              <Button variant="ghost" size="sm" onClick={onEditToggle}>
                Cancel
              </Button>
            ) : null}
            <Button variant="default" size="sm" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div
        ref={ref}
        role="region"
        tabIndex={0}
        aria-label={`Flashcard: ${flipped ? "Back side" : "Front side"}`}
        onKeyDown={handleKeyDown}
        className={cn(
          "grid min-h-[var(--nb-size-composer-min)] grid-rows-[auto_1fr_auto] gap-[var(--nb-space-3)] rounded-[var(--nb-radius-card)] border border-[var(--nb-hairline)] bg-[var(--nb-sheet)] p-[var(--nb-space-4)] text-[var(--nb-ink)] transition-shadow duration-[var(--nb-dur-base)] hover:border-[var(--nb-edge)] focus-visible:outline-[var(--nb-ring-width)] focus-visible:outline-[var(--nb-focus)]",
          className
        )}
        {...props}
      >
        {/* Top Header: Side Indicator + Status + Edit Affordance */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-[var(--nb-space-2)]">
            <span className="inline-flex items-center gap-[var(--nb-space-1)] rounded-[var(--nb-radius-chip)] bg-[var(--nb-well)] px-[var(--nb-space-2)] py-[var(--nb-space-0-5)] text-xs font-semibold text-[var(--nb-ink-2)]">
              <FlipHorizontal size={14} aria-hidden="true" />
              {flipped ? "Back" : "Front"}
            </span>
            {isKnown === true ? (
              <span className="inline-flex items-center gap-[var(--nb-space-1)] rounded-[var(--nb-radius-chip)] bg-[var(--nb-ok-wash)] px-[var(--nb-space-2)] py-[var(--nb-space-0-5)] text-xs font-semibold text-[var(--nb-ok)]">
                <CheckCircle size={14} weight="fill" aria-hidden="true" />
                Known
              </span>
            ) : isKnown === false ? (
              <span className="inline-flex items-center gap-[var(--nb-space-1)] rounded-[var(--nb-radius-chip)] bg-[var(--nb-warn-wash)] px-[var(--nb-space-2)] py-[var(--nb-space-0-5)] text-xs font-semibold text-[var(--nb-warn)]">
                <XCircle size={14} weight="fill" aria-hidden="true" />
                Still learning
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-[var(--nb-space-1)]">
            {onEditToggle !== undefined ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onEditToggle}
                aria-label="Edit card"
                className="h-[var(--nb-size-control-sm)] w-[var(--nb-size-control-sm)] p-0"
              >
                <PencilSimple size={14} aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>

        {/* Content Body */}
        <div
          onClick={onFlip}
          className="flex cursor-pointer flex-col items-center justify-center p-[var(--nb-space-4)] text-center select-none"
        >
          <p className="font-[var(--nb-font-read)] text-[var(--nb-text-lg)] leading-[var(--nb-leading-read)] text-[var(--nb-ink)]">
            {flipped ? card.back : card.front}
          </p>
        </div>

        {/* Bottom Actions: Known / Unknown + Flip trigger */}
        <div className="flex flex-wrap items-center justify-between gap-[var(--nb-space-2)] border-t border-[var(--nb-hairline)] pt-[var(--nb-space-2)]">
          <div className="flex items-center gap-[var(--nb-space-2)]">
            {onMarkUnknown !== undefined ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onMarkUnknown}
                aria-label="Mark as unknown"
                className="h-[var(--nb-size-control-sm)] px-[var(--nb-space-2)] text-xs text-[var(--nb-warn)] hover:bg-[var(--nb-warn-wash)]"
              >
                <XCircle size={14} aria-hidden="true" />
                Still learning
              </Button>
            ) : null}
            {onMarkKnown !== undefined ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onMarkKnown}
                aria-label="Mark as known"
                className="h-[var(--nb-size-control-sm)] px-[var(--nb-space-2)] text-xs text-[var(--nb-ok)] hover:bg-[var(--nb-ok-wash)]"
              >
                <CheckCircle size={14} aria-hidden="true" />
                Mark as known
              </Button>
            ) : null}
          </div>

          {onFlip !== undefined ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onFlip}
              aria-label="Flip card"
              className="h-[var(--nb-size-control-sm)] gap-[var(--nb-space-1)] text-xs"
            >
              <FlipHorizontal size={14} aria-hidden="true" />
              Flip
            </Button>
          ) : null}
        </div>
      </div>
    );
  }
);

Flashcard.displayName = "Flashcard";
