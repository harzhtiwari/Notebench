import * as React from "react";
import type { FlashcardItem } from "@notebench/contracts";
import {
  Badge,
  Button,
  Card,
  FormField,
  IconButton,
  Textarea,
} from "../primitives/index.js";
import {
  FlipHorizontal,
  CheckCircle,
  XCircle,
  PencilSimple,
  Trash,
} from "../primitives/icons.js";
import { cn } from "../../lib/utils.js";

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
        <Card
          ref={ref}
          role="region"
          aria-label="Edit flashcard"
          className={cn("grid gap-[var(--nb-space-3)]", className)}
          {...props}
        >
          <div className="flex items-center justify-between border-b border-[var(--nb-hairline)] pb-[var(--nb-space-2)]">
            <span className="text-xs font-semibold text-[var(--nb-ink-3)]">
              Edit Card
            </span>
            {onDelete !== undefined ? (
              <Button
                variant="nb_btn_ghost"
                size="nb_btn_sm"
                onClick={onDelete}
                aria-label="Delete card"
                leadingIcon={Trash}
                className="text-[var(--nb-danger)] hover:bg-[var(--nb-danger-wash)]"
              >
                Delete
              </Button>
            ) : null}
          </div>

          <FormField label="Front">
            <Textarea
              id={`flashcard-front-${card.id}`}
              value={editFront}
              onChange={(e) => setEditFront(e.target.value)}
              rows={3}
            />
          </FormField>

          <FormField label="Back">
            <Textarea
              id={`flashcard-back-${card.id}`}
              value={editBack}
              onChange={(e) => setEditBack(e.target.value)}
              rows={3}
            />
          </FormField>

          <div className="flex items-center justify-end gap-[var(--nb-space-2)] pt-[var(--nb-space-2)]">
            {onEditToggle !== undefined ? (
              <Button variant="nb_btn_ghost" size="nb_btn_sm" onClick={onEditToggle}>
                Cancel
              </Button>
            ) : null}
            <Button variant="nb_btn_primary" size="nb_btn_sm" onClick={handleSave}>
              Save
            </Button>
          </div>
        </Card>
      );
    }

    return (
      <Card
        ref={ref}
        role="region"
        tabIndex={0}
        aria-label={`Flashcard: ${flipped ? "Back side" : "Front side"}`}
        onKeyDown={handleKeyDown}
        className={cn(
          "grid min-h-[var(--nb-size-composer-min)] grid-rows-[auto_1fr_auto] gap-[var(--nb-space-3)] transition-shadow duration-[var(--nb-dur-base)] hover:border-[var(--nb-edge)] focus-visible:outline-solid focus-visible:outline-[length:var(--nb-ring-width)] focus-visible:outline-[var(--nb-focus)]",
          className
        )}
        {...props}
      >
        {/* Top Header: Side Indicator + Status + Edit Affordance */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-[var(--nb-space-2)]">
            <Badge
              variant="default"
              icon={<FlipHorizontal size={16} weight="bold" aria-hidden="true" />}
            >
              {flipped ? "Back" : "Front"}
            </Badge>
            {isKnown === true ? (
              <Badge variant="ok" icon={<CheckCircle size={16} weight="fill" aria-hidden="true" />}>
                Known
              </Badge>
            ) : isKnown === false ? (
              <Badge variant="warn" icon={<XCircle size={16} weight="fill" aria-hidden="true" />}>
                Still learning
              </Badge>
            ) : null}
          </div>

          <div className="flex items-center gap-[var(--nb-space-1)]">
            {onEditToggle !== undefined ? (
              <IconButton
                variant="nb_btn_ghost"
                size="nb_btn_icon_sm"
                icon={PencilSimple}
                onClick={onEditToggle}
                aria-label="Edit card"
              />
            ) : null}
          </div>
        </div>

        {/* Content Body */}
        <div
          onClick={onFlip}
          className="flex cursor-pointer flex-col items-center justify-center p-[var(--nb-space-4)] text-center select-none"
        >
          <p className="font-[family-name:var(--nb-font-read)] text-[length:var(--nb-text-lg)] leading-[var(--nb-leading-read)] text-[var(--nb-ink)]">
            {flipped ? card.back : card.front}
          </p>
        </div>

        {/* Bottom Actions: Known / Unknown + Flip trigger */}
        <div className="flex flex-wrap items-center justify-between gap-[var(--nb-space-2)] border-t border-[var(--nb-hairline)] pt-[var(--nb-space-2)]">
          <div className="flex items-center gap-[var(--nb-space-2)]">
            {onMarkUnknown !== undefined ? (
              <Button
                variant="nb_btn_ghost"
                size="nb_btn_sm"
                onClick={onMarkUnknown}
                aria-label="Mark as unknown"
                leadingIcon={XCircle}
                className="text-[var(--nb-warn)] hover:bg-[var(--nb-warn-wash)]"
              >
                Still learning
              </Button>
            ) : null}
            {onMarkKnown !== undefined ? (
              <Button
                variant="nb_btn_ghost"
                size="nb_btn_sm"
                onClick={onMarkKnown}
                aria-label="Mark as known"
                leadingIcon={CheckCircle}
                className="text-[var(--nb-ok)] hover:bg-[var(--nb-ok-wash)]"
              >
                Mark as known
              </Button>
            ) : null}
          </div>

          {onFlip !== undefined ? (
            <Button
              variant="nb_btn_secondary"
              size="nb_btn_sm"
              onClick={onFlip}
              aria-label="Flip card"
              leadingIcon={FlipHorizontal}
            >
              Flip
            </Button>
          ) : null}
        </div>
      </Card>
    );
  }
);

Flashcard.displayName = "Flashcard";
